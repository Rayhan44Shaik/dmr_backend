import { useEffect, useMemo, useState } from "react";
import {
  X,
  Truck,
  CalendarDays,
  Store,
  Package,
  Scale,
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  Lock,
  Save,
  RotateCcw,
} from "lucide-react";
import type { Trip } from "../../vehicle-trips/types/trip.ts";
import RateEntryMarketMasterTables from "./RateEntryMarketMasterTables";
import type { RateEntryMarketRateMasterDto } from "../utils/rateEntryMarketMaster";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";

const SHOPS_PER_PAGE = 7;

function isValidSellingRate(rate: number | null | undefined): boolean {
  return rate != null && Number.isFinite(rate) && rate >= 50 && rate <= 300;
}

function normalizeRate(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate) || rate === 0) return null;
  return rate;
}

function formatTripDateDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function weekdayName(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-IN", { weekday: "long" });
}

function formatInr(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  open: boolean;
  trip: Trip | null;
  onClose: () => void;
  onSave: (deliveries: Trip["deliveries"]) => Promise<boolean> | boolean | void;
  onSaveAndLock: (deliveries: Trip["deliveries"]) => Promise<boolean> | boolean | void;
  isSaving?: boolean;
  loadError?: string | null;
}

export default function EnterRateModal({
  open,
  trip,
  onClose,
  onSave,
  onSaveAndLock,
  isSaving = false,
  loadError,
}: Props) {
  const [deliveries, setDeliveries] = useState<Trip["deliveries"]>([]);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockAttempted, setLockAttempted] = useState(false);
  const [shopPage, setShopPage] = useState(1);

  const saving = isSaving || busy;

  useEffect(() => {
    if (!trip) return;
    /* eslint-disable react-hooks/set-state-in-effect -- controlled modal: sync trip prop into local state on open */
    setShowSuccessToast(false);
    setShowConfirm(false);
    setLockError(null);
    setLockAttempted(false);
    setShopPage(1);
    setDeliveries(
      trip.deliveries.map((d) => ({
        ...d,
        rate: normalizeRate(d.rate),
      }))
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [trip]);

  const totalBirds = useMemo(() => deliveries.reduce((sum, row) => sum + row.birds, 0), [deliveries]);
  const totalWeight = useMemo(() => deliveries.reduce((sum, row) => sum + row.weight, 0), [deliveries]);
  const grandAmount = useMemo(
    () =>
      deliveries.reduce((sum, row) => {
        if (isValidSellingRate(row.rate)) {
          return sum + Number((row.weight * (row.rate as number)).toFixed(2));
        }
        return sum;
      }, 0),
    [deliveries]
  );

  const hasInvalidEnteredRate = useMemo(
    () =>
      deliveries.some((row) => {
        const rate = normalizeRate(row.rate);
        return rate !== null && !isValidSellingRate(rate);
      }),
    [deliveries]
  );

  const canLock = useMemo(
    () => deliveries.length > 0 && deliveries.every((row) => isValidSellingRate(normalizeRate(row.rate))),
    [deliveries]
  );

  const marketMaster = useMemo(() => {
    return (trip as Trip & { marketRateMaster?: RateEntryMarketRateMasterDto | null } | null)
      ?.marketRateMaster;
  }, [trip]);

  const tripDateVenRate = useMemo(() => {
    const row = marketMaster?.companyRates.find((r) => r.date === trip?.tripDate);
    if (!row?.entered || row.vencobRate == null) return null;
    return row.vencobRate;
  }, [marketMaster, trip?.tripDate]);

  const isDirty = useMemo(() => {
    if (!trip) return false;
    return deliveries.some((row, i) => normalizeRate(row.rate) !== normalizeRate(trip.deliveries[i]?.rate));
  }, [deliveries, trip]);

  const shopPageCount = Math.max(1, Math.ceil(deliveries.length / SHOPS_PER_PAGE));
  const pagedDeliveries = useMemo(() => {
    const start = (shopPage - 1) * SHOPS_PER_PAGE;
    return deliveries.slice(start, start + SHOPS_PER_PAGE).map((row, i) => ({
      row,
      index: start + i,
    }));
  }, [deliveries, shopPage]);

  useEffect(() => {
    if (shopPage > shopPageCount) setShopPage(shopPageCount);
  }, [shopPage, shopPageCount]);

  const resetRates = () => {
    if (!trip) return;
    setLockError(null);
    setLockAttempted(false);
    setDeliveries(
      trip.deliveries.map((d) => ({
        ...d,
        rate: normalizeRate(d.rate),
      }))
    );
  };

  const confirmSave = async (mode: "save" | "lock") => {
    if (saving) return;
    if (mode === "save") {
      if (hasInvalidEnteredRate) {
        setLockError("Entered rates must be between ₹50 and ₹300. Blank shops can still be saved.");
        return;
      }
      if (!isDirty) return;
    }
    if (mode === "lock") {
      setLockAttempted(true);
      if (!canLock) {
        const firstMissing = deliveries.findIndex((row) => !isValidSellingRate(normalizeRate(row.rate)));
        if (firstMissing >= 0) {
          setShopPage(Math.floor(firstMissing / SHOPS_PER_PAGE) + 1);
        }
        return;
      }
    }
    setShowConfirm(false);
    setBusy(true);
    setLockError(null);
    try {
      const ok =
        mode === "lock" ? await onSaveAndLock(deliveries) : await onSave(deliveries);
      if (ok === false) return;
      setShowSuccessToast(true);
      setTimeout(() => {
        setShowSuccessToast(false);
        if (mode === "lock") onClose();
      }, 1200);
    } finally {
      setBusy(false);
    }
  };

  if (!open || !trip) return null;

  const rateLocked = trip.rateCompleted === true;

  return (
    <>
      <style>{`
        .no-spinner::-webkit-inner-spin-button,
        .no-spinner::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinner { -moz-appearance: textfield; }
      `}</style>

      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 overflow-y-auto">
        {showSuccessToast && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20">
            <div className="bg-white rounded-2xl shadow-2xl border border-emerald-100 p-6 flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 size={28} />
              </div>
              <div className="text-center">
                <h3 className="text-base font-bold text-slate-800">Rates Saved Successfully!</h3>
                <p className="text-xs text-slate-500 mt-0.5">Saved to the server. Refresh will keep these rates.</p>
              </div>
            </div>
          </div>
        )}

        {showConfirm && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full mx-4 p-6">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800">Locking this trip</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    After <span className="font-semibold">LOCK &amp; SUBMIT</span>, rates cannot be edited in Rate Entry.
                    This trip will leave the pending list and move to Shop Sales.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmSave("lock")}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium text-white"
                >
                  {saving ? "Locking..." : "Lock — cannot edit"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col relative overflow-hidden">
          <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-start justify-between shrink-0">
            <h2 className="text-xl font-bold text-slate-900">
              {rateLocked ? "Rates (Read-Only)" : "Enter Selling Rates"}
            </h2>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center"
              aria-label="Close"
            >
              <X size={18} className="text-slate-600" />
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-5 py-3 shrink-0">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Trip Number</p>
                <p className="text-sm font-bold text-emerald-700">{trip.tripNo}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5">
              <div className="h-9 w-9 rounded-lg bg-sky-100 flex items-center justify-center">
                <Truck size={18} className="text-sky-700" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Vehicle No</p>
                <p className="text-sm font-bold text-slate-800">{trip.vehicleNo}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CalendarDays size={18} className="text-emerald-700" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Trip Date</p>
                <p className="text-sm font-bold text-slate-800">{formatTripDateDisplay(trip.tripDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Day</p>
                <p className="text-sm font-bold text-slate-800">{weekdayName(trip.tripDate)}</p>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-100">
            <RateEntryMarketMasterTables
              master={marketMaster}
              tripDate={trip.tripDate}
              loadError={null}
            />
          </div>

          {(loadError || lockError) && (
            <div className="px-5 py-2 border-b border-red-200 bg-red-50 flex items-center gap-2 shrink-0">
              <AlertCircle size={14} className="text-red-600" />
              <span className="text-xs font-medium text-red-700">{lockError || loadError}</span>
            </div>
          )}

          <div className="px-5 py-2 flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="overflow-auto flex-1 min-h-0">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">S.No</th>
                    <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Shop Name</th>
                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Birds</th>
                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Weight (KG)</th>
                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Market Rate (₹/KG)</th>
                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Rate (₹/KG)</th>
                    <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDeliveries.map(({ row: delivery, index }) => {
                    const rate = normalizeRate(delivery.rate);
                    const isValid = isValidSellingRate(rate);
                    const amount = isValid ? Number((delivery.weight * (rate as number)).toFixed(2)) : 0;
                    const market = delivery.marketRate;
                    const marketRateValue =
                      market?.masterRate != null ? Number(market.masterRate) : tripDateVenRate;
                    const belowMin = rate != null && rate < 50;
                    const aboveMax = rate != null && rate > 300;
                    const missingForLock = lockAttempted && !isValid;

                    return (
                      <tr
                        key={delivery.id}
                        className={`border-b border-slate-100 ${missingForLock ? "bg-red-50" : ""}`}
                      >
                        <td className="px-2 py-2.5 text-center text-xs text-slate-500">{index + 1}</td>
                        <td className="px-2 py-2.5 text-xs font-medium text-slate-800">{delivery.shopName}</td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold text-emerald-600">
                          {delivery.birds.toLocaleString()}
                        </td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold text-orange-500">
                          {delivery.weight.toFixed(2)}
                        </td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold text-sky-600">
                          {marketRateValue != null ? Number(marketRateValue).toFixed(2) : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {rateLocked ? (
                            <span className="block text-center text-sm font-bold text-slate-600">
                              {rate != null ? rate.toFixed(2) : "—"}
                            </span>
                          ) : (
                            <div className="flex flex-col items-center">
                              <input
                                type="number"
                                step="0.01"
                                value={rate === null ? "" : rate}
                                placeholder=""
                                disabled={saving}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const updated = [...deliveries];
                                  const num = value === "" ? null : Number(value);
                                  (updated[index] as Trip["deliveries"][number]).rate = num;
                                  setDeliveries(updated);
                                }}
                                className={`w-[88px] px-2 py-1 rounded-md border text-center text-sm font-semibold outline-none no-spinner ${
                                  rate == null
                                    ? "border-slate-300"
                                    : isValid
                                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                                      : "border-red-500 bg-red-50 text-red-700"
                                }`}
                              />
                              {belowMin && <p className="text-[10px] text-red-500 mt-0.5">⚠ Min ₹50</p>}
                              {aboveMax && <p className="text-[10px] text-red-500 mt-0.5">⚠ Max ₹300</p>}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center text-xs font-semibold text-slate-700">
                          ₹ {formatInr(amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {shouldShowPagination(deliveries.length) && (
              <div className={paginationBarClass}>
                <button
                  type="button"
                  disabled={shopPage <= 1}
                  onClick={() => setShopPage((p) => Math.max(1, p - 1))}
                  className={paginationNavBtnClass}
                >
                  Previous
                </button>
                <span className={paginationPageBtnClass(true)}>
                  {shopPage}
                </span>
                <button
                  type="button"
                  disabled={shopPage >= shopPageCount}
                  onClick={() => setShopPage((p) => Math.min(shopPageCount, p + 1))}
                  className={paginationNavBtnClass}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <div className="bg-white border-t border-slate-200 px-5 py-3 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                <Store size={16} className="text-slate-500" />
                <div>
                  <p className="text-[9px] text-slate-500 uppercase">Shops</p>
                  <p className="text-base font-bold text-slate-800">{deliveries.length}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                <Package size={16} className="text-slate-500" />
                <div>
                  <p className="text-[9px] text-slate-500 uppercase">Birds</p>
                  <p className="text-base font-bold text-slate-800">{totalBirds.toLocaleString()}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center gap-2">
                <Scale size={16} className="text-orange-500" />
                <div>
                  <p className="text-[9px] text-slate-500 uppercase">Total Weight (KG)</p>
                  <p className="text-base font-bold text-orange-500">{totalWeight.toFixed(2)} KG</p>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2">
                <IndianRupee size={16} className="text-emerald-700" />
                <div>
                  <p className="text-[9px] text-emerald-700 uppercase">Grand Amount (₹)</p>
                  <p className="text-base font-bold text-emerald-700">₹ {formatInr(grandAmount)}</p>
                </div>
              </div>
            </div>

            {!rateLocked && (
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={resetRates}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-sky-300 text-sm font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => confirmSave("save")}
                    disabled={saving || !isDirty || hasInvalidEnteredRate}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-50 ${
                      isDirty
                        ? "border-amber-400 bg-amber-50 text-amber-800 ring-2 ring-amber-200"
                        : "border-emerald-300 bg-emerald-50 text-emerald-800"
                    }`}
                    title="Save entered rates without locking. Blank shops are allowed."
                  >
                    <Save size={14} />
                    {saving ? "Saving..." : "Save Progress"}
                  </button>
                  <button
                    onClick={() => {
                      if (saving) return;
                      setLockAttempted(true);
                      if (!canLock) {
                        const firstMissing = deliveries.findIndex(
                          (row) => !isValidSellingRate(normalizeRate(row.rate))
                        );
                        if (firstMissing >= 0) {
                          setShopPage(Math.floor(firstMissing / SHOPS_PER_PAGE) + 1);
                        }
                        return;
                      }
                      setShowConfirm(true);
                    }}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    <Lock size={14} className="text-orange-300" />
                    {saving ? "Locking..." : "LOCK & SUBMIT"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
