import {
  sizeCategoryHeaders,
  sizeColumnLabel,
  type RateEntryMarketRateMasterDto,
} from "../utils/rateEntryMarketMaster";

type Props = {
  master: RateEntryMarketRateMasterDto | null | undefined;
  tripDate?: string;
  loadError?: string | null;
  loading?: boolean;
};

function formatDdMm(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${m[2]}`;
}

function numericCell(entered: boolean, value: number | null, key?: string) {
  const missing = !entered || value == null;
  return (
    <td
      key={key}
      className={`px-1.5 py-1 text-center text-[11px] ${
        missing ? "text-slate-400" : "text-slate-800 font-medium tabular-nums"
      }`}
    >
      {missing ? "—" : Number(value).toFixed(2)}
    </td>
  );
}

export default function RateEntryMarketMasterTables({
  master,
  tripDate,
  loadError,
  loading,
}: Props) {
  if (loading) {
    return (
      <div className="px-5 py-2.5 border-b bg-slate-50 text-xs text-slate-600">
        Loading Market Rate Master…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-5 py-2.5 border-b border-red-200 bg-red-50 text-xs font-medium text-red-700">
        Market Rate Master could not be loaded. {loadError}
      </div>
    );
  }

  if (!master) {
    return (
      <div className="px-5 py-2.5 border-b bg-slate-50 text-xs text-slate-500">
        Market Rate Master reference is unavailable for this trip.
      </div>
    );
  }

  const sizeKeys = sizeCategoryHeaders(master);
  const tripIso = tripDate || master.tripDate;

  const rowClass = (date: string, tone: string) =>
    date === tripIso ? `is-trip-date ${tone}` : "bg-white";

  return (
    <div className="px-5 py-2.5 border-b bg-white">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-1.5 py-1 text-left font-medium w-12" />
                <th className="px-1.5 py-1 text-center font-semibold">Vij</th>
                <th className="px-1.5 py-1 text-center font-semibold">Gun</th>
                <th className="px-1.5 py-1 text-center font-semibold">R.P</th>
              </tr>
            </thead>
            <tbody>
              {master.additionalMetrics.map((row) => (
                <tr
                  key={row.date}
                  className={rowClass(row.date, "bg-emerald-50 text-emerald-800")}
                >
                  <td className={`px-1.5 py-1 font-semibold ${row.date === tripIso ? "text-emerald-700" : "text-slate-600"}`}>
                    {formatDdMm(row.date)}
                  </td>
                  {numericCell(row.entered, row.vij)}
                  {numericCell(row.entered, row.gun)}
                  {numericCell(row.entered, row.rp)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse min-w-[320px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-1.5 py-1 text-left font-medium w-12" />
                  <th className="px-1 py-1 text-center font-semibold whitespace-nowrap">Sneha</th>
                  <th className="px-1 py-1 text-center font-semibold whitespace-nowrap">Ven Rate</th>
                  <th className="px-1 py-1 text-center font-semibold whitespace-nowrap">Ven Vij</th>
                  <th className="px-1 py-1 text-center font-semibold whitespace-nowrap">Ven Gun</th>
                  <th className="px-1 py-1 text-center font-semibold whitespace-nowrap">Asso Vij</th>
                </tr>
              </thead>
              <tbody>
                {master.companyRates.map((row) => (
                  <tr
                    key={row.date}
                    className={rowClass(row.date, "bg-amber-50 text-amber-900")}
                  >
                    <td className={`px-1.5 py-1 font-semibold ${row.date === tripIso ? "text-amber-700" : "text-slate-600"}`}>
                      {formatDdMm(row.date)}
                    </td>
                    {numericCell(row.entered, row.sneha)}
                    {numericCell(row.entered, row.vencobRate)}
                    {numericCell(row.entered, row.vencobVii)}
                    {numericCell(row.entered, row.vencobGun)}
                    {numericCell(row.entered, row.associationVii)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-1.5 py-1 text-left font-medium w-12" />
                  {sizeKeys.map((key) => (
                    <th key={key} className="px-1.5 py-1 text-center font-semibold">
                      {sizeColumnLabel(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {master.sizeCategoryBreakdown.map((row) => (
                  <tr
                    key={row.date}
                    className={rowClass(row.date, "bg-sky-50 text-sky-900")}
                  >
                    <td className={`px-1.5 py-1 font-semibold ${row.date === tripIso ? "text-sky-700" : "text-slate-600"}`}>
                      {formatDdMm(row.date)}
                    </td>
                    {sizeKeys.map((key) =>
                      numericCell(row.entered, row.columns?.[key] ?? null, key)
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
