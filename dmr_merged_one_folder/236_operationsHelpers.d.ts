import type { PoolClient } from "pg";
export declare function nextDocNo(clientOrNull: PoolClient | null, prefix: string, table: string, column: string, date?: Date): Promise<string>;
export declare function computeTripExpense(row: {
    fuel?: number | null;
    pickupTolls?: number | null;
    deliveryTolls?: number | null;
    destinationTolls?: number | null;
    meals?: number | null;
    mealsTiffin?: number | null;
    driverBata?: number | null;
    helperBata?: number | null;
    loading?: number | null;
    vehicleMaintenance?: number | null;
    othersRC?: number | null;
    others1Amt?: number | null;
    others2Amt?: number | null;
    others3Amt?: number | null;
    others4Amt?: number | null;
    others5Amt?: number | null;
    expense?: number | null;
}): {
    diesel: number;
    toll: number;
    food: number;
    driverBata: number;
    helperBata: number;
    otherExpenses: number;
    totalTripExpense: number;
};
