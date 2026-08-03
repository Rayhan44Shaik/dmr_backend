/** Shared API shapes aligned with frontend localStorage models */

export type ActiveStatus = "Active" | "Inactive";
export type EmployeeStatus = "Active" | "Inactive" | "Suspended";
export type TripStatus = "Draft" | "Pending" | "Completed" | "Deleted";

export interface Employee {
  id: number;
  employeeNo: number;
  employeeName: string;
  department: string;
  role: string;
  phoneNumber: string;
  email: string;
  address: string;
  joiningDate: string | null;
  aadharNumber?: string | null;
  licenseNumber?: string | null;
  salary: number;
  status: EmployeeStatus;
  avatar?: string | null;
}

export interface Vehicle {
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
  insuranceExpiry: string | null;
  permitExpiry: string | null;
  fitnessExpiry: string | null;
  purchaseDate?: string | null;
  purchaseAmount?: number | null;
  emiStartDate?: string | null;
  rcDate?: string | null;
  status: ActiveStatus;
}

export interface Farm {
  id: number;
  farmNo: number;
  farmName: string;
  ownerName: string;
  supervisorName: string;
  phoneNumber: string;
  village: string;
  address: string;
  capacity: number;
  status: ActiveStatus;
}

export interface Shop {
  id: number;
  shopNo: number;
  shopName: string;
  ownerName: string;
  phoneNumber: string;
  village: string;
  address?: string | null;
  status: ActiveStatus;
}

export interface Bank {
  id: number;
  bankNo: number;
  bankName: string;
  branch: string;
  accountNumber: string;
  ifscCode: string;
  upiId: string;
  status: ActiveStatus;
}

export interface BirdType {
  id: number;
  birdTypeNo: number;
  birdType: string;
  averageWeight: number;
  description: string;
  status: ActiveStatus;
}

export interface BoxDetail {
  boxNo: number;
  birds: number;
  weight: number;
}

export interface ShopDelivery {
  id: number;
  serialNo?: number | null;
  boxNo?: number | null;
  shopId: number | null;
  shopName: string;
  birdTypeId: number | null;
  birdType: string;
  birds: number;
  weight: number;
  mortality: number;
  mortKg?: number | null;
  rate: number | null;
  amount: number;
  remarks: string;
  deliveryMode?: "box" | "weight";
  selectedBoxIds?: number[];
  farmBirds?: number | null;
  farmWeight?: number | null;
  perBoxData?: BoxDetail[];
  autoCaptureTime?: string | null;
}

export interface DieselEntry {
  rowIndex: number;
  litres?: number | null;
  rate?: number | null;
  meter?: number | null;
  bunkName?: string | null;
  bunkGps?: string | null;
  imageData?: string | null;
  imageName?: string | null;
}

export interface Trip {
  id: number;
  tripNo: string;
  tripDate: string;
  status: TripStatus;

  startTime: string | null;
  vehicleId: number | null;
  vehicleNo: string | null;
  driverId: number | null;
  driverName: string | null;
  supervisorId: number | null;
  supervisorName: string | null;
  helpers: string[];
  loaders: string[];
  openingMeter: number | null;
  advanceAmount: number;
  startStepSubmitted: boolean;

  sourceFarmId: number | null;
  sourceFarm: string | null;
  reachedTime: string | null;
  destMeter: number | null;
  pickupTolls: number;
  farmAddress?: string | null;
  avgBirdWeight?: number | null;
  farmRemarks?: string | null;
  farmStepSubmitted: boolean;

  dcWeight: number;
  totalBirds: number;
  boxes: number;
  avgWeight: number;
  pickupLoadTime: string | null;
  boxDetails: BoxDetail[];
  dcPhotoKey?: string | null;
  pickupStepSubmitted: boolean;

  deliveries: ShopDelivery[];
  deliveryStepSubmitted: boolean;

  closingMeter: number | null;
  endMeter?: number | null;
  endTime: string | null;
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
  dieselEntries?: DieselEntry[];
  fuel: number;
  expense: number;
  remarks: string;
  submittedAt?: string | null;
  endStepSubmitted: boolean;
  expensesStepSubmitted: boolean;

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
  lastShop: string | null;
  rateCompleted: boolean;

  deleted: boolean;
  deletedReason?: string | null;
  approvedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DutyAssignment {
  id: string;
  employeeId: number;
  employeeName: string;
  department: string;
  role: string;
  dutyType: "Driver" | "Delivery" | "Rest" | "Repair" | "Office" | "WeeklyOff";
  date: string;
  vehicleId?: number | null;
  vehicleNo?: string | null;
}

export interface LeaveRequest {
  id: string;
  employeeId: number;
  employeeName: string;
  type: "Casual" | "Sick" | "Emergency" | "Annual";
  fromDate: string;
  toDate: string;
  days: number;
  status: "Pending" | "Approved" | "Rejected";
  reason?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface SalaryRecord {
  id: string;
  employeeId: number;
  employeeName: string;
  department: string;
  basicSalary: number;
  overtime: number;
  incentives: number;
  fuelAllowance: number;
  nightAllowance: number;
  totalGross: number;
  leaveDeduction: number;
  advanceRecovery: number;
  loanEMI: number;
  latePenalty: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  status: "Pending" | "Paid";
  paymentDate?: string | null;
  month: string;
  createdAt: string;
}

export interface AdvanceLoan {
  id: string;
  employeeId: number;
  employeeName: string;
  type: "Advance" | "Loan";
  principal: number;
  issuedDate: string;
  totalRepaid: number;
  monthlyDeduction: number;
  remainingBalance: number;
  status: "Active" | "Completed";
  interestRate?: number | null;
  tenure?: number | null;
}

export interface AttendanceRecord {
  employeeId: number;
  employeeName: string;
  department: string;
  month: string;
  dayMarks: Record<string, string>;
  presentCount: number;
  absentCount: number;
  leaveCount: number;
  halfDayCount: number;
}
