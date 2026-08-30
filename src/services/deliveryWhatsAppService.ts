import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";

const WHATSAPP_RE = /^\+?[1-9]\d{1,14}$/;

export type DeliveryWhatsAppStatus = "pending" | "sending" | "sent" | "failed";

export function sanitizeAttachmentShopName(shopName: string): string {
  return (
    String(shopName || "Shop")
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/\.+/g, ".")
      .replace(/^\.+/, "")
      .slice(0, 80) || "Shop"
  );
}

function failResponse(message: string, extra: Record<string, unknown> = {}) {
  return { success: false as const, status: "failed" as const, message, ...extra };
}

function logWhatsApp(info: Record<string, unknown>) {
  console.log("[delivery-whatsapp]", JSON.stringify(info));
}

export const deliveryWhatsAppService = {
  async listForTrip(tripId: number) {
    const trip = await query(`SELECT id FROM trips WHERE id = $1`, [tripId]);
    if (!trip.rowCount) throw new AppError(404, `Trip ${tripId} not found`);

    const result = await query(
      `SELECT d.trip_id, d.id AS delivery_id, e.status, e.recipient, e.sent_at,
              e.failure_reason, e.created_at, e.updated_at,
              e.send_count, e.attempt_count,
              d.shop_id, d.shop_name, d.sale_no,
              s.whatsapp_number AS shop_whatsapp
         FROM trip_deliveries d
         LEFT JOIN public.trip_delivery_whatsapp e
           ON e.delivery_id = d.id AND e.trip_id = d.trip_id
         LEFT JOIN shops s ON s.id = d.shop_id
        WHERE d.trip_id = $1
        ORDER BY d.id`,
      [tripId]
    );

    return result.rows.map((row) => ({
      tripId: Number(row.trip_id ?? tripId),
      deliveryId: Number(row.delivery_id),
      shopId: row.shop_id == null ? null : Number(row.shop_id),
      shopName: String(row.shop_name ?? ""),
      deliveryNo: String(row.sale_no ?? ""),
      shopWhatsApp: row.shop_whatsapp == null ? null : String(row.shop_whatsapp).trim(),
      status: (row.status as DeliveryWhatsAppStatus | null) ?? "pending",
      recipient: row.recipient == null ? null : String(row.recipient),
      sentAt: row.sent_at ?? null,
      failureReason: row.failure_reason == null ? null : String(row.failure_reason),
      sendCount: row.send_count == null ? 0 : Number(row.send_count),
      attemptCount: row.attempt_count == null ? 0 : Number(row.attempt_count),
    }));
  },

  async sendDeliveryWhatsApp(
    tripId: number,
    deliveryId: number,
    body: { pdfBase64?: unknown; pdf?: unknown; fileName?: unknown; to?: unknown }
  ) {
    // TODO: Implement actual WhatsApp sending (e.g., via Twilio, Meta API, etc.)
    // For now, we simulate the same flow as email but without actual sending
    // The PDF generation is kept for consistency

    const pdfBase64 = body.pdfBase64 ?? body.pdf;
    if (typeof pdfBase64 !== "string" || !pdfBase64.trim()) {
      throw new AppError(422, "PDF bytes are required.");
    }
    const cleaned = pdfBase64.replace(/^data:application\/pdf;base64,/i, "").trim();
    let buf: Buffer;
    try {
      buf = Buffer.from(cleaned, "base64");
    } catch {
      throw new AppError(422, "PDF bytes are required.");
    }
    if (!buf.length || buf.subarray(0, 4).toString("utf8") !== "%PDF") {
      throw new AppError(422, "PDF bytes are required.");
    }

    const tripRes = await query(
      `SELECT id, trip_no, status, trip_date, vehicle_no
         FROM trips WHERE id = $1`,
      [tripId]
    );
    if (!tripRes.rowCount) {
      throw new AppError(404, `Trip ${tripId} not found`);
    }
    const trip = tripRes.rows[0];

    const deliveryRes = await query(
      `SELECT id, trip_id, shop_id, shop_name, sale_no, auto_capture_time
         FROM trip_deliveries WHERE id = $1`,
      [deliveryId]
    );
    if (!deliveryRes.rowCount) {
      throw new AppError(404, `Delivery ${deliveryId} not found`);
    }
    const delivery = deliveryRes.rows[0];
    if (Number(delivery.trip_id) !== tripId) {
      throw new AppError(422, "Delivery does not belong to this trip.");
    }

    if (String(trip.status) !== "Completed") {
      throw new AppError(422, "WhatsApp can only be sent for Completed trips.");
    }

    if (delivery.shop_id == null) {
      throw new AppError(422, "Shop is missing for this delivery.");
    }

    const shopRes = await query(
      `SELECT id, shop_name, whatsapp_number FROM shops WHERE id = $1`,
      [delivery.shop_id]
    );
    if (!shopRes.rowCount) {
      throw new AppError(422, "Shop is missing for this delivery.");
    }
    const shop = shopRes.rows[0];
    const recipient = String(shop.whatsapp_number ?? "").trim();
    if (!recipient) {
      throw new AppError(422, "Shop WhatsApp number is missing.");
    }
    if (!WHATSAPP_RE.test(recipient.replace(/\s+/g, ""))) {
      throw new AppError(422, "Shop WhatsApp number is invalid.");
    }

    const claimed = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM public.trip_delivery_whatsapp
          WHERE trip_id = $1 AND delivery_id = $2
          FOR UPDATE`,
        [tripId, deliveryId]
      );
      if (existing.rowCount) {
        const status = String(existing.rows[0].status);
        if (status === "sending") {
          return { skip: true as const, reason: status };
        }
        // Allow re-sending if previously sent or failed - reset to sending
      }
      const upsert = await client.query(
        `INSERT INTO public.trip_delivery_whatsapp (trip_id, delivery_id, status, recipient, updated_at)
         VALUES ($1, $2, 'sending', $3, NOW())
         ON CONFLICT (trip_id, delivery_id)
         DO UPDATE SET status = 'sending', recipient = EXCLUDED.recipient,
                       failure_reason = NULL, updated_at = NOW()
         WHERE public.trip_delivery_whatsapp.status IN ('pending', 'failed', 'sent')
         RETURNING id`,
        [tripId, deliveryId, recipient]
      );
      if (!upsert.rowCount) {
        return { skip: true as const, reason: "sending" as const };
      }
      return { skip: false as const };
    });

    if (claimed.skip) {
      logWhatsApp({
        tripId,
        deliveryId,
        shop: shop.shop_name,
        status: claimed.reason,
        duplicate: true,
      });
      return {
        success: true as const,
        status: claimed.reason === "sending" ? ("sending" as const) : ("sent" as const),
        tripId,
        deliveryId,
      };
    }

    const tripNo = String(trip.trip_no ?? tripId);
    const deliveryNo = String(delivery.sale_no ?? `${tripNo}-D${deliveryId}`);
    const shopName = String(shop.shop_name || delivery.shop_name || "Shop");
    const vehicleNo = String(trip.vehicle_no ?? "");
    const deliveryDate = trip.trip_date
      ? String(trip.trip_date).slice(0, 10)
      : "";
    const fileName = `Delivery-${tripNo}-${sanitizeAttachmentShopName(shopName)}.pdf`;

    // Increment attempt_count on every attempt
    await query(
      `UPDATE public.trip_delivery_whatsapp
          SET attempt_count = attempt_count + 1, updated_at = NOW()
        WHERE trip_id = $1 AND delivery_id = $2`,
      [tripId, deliveryId]
    );

    // TODO: Replace with actual WhatsApp API call (Twilio, Meta Cloud API, etc.)
    // For now, simulate success
    const whatsappSuccess = true; // Set to false to test failure path
    const simulatedError = whatsappSuccess ? null : "WhatsApp provider error: simulated failure";

    if (!whatsappSuccess) {
      const message = simulatedError!;
      await query(
        `UPDATE public.trip_delivery_whatsapp
            SET status = 'failed', failure_reason = $3, updated_at = NOW()
          WHERE trip_id = $1 AND delivery_id = $2`,
        [tripId, deliveryId, message]
      );
      logWhatsApp({
        tripId,
        deliveryId,
        shop: shopName,
        status: "failed",
        failureReason: message,
        timestamp: new Date().toISOString(),
      });
      const countsRes = await query(
        `SELECT send_count, attempt_count FROM public.trip_delivery_whatsapp WHERE trip_id = $1 AND delivery_id = $2`,
        [tripId, deliveryId]
      );
      const sendCount = countsRes.rows[0]?.send_count ?? 0;
      const attemptCount = countsRes.rows[0]?.attempt_count ?? 0;
      return failResponse(message, { tripId, deliveryId, sendCount, attemptCount });
    }

    // Increment send_count on success
    await query(
      `UPDATE public.trip_delivery_whatsapp
          SET status = 'sent', sent_at = NOW(), failure_reason = NULL,
              send_count = send_count + 1, updated_at = NOW()
        WHERE trip_id = $1 AND delivery_id = $2`,
      [tripId, deliveryId]
    );
    logWhatsApp({
      tripId,
      deliveryId,
      shop: shopName,
      status: "sent",
      timestamp: new Date().toISOString(),
    });
    const countsRes = await query(
      `SELECT send_count, attempt_count FROM public.trip_delivery_whatsapp WHERE trip_id = $1 AND delivery_id = $2`,
      [tripId, deliveryId]
    );
    const sendCount = countsRes.rows[0]?.send_count ?? 0;
    const attemptCount = countsRes.rows[0]?.attempt_count ?? 0;
    return {
      success: true as const,
      status: "sent" as const,
      tripId,
      deliveryId,
      sendCount,
      attemptCount,
    };
  },
};