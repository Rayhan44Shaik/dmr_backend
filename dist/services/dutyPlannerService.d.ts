import type { DutyAssignment } from "../types/models.js";
export type DutyType = DutyAssignment["dutyType"];
export interface DutyWeek {
    weekStart: string;
    weekEnd: string;
    status: string;
    lockReason?: string;
    days: {
        date: string;
        weekday: string;
    }[];
    employees: {
        id: number;
        employeeNo: number;
        name: string;
        department: string;
        role: string;
        status: string;
        license: string;
        active: boolean;
        onApprovedLeave: string[];
    }[];
    assignments: DutyAssignment[];
    perEmployee: Record<number, {
        worked: number;
        delivery: number;
        repair: number;
        office: number;
        collection: number;
        weeklyOff: number;
        leave: number;
        weekOffDay: string | null;
    }>;
    vehicles: {
        id: number;
        vehicleNo: string;
        vehicleNumber: string;
        active: boolean;
    }[];
    trips: {
        id: number;
        tripNo: string;
        tripDate: string;
        vehicleId: number | null;
        driverId: number | null;
        supervisorId: number | null;
    }[];
    maintenance: {
        id: number;
        vehicleId: number | null;
        vehicleNumber: string;
        serviceDate: string;
        serviceType: string;
        status: string;
    }[];
    saturday: {
        required: number;
        assigned: number;
        shortage: number;
        status: string;
        requiredByRole: Record<string, number>;
        assignedByRole: Record<string, number>;
        availableByRole: Record<string, number>;
    };
    validation: {
        ok: boolean;
        problems: string[];
    };
}
export interface PlanRow {
    employeeId: number;
    employeeName: string;
    department: string;
    role: string;
    date: string;
    dutyType: DutyType;
    vehicleId?: number | null;
    vehicleNo?: string | null;
    proposed: boolean;
}
export interface AutoPlan {
    employeesAffected: number;
    delivery: number;
    repair: number;
    office: number;
    collection: number;
    weeklyOff: number;
    saturdayRequired: number;
    saturdayAssigned: number;
    saturdayShortage: number;
    conflicts: string[];
    rows: PlanRow[];
}
interface AssignmentInput {
    employeeId: number;
    employeeName?: string;
    department?: string;
    role?: string;
    dutyType: DutyType;
    date: string;
    vehicleId?: number | null;
    vehicleNo?: string | null;
}
export declare function validateAssignment(input: AssignmentInput, opts?: {
    ignoreId?: string;
}): Promise<void>;
export declare function getDutyWeek(weekStart: string): Promise<DutyWeek>;
export declare function autoAssignPreview(weekStart: string): Promise<AutoPlan>;
export declare function autoAssignApply(weekStart: string, plan?: AutoPlan, changedBy?: string): Promise<DutyWeek>;
export declare function upsertDuty(body: AssignmentInput & {
    id?: string;
}, changedBy?: string): Promise<DutyWeek>;
export declare function deleteDuty(id: string, changedBy?: string): Promise<DutyWeek>;
export declare function submitWeek(weekStart: string, submittedBy?: string): Promise<DutyWeek>;
export declare function getWeekStatus(weekStart: string): Promise<{
    weekStart: string;
    weekEnd: string;
    status: any;
}>;
export declare function getAttendanceSummary(month: string): Promise<{
    month: string;
    rows: {
        employeeId: number;
        employeeName: string;
        department: string;
        dayMarks: Record<string, string>;
        presentCount: number;
        absentCount: number;
        leaveCount: number;
        halfDayCount: number;
        weeklyOffCount: number;
        workingDays: number;
    }[];
}>;
export declare function getEmployeeHistory(employeeId: number): Promise<{
    employeeId: number;
    duties: {
        date: string | null;
        dutyType: string;
        vehicleNo: any;
        department: string;
        role: string;
    }[];
    leaves: {
        from: string | null;
        to: string | null;
        status: string;
    }[];
    trips: {
        tripNo: string;
        tripDate: string | null;
        vehicleNo: any;
        status: string;
    }[];
    repairs: {
        date: string | null;
        serviceType: string;
        vehicleNo: any;
        status: string;
    }[];
    advances: {
        type: string;
        principal: number;
        issuedDate: string | null;
        status: string;
    }[];
}>;
export declare const dutyPlannerService: {
    getDutyWeek: typeof getDutyWeek;
    getWeekStatus: typeof getWeekStatus;
    validateAssignment: typeof validateAssignment;
    autoAssignPreview: typeof autoAssignPreview;
    autoAssignApply: typeof autoAssignApply;
    upsertDuty: typeof upsertDuty;
    deleteDuty: typeof deleteDuty;
    submitWeek: typeof submitWeek;
    getAttendanceSummary: typeof getAttendanceSummary;
    getEmployeeHistory: typeof getEmployeeHistory;
};
export {};
