export interface MarketRateReference {
  shopId: number | null;
  shopName: string;
  birdTypeId: number | null;
  birdType: string;
  masterRate: number | null;
  lastTripRate: number | null;
  lastTripDate: string | null;
  lastTripNo: string | null;
  avgTripRate: number | null;
  tripRateSamples: number;
}

export interface ShopDelivery {
  id: number;
  serialNo?: number;
  boxNo: number;
  shopId: number;
  shopName: string;
  birdTypeId: number;
  birdType: string;
  birds: number;
  weight: number;
  mortality: number;
  mortKg?: number;
  rate: number | null;
  amount: number;
  remarks: string;
  deliveryMode?: "box" | "weight";
  selectedBoxIds?: number[];
  farmBirds?: number;
  farmWeight?: number;
  perBoxData?: PerBoxDelivery[];
  autoCaptureTime?: string;
  clientKey?: string;
  /** READ-ONLY market/reference rate resolved by the backend. */
  marketRate?: MarketRateReference | null;
}

export type TripStatus = "Draft" | "Pending" | "Completed" | "Deleted";

export interface BoxDetail {
  boxNo: number;
  birds: number;
  weight: number;
  avgWeight?: number | null;
}

export interface PerBoxDelivery {
  boxNo: number;
  birds: number;
  weight: number;
}

/**
 * Authoritative frontend Trip Entry shape shared by desktop and mobile.
 * Transport-only values remain optional so existing API adapters stay compatible.
 */
export interface Trip {
  id: number;
  tripNo: string;
  tripDate: string;

  startTime: string;
  vehicleId: number;
  vehicleNo: string;
  driverId: number;
  driverName: string;
  supervisorId: number;
  supervisorName: string;
  advanceAmount: number | null;
  helpers: string[];
  loaders?: string[];
  openingMeter: number | null;
  startStepSubmitted: boolean;

  sourceFarmId: number;
  sourceFarm: string;
  reachedTime: string;
  destMeter: number;
  pickupTolls: number;
  farmStepSubmitted: boolean;
  farmAddress?: string;
  avgBirdWeight?: number;
  farmGpsLat?: number | null;
  farmGpsLon?: number | null;
  farmGpsAccuracy?: number | null;
  farmGpsTime?: string | null;

  dcWeight: number;
  totalBirds: number;
  boxes: number;
  avgWeight: number;
  pickupLoadTime: string;
  pickupStepSubmitted: boolean;
  vehicleBoxCapacity?: number;
  boxNo: number;
  birds: number;
  weight: number;
  boxDetails: BoxDetail[];

  deliveries: ShopDelivery[];
  deliveryStepSubmitted: boolean;

  closingMeter: number;
  endTime: string;
  deliveryTolls: number;
  destinationTolls?: number;
  meals?: number;
  loading?: number;
  mealsTiffin?: number;
  vehicleMaintenance?: number;
  othersRC?: number;
  others1Amt?: number;
  others2Amt?: number;
  others3Amt?: number;
  others4Amt?: number;
  others5Amt?: number;
  submittedAtTimestamp?: string;
  endStepSubmitted?: boolean;
  expensesStepSubmitted?: boolean;
  dieselEntries?: Array<{
    id?: number;
    rowIndex: number;
    litres?: number | null;
    rate?: number | null;
    amount?: number | null;
    meter?: number | null;
    bunkName?: string | null;
    gpsLat?: number | null;
    gpsLon?: number | null;
    gpsAccuracy?: number | null;
    gpsCapturedAt?: string | null;
    imageData?: string | null;
    imageName?: string | null;
    submitted?: boolean;
    submittedAt?: string | null;
    clientKey?: string | null;
  }>;
  expensesStepSubmittedAt?: string;
  mileageKmL?: number | null;

  totalKm: number;
  totalShops: number;
  totalWeight: number;
  totalDeliveredWeight: number;
  totalBirdsDelivered: number;
  totalMortality: number;
  totalMortalityCount: number;
  totalMortalityWeight: number;
  weightLoss: number;
  survivalRate: number;
  lastShop: string;

  fuel: number;
  expense: number;
  remarks: string;
  status: TripStatus;
  rateCompleted?: boolean;

  rateLockedAt?: string | null;
  rateLockedBy?: string | null;
  ratesEntered?: number;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedReason?: string;
  dcPhotoKey?: string;
  dcPhotoMime?: string;
  dcPhotoData?: string;
  dcPhotoKey2?: string;
  dcPhotoMime2?: string;
  dcPhotoData2?: string;
  approvedBy?: string;
}
