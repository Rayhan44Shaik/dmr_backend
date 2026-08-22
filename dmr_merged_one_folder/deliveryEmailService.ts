import { apiGet, apiPost } from "../../../../api";
import { generateShopPDFBlob } from "../utils/generateShopPDF";
import type { ShopDelivery, Trip } from "../types/trip";

export type DeliveryEmailStatusValue = "pending" | "sending" | "sent" | "failed";

export type DeliveryEmailRow = {
  tripId: number;
  deliveryId: number;
  shopId: number | null;
  shopName: string;
  deliveryNo: string;
  shopEmail: string | null;
  status: DeliveryEmailStatusValue;
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

export async function fetchDeliveryEmailStatuses(tripId: number): Promise<DeliveryEmailRow[]> {
  const { data } = await apiGet<DeliveryEmailRow[]>(`/trips/${tripId}/delivery-emails`);
  return Array.isArray(data) ? data : [];
}

export async function sendDeliveryEmail(input: {
  trip: Trip;
  delivery: ShopDelivery;
  shopEmail?: string | null;
}): Promise<{ success: boolean; status: DeliveryEmailStatusValue; message?: string }> {
  const blob = await generateShopPDFBlob(
    {
      ...input.delivery,
      shopEmail:
        input.shopEmail ||
        (input.delivery as { shopEmail?: string }).shopEmail,
    } as typeof input.delivery & { shopEmail?: string },
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
    status: DeliveryEmailStatusValue;
    message?: string;
  }>(
    `/trips/${input.trip.id}/deliveries/${input.delivery.id}/email`,
    { pdfBase64, fileName },
    { timeout: 60_000 }
  );
  return data;
}

/** Send each shop independently. One failure does not stop the others. */
export async function sendTripDeliveryEmails(
  trip: Trip,
  options?: { forceRetryIds?: number[] }
): Promise<void> {
  if (trip.status !== "Completed") return;
  const statuses = await fetchDeliveryEmailStatuses(trip.id).catch(() => [] as DeliveryEmailRow[]);
  const byDelivery = new Map(statuses.map((s) => [s.deliveryId, s]));
  const force = new Set(options?.forceRetryIds ?? []);

  await Promise.all(
    (trip.deliveries || []).map(async (delivery) => {
      const current = byDelivery.get(delivery.id);
      if (current?.status === "sent") return;
      if (current?.status === "failed" && !force.has(delivery.id)) return;
      try {
        await sendDeliveryEmail({ trip, delivery, shopEmail: current?.shopEmail });
      } catch {
        /* status persisted as failed on the server when possible */
      }
    })
  );
}
