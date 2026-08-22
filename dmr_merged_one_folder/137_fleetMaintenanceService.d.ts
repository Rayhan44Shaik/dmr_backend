import type { FleetMaintenance, FleetMaintenanceDocument } from "../types/fleet.js";
import { type PaginatedResult, type PaginationParams } from "../utils/pagination.js";
/** Raw multer file shape accepted from the route layer. */
interface RawUploadedFile {
    originalname: string;
    buffer: Buffer;
    size?: number;
}
export declare const fleetMaintenanceService: {
    list(filters?: {
        vehicleId?: number;
        driverId?: number;
        fromDate?: string;
        toDate?: string;
        status?: string;
        search?: string;
        includeDeleted?: boolean;
        latestApproved?: boolean;
        pagination?: PaginationParams | null;
    }): Promise<FleetMaintenance[] | PaginatedResult<FleetMaintenance>>;
    getById(id: number): Promise<FleetMaintenance>;
    create(body: unknown, documents?: RawUploadedFile[]): Promise<FleetMaintenance>;
    update(id: number, body: unknown, documents?: RawUploadedFile[]): Promise<FleetMaintenance>;
    approve(id: number, body: unknown): Promise<FleetMaintenance>;
    reject(id: number, body: unknown): Promise<FleetMaintenance>;
    softDelete(id: number, reason?: string): Promise<FleetMaintenance>;
    listDocuments(maintenanceId: number): Promise<FleetMaintenanceDocument[]>;
    getDocumentBinary(maintenanceId: number, documentId: number): Promise<{
        buffer: Buffer;
        mimeType: string;
        fileName: string;
    }>;
    deleteDocument(maintenanceId: number, documentId: number): Promise<{
        id: number;
        maintenanceId: number;
    }>;
};
export {};
