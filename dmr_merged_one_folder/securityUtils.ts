// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\utils\securityUtils.ts

import { StorageWrapper } from "../storage/storageWrapper";

export function sanitizeInput(input: string): string {
  if (!input) return "";
  return input
    .trim()
    .replace(/[&<>"']/g, (match) => {
      const map: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
      };
      return map[match] || match;
    });
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string | number;
  timestamp: string;
  userRole: string;
  details?: Record<string, unknown>;
}

export function logAuditEvent(
  action: string,
  entity: string,
  entityId?: string | number,
  details?: Record<string, unknown>
): void {
  const currentLogs = StorageWrapper.get<AuditLog[]>("audit_logs") || [];
  const newLog: AuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    action,
    entity,
    entityId,
    timestamp: new Date().toISOString(),
    userRole: StorageWrapper.get<string>("user_role") || "ADMIN",
    details,
  };

  const updated = [newLog, ...currentLogs].slice(0, 500);
  // Fixed: Passing exactly 2 arguments to StorageWrapper.set
  StorageWrapper.set("audit_logs", updated);
}