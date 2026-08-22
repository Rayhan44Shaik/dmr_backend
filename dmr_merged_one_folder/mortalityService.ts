// src/modules/operations/mortality/services/mortalityService.ts
// LocalStorage-backed mortality records — same pattern as trips/collections.

import type { MortalityRecord, MortalityReason, MortalitySummary } from "../types/mortality";

const STORAGE_KEY = "dmr-mortality";

function load(): MortalityRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MortalityRecord[]) : [];
  } catch {
    return [];
  }
}

function save(records: MortalityRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn("Unable to persist mortality records", error);
  }
}

function nextEntryNo(date: string): string {
  const dateStr = date.replace(/-/g, "");
  const existing = load().filter((r) => r.date === date);
  return `MORT-${dateStr}-${String(existing.length + 1).padStart(3, "0")}`;
}

export const mortalityService = {
  getAll(): MortalityRecord[] {
    return load().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  },

  getByDate(date: string): MortalityRecord[] {
    return load().filter((r) => r.date === date);
  },

  getSummary(): MortalitySummary {
    const records = load();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

    const todayRecords = records.filter((r) => r.date === today);
    const weekRecords = records.filter((r) => r.date >= weekAgo);

    const reasons: MortalityReason[] = ["Heat Stress", "Disease", "Suffocation", "Transportation", "Other"];

    return {
      todayCount: todayRecords.reduce((acc, r) => acc + r.birds, 0),
      todayWeight: todayRecords.reduce((acc, r) => acc + r.weightKg, 0),
      weekCount: weekRecords.reduce((acc, r) => acc + r.birds, 0),
      weekWeight: weekRecords.reduce((acc, r) => acc + r.weightKg, 0),
      avgLossRate: weekRecords.length > 0 ? Math.round((weekRecords.reduce((acc, r) => acc + r.birds, 0) / weekRecords.length / 30) * 10) / 10 : 0,
      byReason: reasons
        .map((reason) => ({
          reason,
          count: records.filter((r) => r.reason === reason).reduce((acc, r) => acc + r.birds, 0),
        }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count),
    };
  },

  create(input: Omit<MortalityRecord, "id" | "entryNo" | "createdAt">): MortalityRecord {
    const records = load();
    const record: MortalityRecord = {
      ...input,
      id: `mort-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entryNo: nextEntryNo(input.date),
      createdAt: new Date().toISOString(),
    };
    records.push(record);
    save(records);
    return record;
  },

  update(id: string, updates: Partial<MortalityRecord>): MortalityRecord | null {
    const records = load();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], ...updates };
    save(records);
    return records[index];
  },

  remove(id: string): void {
    save(load().filter((r) => r.id !== id));
  },
};
