// src/modules/operations/vehicle-trips/components/TripViewShopCards.tsx
// Read-only shop delivery cards for the completed Trip View.
// Email status lives inside each card; no per-box allocation is shown.
// Includes a client-side shop search (shop name / bird type) and a live
// email progress + result summary (Total / Sent / Failed / Pending).

import React, { useMemo, useState } from "react";
import {
  Mail,
  RotateCw,
  Box,
  Bird,
  Scale,
  Clock,
  AlertCircle,
  Package,
  Loader2,
  Search,
  X,
  CheckCircle2,
  XCircle,
  FileDown,
} from "lucide-react";
import { WhatsAppIcon } from "../../../../ui/WhatsAppIcon";
import type { Trip, ShopDelivery } from "../types/trip";
import type { Shop } from "../../../masters/shops/types/shop";
import type { DeliveryEmailStatusValue } from "../services/deliveryEmailService";
import type { DeliveryWhatsAppStatusValue } from "../services/deliveryWhatsAppService";

export type TripViewShopCardsProps = {
  trip: Trip;
  shops: Shop[];
  effectiveStatus: (deliveryId: number) => DeliveryEmailStatusValue;
  busyIds: Set<number>;
  isBulkSending: boolean;
  bulkProgress: { sent: number; total: number } | null;
  shopEmailFor: (delivery: ShopDelivery) => string;
  failureReasonFor: (deliveryId: number) => string | null;
  sendCountFor?: (deliveryId: number) => number;
  onSendOne: (delivery: ShopDelivery) => void;
  onDownloadPdf: (delivery: ShopDelivery) => void;
  /** Live email counts (real runtime values). */
  emailCounts?: { sent: number; pending: number; sending: number; failed: number; total: number };

  // WhatsApp props
  whatsappEffectiveStatus?: (deliveryId: number) => DeliveryWhatsAppStatusValue;
  whatsappBusyIds?: Set<number>;
  whatsappIsBulkSending?: boolean;
  shopWhatsAppFor?: (delivery: ShopDelivery) => string;
  whatsappFailureReasonFor?: (deliveryId: number) => string | null;
  whatsappSendCountFor?: (deliveryId: number) => number;
  onSendOneWhatsApp?: (delivery: ShopDelivery) => void;
  /** Live WhatsApp counts (real runtime values). */
  whatsappCounts?: { sent: number; pending: number; sending: number; failed: number; total: number };
};

