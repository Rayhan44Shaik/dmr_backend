import { query } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";

type Kind = "drivers" | "supervisors";
type Params = { fromDate: string; toDate: string; search?: string; personId?: number };
type TripRow = Record<string, unknown>;

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const s = (value: unknown) => value == null ? "" : String(value);
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const dateOnly = (value: unknown) => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : s(value).slice(0, 10);

function validate(params: Params) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(params.fromDate) || !iso.test(params.toDate)) throw new AppError(400, "fromDate and toDate must use YYYY-MM-DD");
  const from = Date.parse(`${params.fromDate}T00:00:00Z`);
  const to = Date.parse(`${params.toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new AppError(400, "fromDate must be on or before toDate");
  if ((to - from) / 86_400_000 > 366) throw new AppError(400, "Performance date range cannot exceed 366 days");
  if (params.personId != null && (!Number.isInteger(params.personId) || params.personId <= 0)) throw new AppError(400, "Invalid employee id");
}

function monday(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
  return value.toISOString().slice(0, 10);
}

function recent(row: TripRow) {
  return {
    tripNo: s(row.trip_no), tripDate: dateOnly(row.trip_date), vehicleNo: s(row.vehicle_no),
    totalShops: n(row.total_shops), totalBirdsDelivered: n(row.total_birds_delivered),
    totalDeliveredWeight: n(row.total_delivered_weight), totalMortality: n(row.total_mortality_count),
    weightLoss: n(row.weight_loss), totalKm: n(row.total_km),
  };
}

// Driver maintenance-KPI source decision (P2 closure, business-confirmed):
// the driver KPI uses trip-attributed `trips.vehicle_maintenance` because it is
// the only maintenance figure attributable to a driver trip. The Fleet ledger
// (`fleet_maintenance.total_cost`) is vehicle-level, approval-gated
// (Draft/Pending Approval/Approved) and keyed by vehicle/driver without a trip
// link, so mixing it into per-driver cost would double-count and leak
// unapproved entries. Fleet remains the system of record for vehicle
// maintenance; Staff only reads trip-sourced aggregates.
async function load(kind: Kind, params: Params): Promise<TripRow[]> {
  validate(params);
  const idColumn = kind === "drivers" ? "t.driver_id" : "t.supervisor_id";
  const nameColumn = kind === "drivers" ? "t.driver_name" : "t.supervisor_name";
  const values: unknown[] = [params.fromDate, params.toDate];
  const filters = ["t.deleted = FALSE", "t.trip_date BETWEEN $1 AND $2", `${idColumn} IS NOT NULL`];
  if (params.personId != null) { values.push(params.personId); filters.push(`${idColumn} = $${values.length}`); }
  if (params.search?.trim()) { values.push(`%${params.search.trim()}%`); filters.push(`${nameColumn} ILIKE $${values.length}`); }
  const result = await query(
    `SELECT t.*, e.status AS employee_status,
            COALESCE(d.fuel_litres,0) AS fuel_litres, COALESCE(d.fuel_cost,0) AS fuel_cost
       FROM trips t
       LEFT JOIN employees e ON e.id = ${idColumn}
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(litres),0) fuel_litres,
                COALESCE(SUM(COALESCE(litres,0) * COALESCE(rate,0)),0) fuel_cost
           FROM trip_diesel_entries WHERE trip_id=t.id
       ) d ON TRUE
      WHERE ${filters.join(" AND ")}
      ORDER BY t.trip_date DESC, t.id DESC`, values
  );
  return result.rows;
}

export const staffPerformanceService = {
  async drivers(params: Params) {
    const trips = await load("drivers", params);
    const groups = new Map<number, TripRow[]>();
    for (const trip of trips) { const id=n(trip.driver_id); groups.set(id, [...(groups.get(id) ?? []), trip]); }
    const rows = [...groups.entries()].map(([driverId, items]) => {
      const distance=items.reduce((a,r)=>a+n(r.total_km),0), fuelLitres=items.reduce((a,r)=>a+n(r.fuel_litres),0);
      const fuelCost=items.reduce((a,r)=>a+n(r.fuel_cost),0), maintenanceCost=items.reduce((a,r)=>a+n(r.vehicle_maintenance),0);
      const tollCost=items.reduce((a,r)=>a+n(r.pickup_tolls)+n(r.delivery_tolls)+n(r.destination_tolls),0);
      const otherCost=items.reduce((a,r)=>a+n(r.meals)+n(r.loading)+n(r.meals_tiffin)+n(r.others_rc)+n(r.others1_amt)+n(r.others2_amt)+n(r.others3_amt)+n(r.others4_amt)+n(r.others5_amt),0);
      const totalCost=fuelCost+maintenanceCost+tollCost+otherCost;
      return { driverId, driverName:s(items[0].driver_name), employeeStatus:s(items[0].employee_status), trips:items.length,
        distance:round(distance), avgDistancePerTrip:round(distance/items.length), vehicles:new Set(items.map(r=>n(r.vehicle_id)).filter(Boolean)).size,
        vehicleNos:[...new Set(items.map(r=>s(r.vehicle_no)).filter(Boolean))], fuelLitres:round(fuelLitres,3), fuelCost:round(fuelCost),
        maintenanceCost:round(maintenanceCost), tollCost:round(tollCost), otherCost:round(otherCost), totalCost:round(totalCost),
        costPerKm:distance ? round(totalCost/distance) : 0, mileage:fuelLitres ? round(distance/fuelLitres) : 0 };
    });
    const sum=(key:keyof typeof rows[number])=>rows.reduce((a,r)=>a+n(r[key]),0);
    const distance=sum("distance"), fuelLitres=sum("fuelLitres"), totalCost=sum("totalCost");
    const weeklyMap=new Map<string,{week:string;trips:number;distance:number;fuelLitres:number}>();
    for(const trip of trips){const week=monday(dateOnly(trip.trip_date));const x=weeklyMap.get(week)??{week,trips:0,distance:0,fuelLitres:0};x.trips++;x.distance+=n(trip.total_km);x.fuelLitres+=n(trip.fuel_litres);weeklyMap.set(week,x);}
    let detail=null;
    if(params.personId!=null){const items=groups.get(params.personId)??[];const vehicleGroups=new Map<string,TripRow[]>();for(const t of items){const key=s(t.vehicle_no)||"Unassigned";vehicleGroups.set(key,[...(vehicleGroups.get(key)??[]),t]);}
      detail={avgDistancePerTrip:items.length?round(items.reduce((a,r)=>a+n(r.total_km),0)/items.length):0,vehicles:[...vehicleGroups.entries()].map(([vehicleNo,vs])=>{const d=vs.reduce((a,r)=>a+n(r.total_km),0),l=vs.reduce((a,r)=>a+n(r.fuel_litres),0),f=vs.reduce((a,r)=>a+n(r.fuel_cost),0),m=vs.reduce((a,r)=>a+n(r.vehicle_maintenance),0);return{vehicleNo,trips:vs.length,distance:round(d),avgDistancePerTrip:round(d/vs.length),fuelLitres:round(l,3),fuelCost:round(f),maintenanceCost:round(m),totalCost:round(f+m),mileage:l?round(d/l):0};}),recentTrips:items.slice(0,10).map(recent)};}
    return {fromDate:params.fromDate,toDate:params.toDate,kpis:{drivers:rows.length,trips:trips.length,distance:round(distance),avgDistancePerTrip:trips.length?round(distance/trips.length):0,fuelLitres:round(fuelLitres,3),fuelCost:round(sum("fuelCost")),maintenanceCost:round(sum("maintenanceCost")),tollCost:round(sum("tollCost")),otherCost:round(sum("otherCost")),totalCost:round(totalCost),costPerKm:distance?round(totalCost/distance):0,mileage:fuelLitres?round(distance/fuelLitres):0},weekly:[...weeklyMap.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(x=>({...x,distance:round(x.distance),fuelLitres:round(x.fuelLitres,3)})),rows,detail};
  },

  async supervisors(params: Params) {
    const trips=await load("supervisors",params);const groups=new Map<number,TripRow[]>();for(const t of trips){const id=n(t.supervisor_id);groups.set(id,[...(groups.get(id)??[]),t]);}
    const rows=[...groups.entries()].map(([supervisorId,items])=>{const birds=items.reduce((a,r)=>a+n(r.total_birds_delivered),0),mortality=items.reduce((a,r)=>a+n(r.total_mortality_count),0);return{supervisorId,supervisorName:s(items[0].supervisor_name),employeeStatus:s(items[0].employee_status),trips:items.length,shops:items.reduce((a,r)=>a+n(r.total_shops),0),birds,weight:round(items.reduce((a,r)=>a+n(r.total_delivered_weight),0),3),mortality,mortalityRate:birds?round(mortality/birds*100):0,weightLoss:round(items.reduce((a,r)=>a+n(r.weight_loss),0),3)};});
    const sum=(key:keyof typeof rows[number])=>rows.reduce((a,r)=>a+n(r[key]),0);const birds=sum("birds"),mortality=sum("mortality");
    const weeklyMap=new Map<string,{week:string;trips:number;birds:number;weight:number;mortality:number;weightLoss:number}>();for(const t of trips){const week=monday(dateOnly(t.trip_date));const x=weeklyMap.get(week)??{week,trips:0,birds:0,weight:0,mortality:0,weightLoss:0};x.trips++;x.birds+=n(t.total_birds_delivered);x.weight+=n(t.total_delivered_weight);x.mortality+=n(t.total_mortality_count);x.weightLoss+=n(t.weight_loss);weeklyMap.set(week,x);}
    return{fromDate:params.fromDate,toDate:params.toDate,kpis:{supervisors:rows.length,trips:trips.length,shops:sum("shops"),birds,weight:round(sum("weight"),3),mortality,mortalityRate:birds?round(mortality/birds*100):0,weightLoss:round(sum("weightLoss"),3)},weekly:[...weeklyMap.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(x=>({...x,weight:round(x.weight,3),weightLoss:round(x.weightLoss,3)})),rows,detail:params.personId!=null?{recentTrips:(groups.get(params.personId)??[]).slice(0,10).map(recent)}:null};
  }
};
