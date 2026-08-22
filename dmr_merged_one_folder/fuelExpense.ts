export type FuelSourceType = "TRIP" | "MANUAL";
export type FuelUiStatus = "Pending" | "Approved" | "Rejected";

export interface FuelExpense {
  id: string;
  billNo: string;
  date: string;
  sourceType?: FuelSourceType;
  vehicleId: number;
  vehicleNo: string;
  driverId: number;
  driverName: string;
  supervisorId: number;
  supervisorName: string;
  tripId?: number | null;
  tripNo?: string | null;
  meterReading: number;
  amount: number;
  rate: number;
  litres: number;
  petrolBunk: string;
  remarks?: string;
  gpsLat?: number | null;
  gpsLon?: number | null;
  gpsAccuracy?: number | null;
  gpsCapturedAt?: string | null;
  status: FuelUiStatus;
  createdDate: string;
  createdBy: string;
  approvedDate?: string;
  approvedBy?: string;
  updatedDate?: string;
  image?: string;
  imageName?: string;
  synced?: boolean;
}

export type FuelExpenseDraft = Omit<
  FuelExpense,
  "id" | "billNo" | "createdDate" | "createdBy" | "status" | "sourceType"
>;
