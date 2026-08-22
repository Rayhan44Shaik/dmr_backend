const CONFIG_MESSAGE =
  "WhatsApp service is not configured. Please contact the administrator.";

const GENERIC_MESSAGE =
  "Unable to send the WhatsApp message. Please try again or contact the administrator.";

const SECRETISH = /whatsapp[_-]?token|whatsapp[_-]?secret|api[_-]?key|secret|stack/i;

export function userFacingDeliveryWhatsAppError(message?: string | null): string {
  const text = String(message ?? "").trim();
  if (!text) return GENERIC_MESSAGE;
  if (/not configured/i.test(text)) return CONFIG_MESSAGE;
  if (SECRETISH.test(text)) return GENERIC_MESSAGE;
  return text;
}

export const WHATSAPP_SENT_TOAST = "✓ WhatsApp sent successfully";

export type DeliveryWhatsAppAttemptResult = {
  success: boolean;
  status?: string;
  message?: string;
};

export type DeliveryWhatsAppUiFeedback =
  | { toast: typeof WHATSAPP_SENT_TOAST; inlineError: null }
  | { toast: null; inlineError: string };

/** Failures stay inline. Only a successful send may show a toast. */
export function deliveryWhatsAppAttemptFeedback(
  result: DeliveryWhatsAppAttemptResult | Error
): DeliveryWhatsAppUiFeedback {
  if (result instanceof Error) {
    return { toast: null, inlineError: userFacingDeliveryWhatsAppError(result.message) };
  }
  if (result.success && result.status === "sent") {
    return { toast: WHATSAPP_SENT_TOAST, inlineError: null };
  }
  return {
    toast: null,
    inlineError: userFacingDeliveryWhatsAppError(result.message),
  };
}