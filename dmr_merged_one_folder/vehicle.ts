export type Vehicle = {
  id: number;
  vehicleNo: number;

  vehicleNumber: string;

  vehicleType: string;

  noOfBoxes: number;

  birdCapacity: number;

  capacityKg: number;

  trackingId: string;

  fastagBank: string;

  engineNumber: string;

  chassisNumber: string;

  insuranceExpiry: string;

  permitExpiry: string;

  fitnessExpiry: string;

  purchaseDate?: string;
  purchaseAmount?: number;
  emiStartDate?: string;
  emiDay?: number;
  totalEMIs?: number;
  rcDate?: string;

  /** Master-record status — the persisted backend contract is Active/Inactive only. */
  status: "Active" | "Inactive";
};