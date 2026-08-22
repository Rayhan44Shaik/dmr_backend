// src/modules/operations/mortality/types/mortality.ts

export type MortalityReason =
  | "Heat Stress"
  | "Disease"
  | "Suffocation"
  | "Transportation"
  | "Other";

export interface MortalityRecord {
  id: string;
  entryNo: string;
  date: string; // YYYY-MM-DD
  tripNo: string;
  farm: string;
  birdType: string;
  birds: number;
  weightKg: number;
  reason: MortalityReason;
  notes: string;
  recordedBy: string;
  createdAt: string;
}

export interface MortalitySummary {
  todayCount: number;
  todayWeight: number;
  weekCount: number;
  weekWeight: number;
  avgLossRate: number;
  byReason: { reason: MortalityReason; count: number }[];
}