function StatusBadge({
  status,
  sending,
  label,
  sendCount = 0,
  channel = "mail",
}: {
  status: DeliveryEmailStatusValue | DeliveryWhatsAppStatusValue;
  sending: boolean;
  label?: string;
  sendCount?: number;
  channel?: "mail" | "whatsapp";
}) {
  const tone =
    status === "sent"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "failed"
        ? "bg-red-50 text-red-700 border-red-200"
        : status === "sending" || sending
          ? "bg-sky-50 text-sky-700 border-sky-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
  const sentLabel = channel === "whatsapp" ? "WhatsApp Sent" : "Mail Sent";
  const failedLabel = channel === "whatsapp" ? "WhatsApp Failed" : "Mail Failed";
  const pendingLabel = channel === "whatsapp" ? "WhatsApp Pending" : "Mail Pending";
  const sendingLabel = "Sending...";

  const displayLabel =
    label ??
    ((status === "sending" || sending) && sendingLabel
      ? sendingLabel
      : status === "sent"
        ? sendCount > 1
          ? `${sentLabel} · ${sendCount} times`
          : sentLabel
        : status === "failed"
          ? failedLabel
          : pendingLabel);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${tone}`}
    >
      {(status === "sending" || sending) && <Loader2 size={11} className="animate-spin" />}
      {status === "sent" && <CheckCircle2 size={11} />}
      {status === "failed" && <XCircle size={11} />}
      {status === "pending" && !sending && <Clock size={11} />}
      {displayLabel}
    </span>
  );
}

export function TripViewShopCards({
  trip,
  effectiveStatus,
  busyIds,
  isBulkSending,
  shopEmailFor,
  failureReasonFor,
  sendCountFor,
  onSendOne,
  onDownloadPdf,
  // WhatsApp props
  whatsappEffectiveStatus,
  whatsappBusyIds,
  whatsappIsBulkSending,
  shopWhatsAppFor,
  whatsappFailureReasonFor,
  whatsappSendCountFor,
  onSendOneWhatsApp,
}: TripViewShopCardsProps) {
  const deliveries = useMemo(
    () => (Array.isArray(trip.deliveries) ? trip.deliveries : []),
    [trip.deliveries]
  );
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const filteredDeliveries = useMemo(() => {
    if (!query) return deliveries;
    return deliveries.filter(
      (delivery) =>
        (delivery.shopName || "").toLowerCase().includes(query) ||
        (delivery.birdType || "").toLowerCase().includes(query)
    );
  }, [deliveries, query]);

  if (deliveries.length === 0) return null;

  const display = (value: string | number | null | undefined) => {
    if (value == null || value === "" || (typeof value === "number" && Number.isNaN(value)))
      return "Not entered";
    return String(value);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <Package size={16} className="text-emerald-600" />
          Shop Deliveries
          <span className="normal-case font-semibold text-[11px] text-slate-400">({deliveries.length})</span>
        </h3>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search shops..."
          aria-label="Search shops by name or bird type"
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 py-2.5 text-xs font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear shop search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {filteredDeliveries.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
          No shops match “{search.trim()}”. Try a different shop name or bird type.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredDeliveries.map((delivery) => {
            const status = effectiveStatus(delivery.id);
            const sending = busyIds.has(delivery.id) || status === "sending";
            const failedReason = status === "failed" ? failureReasonFor(delivery.id) : null;
            const sendCount = sendCountFor ? sendCountFor(delivery.id) : 0;

            // WhatsApp status
            const whatsappStatus = whatsappEffectiveStatus?.(delivery.id) ?? "pending";
            const whatsappSending = (whatsappBusyIds?.has(delivery.id) ?? false) || whatsappStatus === "sending";
            const whatsappFailedReason = whatsappStatus === "failed" ? whatsappFailureReasonFor?.(delivery.id) ?? null : null;
            const whatsappSendCount = whatsappSendCountFor ? whatsappSendCountFor(delivery.id) : 0;

            const isWeightMode = delivery.deliveryMode === "weight";
            const selectedBoxes = Array.isArray(delivery.selectedBoxIds)
              ? delivery.selectedBoxIds
              : delivery.boxNo != null && delivery.boxNo > 0
                ? [delivery.boxNo]
                : [];
            const mortalityCount = delivery.mortality ?? 0;
            const mortKg = delivery.mortKg ?? 0;

            return (
              <div
                key={delivery.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2.5"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate" title={delivery.shopName}>
                      {delivery.shopName || "Not entered"}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      Email: {shopEmailFor(delivery)}
                    </p>
                    {shopWhatsAppFor && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        WhatsApp: {shopWhatsAppFor(delivery)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${
                      isWeightMode
                        ? "bg-purple-50 text-purple-700 border-purple-200/60"
                        : "bg-amber-50 text-amber-700 border-amber-200/60"
                    }`}
                  >
                    {isWeightMode ? "WEIGHT" : "BOX"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50/70 p-2 rounded-xl border border-slate-100">
                  <div className="flex flex-col items-center justify-center text-center p-1.5 bg-white rounded-lg border border-slate-200/50">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-0.5">
                      <Box size={11} className="text-slate-500" /> Boxes
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {display(selectedBoxes.length || delivery.boxNo)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center p-1.5 bg-white rounded-lg border border-slate-200/50">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-0.5">
                      <Bird size={11} className="text-sky-600" /> Birds
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {display(delivery.birds)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center text-center p-1.5 bg-white rounded-lg border border-slate-200/50">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1 mb-0.5">
                      <Scale size={11} className="text-emerald-600" /> Weight
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {delivery.weight ? `${delivery.weight.toFixed(2)} kg` : "Not entered"}
                    </span>
                  </div>
                </div>

                {(mortalityCount > 0 || mortKg > 0) && (
                  <div className="flex items-center justify-between px-2 py-1.5 bg-red-50/60 rounded-lg border border-red-100 text-[11px]">
                    <span className="text-red-600 font-semibold flex items-center gap-1">
                      <AlertCircle size={12} className="text-rose-500" /> Mortality
                    </span>
                    <span className="text-red-700 font-bold">
                      {mortalityCount} birds · {mortKg ? mortKg.toFixed(2) : "0.00"} kg
                    </span>
                  </div>
                )}

                {selectedBoxes.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-100/60 rounded-lg border border-slate-200/40 text-[11px] overflow-x-auto scrollbar-none">
                    <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 text-[10px] uppercase">
                      <Package size={12} className="text-slate-500" /> Box Nos:
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {selectedBoxes.map((id) => (
                        <span
                          key={id}
                          className="px-1.5 py-0.5 bg-white text-slate-700 font-bold rounded border border-slate-200/80 text-[10px] shrink-0"
                        >
                          #{id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-0.5">
                  <div className="flex items-center gap-1">
                    <Clock size={12} className="text-slate-400" />
                    <span>Captured {delivery.autoCaptureTime || "—"}</span>
                  </div>
                  {delivery.birdType ? (
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-700 font-semibold rounded-md text-[10px] border border-sky-100">
                      {delivery.birdType}
                    </span>
                  ) : null}
                </div>

                {failedReason ? (
                  <p className="text-[11px] text-red-600 px-1">{failedReason}</p>
                ) : null}
                {whatsappFailedReason ? (
                  <p className="text-[11px] text-red-600 px-1">WhatsApp: {whatsappFailedReason}</p>
                ) : null}

                <div className="flex items-center gap-2 border-t border-slate-100 pt-2.5">
                  <button
                    type="button"
                    onClick={() => onDownloadPdf(delivery)}
                    className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 p-1.5 text-red-700 transition-colors"
                    title="Create PDF"
                    aria-label="Create PDF"
                  >
                    <FileDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSendOne(delivery)}
                    disabled={sending || isBulkSending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Send email to this shop"
                  >
                    <Mail size={13} />
                    {sending ? "Sending..." : "Email"}
                  </button>
                  {onSendOneWhatsApp && (
                    <button
                      type="button"
                      onClick={() => onSendOneWhatsApp(delivery)}
                      disabled={whatsappSending || whatsappIsBulkSending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Send WhatsApp to this shop"
                    >
                      <WhatsAppIcon size={13} />
                      {whatsappSending ? "Sending..." : "WhatsApp"}
                    </button>
                  )}
                  <div className="ml-auto flex flex-col items-end gap-1">
                    <StatusBadge
                      status={status}
                      sending={sending}
                      sendCount={sendCount}
                      channel="mail"
                    />
                    {onSendOneWhatsApp && (
                      <StatusBadge
                        status={whatsappStatus}
                        sending={whatsappSending}
                        sendCount={whatsappSendCount}
                        channel="whatsapp"
                      />
                    )}
                  </div>
                  {(status === "failed" && !sending) || (whatsappStatus === "failed" && !whatsappSending) ? (
                    <div className="flex items-center gap-1.5">
                      {status === "failed" && !sending ? (
                        <button
                          type="button"
                          onClick={() => onSendOne(delivery)}
                          disabled={isBulkSending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RotateCw size={12} />
                          Retry
                        </button>
                      ) : null}
                      {whatsappStatus === "failed" && !whatsappSending && onSendOneWhatsApp ? (
                        <button
                          type="button"
                          onClick={() => onSendOneWhatsApp(delivery)}
                          disabled={whatsappIsBulkSending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RotateCw size={12} />
                          Retry
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default React.memo(TripViewShopCards);