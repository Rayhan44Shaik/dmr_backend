/** Rate Entry Market Rate Master reference — display helpers only. */

export type MarketNumeric = number | null;

export interface RateEntryMarketRateMasterDto {
  tripDate: string;
  fromDate: string;
  toDate: string;
  additionalMetrics: Array<{
    date: string;
    entered: boolean;
    vij: MarketNumeric;
    gun: MarketNumeric;
    rp: MarketNumeric;
  }>;
  companyRates: Array<{
    date: string;
    entered: boolean;
    sneha: MarketNumeric;
    vencobRate: MarketNumeric;
    vencobVii: MarketNumeric;
    vencobGun: MarketNumeric;
    associationVii: MarketNumeric;
  }>;
  sizeCategoryBreakdown: Array<{
    date: string;
    entered: boolean;
    columns: Record<string, MarketNumeric>;
  }>;
  sizeColumnKeys: string[];
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function expectedMarketWindowDates(tripDate: string): [string, string, string] {
  return [addCalendarDays(tripDate, -1), tripDate, addCalendarDays(tripDate, 1)];
}

export function formatBusinessDate(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : value;
}

export function formatMasterValue(entered: boolean, value: MarketNumeric): string {
  if (!entered || value == null) return "Not entered";
  return Number(value).toFixed(2);
}

export function sizeCategoryHeaders(master: RateEntryMarketRateMasterDto | null | undefined): string[] {
  if (!master) return [];
  if (master.sizeColumnKeys?.length) return master.sizeColumnKeys;
  const keys = new Set<string>();
  for (const row of master.sizeCategoryBreakdown ?? []) {
    for (const key of Object.keys(row.columns ?? {})) keys.add(key);
  }
  return [...keys].sort((a, b) => Number(b.replace(/\D/g, "")) - Number(a.replace(/\D/g, "")));
}

export function sizeColumnLabel(key: string): string {
  const digits = key.replace(/^c/i, "");
  return /^\d+$/.test(digits) ? digits : key;
}
