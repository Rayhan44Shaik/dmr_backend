import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  SMTP_NOT_CONFIGURED_MESSAGE,
  SMTP_SEND_FAILED_MESSAGE,
  containsSmtpSecret,
  smtpService,
  toSafeSmtpUserMessage,
} from "./smtpService.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DeliveryEmailStatus = "pending" | "sending" | "sent" | "failed";

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

function decodePdfBase64(pdfBase64: unknown): Buffer {
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
  if (!buf.length) {
    throw new AppError(422, "PDF bytes are required.");
  }
  const header = buf.subarray(0, 4).toString("utf8");
  if (header !== "%PDF") {
    throw new AppError(422, "PDF bytes are required.");
  }
  return buf;
}

function failResponse(message: string, extra: Record<string, unknown> = {}) {
  return { success: false as const, status: "failed" as const, message, ...extra };
}

const SECRET_LOG_KEYS = new Set([
  "smtpPass",
  "smtpPassword",
  "password",
  "pass",
  "credentials",
  "smtpUser",
  "user",
  "auth",
]);

function sanitizeFailureReason(message: string): string {
  if (!message.trim()) return SMTP_SEND_FAILED_MESSAGE;
  if (/not configured/i.test(message)) return SMTP_NOT_CONFIGURED_MESSAGE;
  if (containsSmtpSecret(message)) return SMTP_SEND_FAILED_MESSAGE;
  return message;
}

function logEmail(info: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    if (SECRET_LOG_KEYS.has(key)) continue;
    if (typeof value === "string" && containsSmtpSecret(value)) {
      safe[key] = SMTP_SEND_FAILED_MESSAGE;
      continue;
    }
    safe[key] = value;
  }
  console.log("[delivery-email]", JSON.stringify(safe));
}

export const deliveryEmailService = {
  async listForTrip(tripId: number) {
    const trip = await query(`SELECT id FROM trips WHERE id = $1`, [tripId]);
    if (!trip.rowCount) throw new AppError(404, `Trip ${tripId} not found`);

    const result = await query(
      `SELECT d.trip_id, d.id AS delivery_id, e.status, e.recipient, e.sent_at,
              e.failure_reason, e.created_at, e.updated_at,
              d.shop_id, d.shop_name, d.sale_no,
              s.email AS shop_email
         FROM trip_deliveries d
         LEFT JOIN public.trip_delivery_emails e
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
      shopEmail: row.shop_email == null ? null : String(row.shop_email).trim(),
      status: (row.status as DeliveryEmailStatus | null) ?? "pending",
      recipient: row.recipient == null ? null : String(row.recipient),
      sentAt: row.sent_at ?? null,
      failureReason:
        row.failure_reason == null ? null : sanitizeFailureReason(String(row.failure_reason)),
    }));
  },

  async sendDeliveryEmail(
    tripId: number,
    deliveryId: number,
    body: { pdfBase64?: unknown; pdf?: unknown; fileName?: unknown; to?: unknown }
  ) {
    const pdf = decodePdfBase64(body.pdfBase64 ?? body.pdf);

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
      throw new AppError(422, "Emails can only be sent for Completed trips.");
    }

    if (delivery.shop_id == null) {
      throw new AppError(422, "Shop is missing for this delivery.");
    }

    const shopRes = await query(
      `SELECT id, shop_name, email FROM shops WHERE id = $1`,
      [delivery.shop_id]
    );
    if (!shopRes.rowCount) {
      throw new AppError(422, "Shop is missing for this delivery.");
    }
    const shop = shopRes.rows[0];
    const recipient = String(shop.email ?? "").trim();
    if (!recipient) {
      throw new AppError(422, "Shop email is missing.");
    }
    if (!EMAIL_RE.test(recipient)) {
      throw new AppError(422, "Shop email is invalid.");
    }

    const claimed = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM public.trip_delivery_emails
          WHERE trip_id = $1 AND delivery_id = $2
          FOR UPDATE`,
        [tripId, deliveryId]
      );
      if (existing.rowCount) {
        const status = String(existing.rows[0].status);
        if (status === "sent" || status === "sending") {
          return { skip: true as const, reason: status };
        }
      }
      const upsert = await client.query(
        `INSERT INTO public.trip_delivery_emails (trip_id, delivery_id, status, recipient, updated_at)
         VALUES ($1, $2, 'sending', $3, NOW())
         ON CONFLICT (trip_id, delivery_id)
         DO UPDATE SET status = 'sending', recipient = EXCLUDED.recipient,
                       failure_reason = NULL, updated_at = NOW()
         WHERE public.trip_delivery_emails.status IN ('pending', 'failed')
         RETURNING id`,
        [tripId, deliveryId, recipient]
      );
      if (!upsert.rowCount) {
        return { skip: true as const, reason: "sending" as const };
      }
      return { skip: false as const };
    });

    if (claimed.skip) {
      logEmail({
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

    const subject = `DMR Poultries - Delivery Details - ${deliveryNo}`;
    const text = [
      `Dear ${shopName},`,
      "",
      "Please find attached the delivery details for your delivery from DMR Poultries.",
      "",
      `Delivery No: ${deliveryNo}`,
      `Date: ${deliveryDate}`,
      `Vehicle: ${vehicleNo}`,
      "",
      "Regards,",
      "DMR Poultries",
    ].join("\n");

    try {
      await smtpService.sendMail({
        to: recipient,
        subject,
        text,
        attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
      });
    } catch (err) {
      const message = sanitizeFailureReason(toSafeSmtpUserMessage(err));
      await query(
        `UPDATE public.trip_delivery_emails
            SET status = 'failed', failure_reason = $3, updated_at = NOW()
          WHERE trip_id = $1 AND delivery_id = $2`,
        [tripId, deliveryId, message]
      );
      logEmail({
        tripId,
        deliveryId,
        shop: shopName,
        status: "failed",
        failureReason: message,
        timestamp: new Date().toISOString(),
      });
      return failResponse(message, { tripId, deliveryId });
    }

    await query(
      `UPDATE public.trip_delivery_emails
          SET status = 'sent', sent_at = NOW(), failure_reason = NULL, updated_at = NOW()
        WHERE trip_id = $1 AND delivery_id = $2`,
      [tripId, deliveryId]
    );
    logEmail({
      tripId,
      deliveryId,
      shop: shopName,
      status: "sent",
      timestamp: new Date().toISOString(),
    });
    return {
      success: true as const,
      status: "sent" as const,
      tripId,
      deliveryId,
    };
  },
};
