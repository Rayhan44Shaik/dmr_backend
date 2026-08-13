import type { AdvanceLoan, AttendanceRecord, DutyAssignment, LeaveRequest, SalaryRecord } from "../types/models.js";
export declare const staffService: {
    listDuties(fromDate?: string, toDate?: string, department?: string): Promise<DutyAssignment[]>;
    upsertDuty(body: Omit<DutyAssignment, "id"> & {
        id?: string;
    }): Promise<DutyAssignment>;
    deleteDuty(id: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
    listLeaves(status?: string): Promise<LeaveRequest[]>;
    createLeave(body: Omit<LeaveRequest, "id" | "createdAt" | "status"> & {
        status?: LeaveRequest["status"];
    }): Promise<LeaveRequest>;
    updateLeaveStatus(id: string, status: LeaveRequest["status"], opts?: {
        approvedBy?: string;
        rejectionReason?: string;
    }): Promise<LeaveRequest>;
    listSalaries(month?: string, department?: string): Promise<SalaryRecord[]>;
    upsertSalary(body: Partial<SalaryRecord> & {
        employeeId: number;
        month: string;
        employeeName: string;
    }): Promise<SalaryRecord>;
    listAdvances(type?: string, status?: string): Promise<AdvanceLoan[]>;
    createAdvance(body: Omit<AdvanceLoan, "id">): Promise<AdvanceLoan>;
    listAttendance(month?: string, department?: string): Promise<AttendanceRecord[]>;
    upsertAttendance(body: AttendanceRecord): Promise<AttendanceRecord>;
};
