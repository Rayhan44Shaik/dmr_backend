import { apiGet, apiPost } from "../../../../api";
import { generateShopPDFBlob } from "../utils/generateShopPDF";
import type { ShopDelivery, Trip } from "../types/trip";

const WHATSAPP_BACKEND_ENABLED = import.meta.env.VITE_WHATSAPP_BACKEND_ENABLED === "true";

export type DeliveryWhatsAppStatusValue = "pending" | "sending" | "sent" | "failed";

export type DeliveryWhatsAppRow = {
  tripId: number;
  deliveryId: number;
  shopId: number | null;
  shopName: string;
  deliveryNo: string;
  shopWhatsApp: string | null;
  status: DeliveryWhatsAppStatusValue;
  recipient: string | null;
  sentAt: string | null;
  failureReason: string | null;
  /** Successful sends, persisted by the backend (survives refresh). */
  sendCount: number;
  /** Total send attempts (success + failure), persisted by the backend. */
  attemptCount: number;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Unable to read PDF bytes."));
    reader.readAsDataURL(blob);
  });
}

export function sanitizeShopNameForFile(shopName: string): string {
  return (
    String(shopName || "Shop")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 80) || "Shop"
  );
}

export async function fetchDeliveryWhatsAppStatuses(tripId: number): Promise<DeliveryWhatsAppRow[]> {
  if (!WHATSAPP_BACKEND_ENABLED) {
    return [];
  }
  const { data } = await apiGet<DeliveryWhatsAppRow[]>(`/trips/${tripId}/delivery-whatsapp`);
  return Array.isArray(data) ? data : [];
}

export async function sendDeliveryWhatsApp(input: {
  trip: Trip;
  delivery: ShopDelivery;
  shopWhatsApp?: string | null;
}): Promise<{ success: boolean; status: DeliveryWhatsAppStatusValue; message?: string }> {
  if (!WHATSAPP_BACKEND_ENABLED) {
    return {
      success: false,
      status: "failed",
      message: "WhatsApp integration is not configured yet.",
    };
  }
  const blob = await generateShopPDFBlob(
    {
      ...input.delivery,
      shopWhatsApp:
        input.shopWhatsApp ||
        (input.delivery as { shopWhatsApp?: string }).shopWhatsApp,
    } as typeof input.delivery & { shopWhatsApp?: string },
    input.trip.boxDetails || [],
    input.trip.tripNo,
    input.trip.vehicleNo,
    input.trip.supervisorName,
    undefined,
    input.trip.tripDate,
    undefined,
    undefined,
    input.delivery.autoCaptureTime,
    input.trip.driverName
  );
  const pdfBase64 = await blobToBase64(blob);
  const fileName = `Delivery-${input.trip.tripNo}-${sanitizeShopNameForFile(input.delivery.shopName)}.pdf`;
  const { data } = await apiPost<{
    success: boolean;
    status: DeliveryWhatsAppStatusValue;
    message?: string;
  }>(
    `/trips/${input.trip.id}/deliveries/${input.delivery.id}/whatsapp`,
    { pdfBase64, fileName },
    { timeout: 60_000 }
  );
  return data;
}

/** Send each shop independently. One failure does not stop the others. */
export async function sendTripDeliveryWhatsApps(
  trip: Trip,
  options?: { forceRetryIds?: number[] }
): Promise<void> {
  if (trip.status !== "Completed") return;
  const statuses = await fetchDeliveryWhatsAppStatuses(trip.id).catch(() => [] as DeliveryWhatsAppRow[]);
  const byDelivery = new Map(statuses.map((s) => [s.deliveryId, s]));
  const force = new Set(options?.forceRetryIds ?? []);

  await Promise.all(
    (trip.deliveries || []).map(async (delivery) => {
      const current = byDelivery.get(delivery.id);
      if (current?.status === "sent") return;
      if (current?.status === "failed" && !force.has(delivery.id)) return;
      try {
        await sendDeliveryWhatsApp({ trip, delivery, shopWhatsApp: current?.shopWhatsApp });
      } catch {
        /* status persisted as failed on the server when possible */
      }
    })
  );
}