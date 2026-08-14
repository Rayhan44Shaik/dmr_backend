/** Fleet module request validation (Fleet → Entry / History). */
import { z } from "zod";
import { parseBody } from "./operations.js";
export declare const fleetMaintenancePartSchema: z.ZodObject<{
    name: z.ZodString;
    specification: z.ZodOptional<z.ZodString>;
    quantity: z.ZodDefault<z.ZodNumber>;
    rate: z.ZodDefault<z.ZodNumber>;
    amount: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    rate: number;
    name: string;
    quantity: number;
    amount?: number | undefined;
    specification?: string | undefined;
}, {
    name: string;
    rate?: number | undefined;
    amount?: number | undefined;
    specification?: string | undefined;
    quantity?: number | undefined;
}>;
export declare const fleetMaintenanceBodySchema: z.ZodObject<{
    date: z.ZodEffects<z.ZodString, string, string>;
    vehicleId: z.ZodNumber;
    vehicleNo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    driverId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    driverName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    currentKM: z.ZodNumber;
    nextServiceKM: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    maintenanceType: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    serviceType: z.ZodString;
    garage: z.ZodOptional<z.ZodString>;
    mechanic: z.ZodOptional<z.ZodString>;
    parts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        specification: z.ZodOptional<z.ZodString>;
        quantity: z.ZodDefault<z.ZodNumber>;
        rate: z.ZodDefault<z.ZodNumber>;
        amount: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        rate: number;
        name: string;
        quantity: number;
        amount?: number | undefined;
        specification?: string | undefined;
    }, {
        name: string;
        rate?: number | undefined;
        amount?: number | undefined;
        specification?: string | undefined;
        quantity?: number | undefined;
    }>, "many">>;
    totalCost: z.ZodOptional<z.ZodNumber>;
    remarks: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    vehicleId: number;
    date: string;
    currentKM: number;
    maintenanceType: string | string[];
    serviceType: string;
    vehicleNo?: string | null | undefined;
    driverId?: number | null | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    driverName?: string | null | undefined;
    nextServiceKM?: number | null | undefined;
    garage?: string | undefined;
    mechanic?: string | undefined;
    parts?: {
        rate: number;
        name: string;
        quantity: number;
        amount?: number | undefined;
        specification?: string | undefined;
    }[] | undefined;
    totalCost?: number | undefined;
}, {
    vehicleId: number;
    date: string;
    currentKM: number;
    maintenanceType: string | string[];
    serviceType: string;
    vehicleNo?: string | null | undefined;
    driverId?: number | null | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    driverName?: string | null | undefined;
    nextServiceKM?: number | null | undefined;
    garage?: string | undefined;
    mechanic?: string | undefined;
    parts?: {
        name: string;
        rate?: number | undefined;
        amount?: number | undefined;
        specification?: string | undefined;
        quantity?: number | undefined;
    }[] | undefined;
    totalCost?: number | undefined;
}>;
/** Update body — everything optional; removeDocumentIds lets the caller
 * explicitly remove existing documents during an update (never silently). */
export declare const fleetMaintenanceUpdateSchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    vehicleId: z.ZodOptional<z.ZodNumber>;
    vehicleNo: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    driverId: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    driverName: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    currentKM: z.ZodOptional<z.ZodNumber>;
    nextServiceKM: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    maintenanceType: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    serviceType: z.ZodOptional<z.ZodString>;
    garage: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    mechanic: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    parts: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        specification: z.ZodOptional<z.ZodString>;
        quantity: z.ZodDefault<z.ZodNumber>;
        rate: z.ZodDefault<z.ZodNumber>;
        amount: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        rate: number;
        name: string;
        quantity: number;
        amount?: number | undefined;
        specification?: string | undefined;
    }, {
        name: string;
        rate?: number | undefined;
        amount?: number | undefined;
        specification?: string | undefined;
        quantity?: number | undefined;
    }>, "many">>>;
    totalCost: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    remarks: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    createdBy: z.ZodOptional<z.ZodOptional<z.ZodString>>;
} & {
    removeDocumentIds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
    vehicleNo?: string | null | undefined;
    vehicleId?: number | undefined;
    driverId?: number | null | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    driverName?: string | null | undefined;
    date?: string | undefined;
    currentKM?: number | undefined;
    nextServiceKM?: number | null | undefined;
    maintenanceType?: string | string[] | undefined;
    serviceType?: string | undefined;
    garage?: string | undefined;
    mechanic?: string | undefined;
    parts?: {
        rate: number;
        name: string;
        quantity: number;
        amount?: number | undefined;
        specification?: string | undefined;
    }[] | undefined;
    totalCost?: number | undefined;
    removeDocumentIds?: number[] | undefined;
}, {
    vehicleNo?: string | null | undefined;
    vehicleId?: number | undefined;
    driverId?: number | null | undefined;
    remarks?: string | null | undefined;
    createdBy?: string | undefined;
    driverName?: string | null | undefined;
    date?: string | undefined;
    currentKM?: number | undefined;
    nextServiceKM?: number | null | undefined;
    maintenanceType?: string | string[] | undefined;
    serviceType?: string | undefined;
    garage?: string | undefined;
    mechanic?: string | undefined;
    parts?: {
        name: string;
        rate?: number | undefined;
        amount?: number | undefined;
        specification?: string | undefined;
        quantity?: number | undefined;
    }[] | undefined;
    totalCost?: number | undefined;
    removeDocumentIds?: number[] | undefined;
}>;
export declare const fleetMaintenanceApproveSchema: z.ZodObject<{
    approvedBy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    approvedBy?: string | undefined;
}, {
    approvedBy?: string | undefined;
}>;
export declare const fleetMaintenanceRejectSchema: z.ZodObject<{
    rejectedBy: z.ZodOptional<z.ZodString>;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    rejectedBy?: string | undefined;
}, {
    reason: string;
    rejectedBy?: string | undefined;
}>;
export { parseBody };
