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
    emiDay?: number | null;
    totalEMIs?: number | null;
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
    shopNumber: string;
    shopName: string;
    ownerName: string;
    phoneNumber: string;
    secondaryPhoneNumber: string;
    whatsappNumber: string;
    email: string;
    city: string;
    /** Compatibility alias retained for operational consumers during migration. */
    village: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    paperRate: number;
    associationType: string;
    status: ActiveStatus;
    openingBalance: number;
    currentBalance: number;
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
    category: "Bird" | "Fuel Bunk";
    ownerName: string;
    mobileNumber: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    status: ActiveStatus;
}
export interface Route {
    id: number;
    routeNo: number;
    routeName: string;
    routeCode: string;
    description: string;
    status: ActiveStatus;
}
export interface MarketRate {
    id: number;
    businessDate: string;
    vij: number;
    gun: number;
    rp: number;
    sneha: number;
    vencobRate: number;
    vencobVii: number;
    vencobGun: number;
    associationVii: number;
    c17: number;
    c15: number;
    c13: number;
    c12: number;
    c10: number;
    createdBy?: string | null;
    updatedBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}
export interface BoxDetail {
    boxNo: number;
    birds: number;
    weight: number;
    avgWeight?: number | null;
    legId?: number | null;
}
/** One Farm→Pickup→Deliveries cycle on the same Draft trip (max 4). */
export interface TripLeg {
    id: number;
    tripId: number;
    legIndex: number;
    sourceFarmId: number | null;
    sourceFarm: string | null;
    reachedTime: string | null;
    destMeter: number | null;
    pickupTolls: number;
    farmAddress: string | null;
    avgBirdWeight: number | null;
    farmRemarks: string | null;
    farmBirdTypeId: number | null;
    farmBirdType: string | null;
    farmBirdCount: number | null;
    farmLoadWeight: number | null;
    farmRate: number | null;
    farmAmount: number | null;
    farmGpsLat: number | null;
    farmGpsLon: number | null;
    farmGpsAccuracy: number | null;
    farmGpsTime: string | null;
    farmStepSubmitted: boolean;
    farmStepSubmittedAt: string | null;
    dcWeight: number;
    totalBirds: number;
    boxes: number;
    avgWeight: number;
    pickupLoadTime: string | null;
    dcPhotoKey: string | null;
    pickupStepSubmitted: boolean;
    pickupStepSubmittedAt: string | null;
    deliveryStepSubmitted: boolean;
    deliveriesStepSubmittedAt: string | null;
    boxDetails?: BoxDetail[];
    deliveries?: ShopDelivery[];
}
export interface TripLoadSummary {
    load: number;
    birds: number;
    weight: number;
    mortality: number;
    mortalityWeight: number;
    weightLoss: number;
    shops: number;
}
export interface ShopDelivery {
    id: number;
    serialNo?: number | null;
    boxNo?: number | null;
    legId?: number | null;
    shopId: number | null;
    shopName: string;
    subShopName?: string;
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
    /** Stable client-generated idempotency key (Step 4 per-shop save). */
    clientKey?: string | null;
}
export interface DieselEntry {
    id?: number;
    rowIndex: number;
    litres?: number | null;
    rate?: number | null;
    meter?: number | null;
    bunkName?: string | null;
    bunkSource?: "MASTER" | "OTHER";
    fuelBunkId?: number | null;
    bunkGps?: string | null;
    imageData?: string | null;
    imageName?: string | null;
    clientKey?: string | null;
    gpsLat?: number | null;
    gpsLon?: number | null;
    gpsAccuracy?: number | null;
    gpsCapturedAt?: string | null;
    submitted?: boolean;
    submittedAt?: string | null;
}
export interface Trip {
    id: number;
    tripNo: string;
    tripDate: string;
    status: TripStatus;
    /** Number of Farm→Pickup→Delivery loads on this trip (1–3). */
    legCount?: number;
    /** Active load index (1–3) for the wizard form overlay. */
    activeLegIndex?: number;
    /** All loads; Step 1 / Step 5 remain trip-level. */
    legs?: TripLeg[];
    startTime: string | null;
    vehicleId: number | null;
    vehicleNo: string | null;
    /** From Vehicle Master `no_of_boxes` — used by Pickup Step 3 capacity UI. */
    vehicleBoxCapacity?: number | null;
    driverId: number | null;
    driverName: string | null;
    supervisorId: number | null;
    supervisorName: string | null;
    helpers: string[];
    loaders: string[];
    openingMeter: number | null;
    advanceAmount: number | null;
    startStepSubmitted: boolean;
    startStepSubmittedAt: string | null;
    sourceFarmId: number | null;
    sourceFarm: string | null;
    reachedTime: string | null;
    destMeter: number | null;
    pickupTolls: number;
    farmAddress?: string | null;
    avgBirdWeight?: number | null;
    farmRemarks?: string | null;
    farmBirdTypeId?: number | null;
    farmBirdType?: string | null;
    farmBirdCount?: number | null;
    farmLoadWeight?: number | null;
    farmRate?: number | null;
    farmAmount?: number | null;
    /** Settlement fields from Accounts → Farmer Payments (read-only for trip wizard). */
    farmPaidAmount?: number | null;
    farmPaymentDate?: string | null;
    farmPaymentMode?: string | null;
    farmPaymentReference?: string | null;
    farmCompletedTrips?: number | null;
    farmGpsLat?: number | null;
    farmGpsLon?: number | null;
    farmGpsAccuracy?: number | null;
    farmGpsTime?: string | null;
    farmStepSubmitted: boolean;
    farmStepSubmittedAt: string | null;
    dcWeight: number;
    totalBirds: number;
    boxes: number;
    avgWeight: number;
    pickupLoadTime: string | null;
    boxDetails: BoxDetail[];
    dcPhotoKey?: string | null;
    dcPhotoKey2?: string | null;
    pickupStepSubmitted: boolean;
    pickupStepSubmittedAt: string | null;
    deliveries: ShopDelivery[];
    deliveryStepSubmitted: boolean;
    deliveriesStepSubmittedAt: string | null;
    closingMeter: number | null;
    endMeter?: number | null;
    endTime: string | null;
    /** Proactive meter-lock state (detail reads): meters render read-only when true. */
    meterLocked?: boolean;
    /** Lock reason when meterLocked (locking event kind + ref). */
    meterLockReason?: {
        kind: "trip" | "maintenance" | "fuel";
        ref: string;
        eventDate: string;
        approvedAt: string | null;
    } | null;
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
    others2Name?: string;
    others3Name?: string;
    others4Name?: string;
    others5Name?: string;
    dieselEntries?: DieselEntry[];
    fuel: number;
    expense: number;
    driverBata?: number;
    helperBata?: number;
    totalTripExpense?: number;
    remarks: string;
    submittedAt?: string | null;
    endStepSubmitted: boolean;
    expensesStepSubmitted: boolean;
    expensesStepSubmittedAt: string | null;
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
    approvedAt?: string | null;
    rejectedBy?: string | null;
    rejectedAt?: string | null;
    rejectedReason?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    stepStatuses?: TripStepStatuses;
}
/** List-view DTO: scalar trip fields + resume metadata (no nested hydration). */
export type TripStepStatus = "completed" | "saved" | "not_started";
export interface TripStepStatuses {
    start: TripStepStatus;
    farm: TripStepStatus;
    pickup: TripStepStatus;
    deliveries: TripStepStatus;
    expenses: TripStepStatus;
}
export interface TripSummary extends Trip {
    /** Step-2-submitted loads, visible immediately in Recent Trips. */
    submittedLoadCount: number;
    /** Step-4-submitted load totals used by Recent Trips and its tooltips. */
    loadSummaries: TripLoadSummary[];
    resumeStep: "start" | "farm" | "pickup" | "deliveries" | "expenses" | null;
    resumeStepLabel: string | null;
    wizardProgress: {
        start: boolean;
        farm: boolean;
        pickup: boolean;
        deliveries: boolean;
        expenses: boolean;
        completedSteps: number;
        totalSteps: number;
        percentComplete: number;
    };
}
export interface DutyAssignment {
    id: string;
    employeeId: number;
    employeeName: string;
    department: string;
    role: string;
    dutyType: "Driver" | "Delivery" | "Rest" | "Repair" | "Office" | "OfficeDuty" | "Collection" | "WeeklyOff";
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
    status: "Pending" | "Approved" | "Rejected" | "Cancelled";
    reason?: string | null;
    rejectionReason?: string | null;
    createdAt: string;
    approvedBy?: string | null;
    approvedAt?: string | null;
    /** Joined from employees for reporting/table display (never stored on leave). */
    employeeNo?: number | null;
    department?: string | null;
}
export interface SalaryRecord {
    id: string;
    employeeId: number;
    employeeName: string;
    department: string;
    month: string;
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
    status: "Pending" | "Submitted" | "Paid";
    paymentDate?: string | null;
    /** Accounts payment number (PAY-...) written by the payment operation. */
    paymentRef?: string | null;
    /** TIMESTAMPTZ of the Pending → Paid transition (payment operation). */
    paidAt?: string | null;
    /** TIMESTAMPTZ + actor of the Draft → Submitted (frozen) transition. */
    submittedAt?: string | null;
    submittedBy?: string | null;
    createdAt: string;
    /** Derived at read time from the authoritative Duty Planner attendance
     *  summary (duty_assignments + approved leave) — never stored. */
    workingDays?: number;
    presentDays?: number;
    leaveDays?: number;
    weeklyOffDays?: number;
    /** True when every record for this payroll month is Paid with an expired
     *  correction window (derived by the service at read time — never stored).
     *  Closed months reject all mutations. */
    monthClosed?: boolean;
    /** Whole calendar days left in the 7-day correction window measured from
     *  paid_at (0 when expired). null unless the record is Paid. Derived by the
     *  service at read time so the UI never computes the window itself. */
    correctionWindowDaysRemaining?: number | null;
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
