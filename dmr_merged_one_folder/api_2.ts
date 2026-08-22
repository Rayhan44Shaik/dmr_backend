/** Central Fleet API surface. No production entity uses browser storage here. */
export { maintenanceApi } from './maintenanceApi';
export type { MaintenanceListParams, MaintenanceDocumentMetadata } from './maintenanceApi';
export { permitApi } from './permitApi';
export type { PermitSummary, PermitUpsertPayload } from './permitApi';
export { emiApi } from './emiApi';
export type { EmiListParams } from './emiApi';
export { buildEmiOverview, computeKpis, getEmiSchedule } from './emiService';
