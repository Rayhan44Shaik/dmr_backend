import assert from "node:assert/strict";
import test from "node:test";
import {
  deliveryEmailAttemptFeedback,
  userFacingDeliveryEmailError,
} from "../src/modules/operations/vehicle-trips/services/deliveryEmailErrors";

test("maps SMTP configuration failures to a clean admin message", () => {
  assert.equal(
    userFacingDeliveryEmailError("SMTP provider is not configured."),
    "Email service is not configured. Please contact the administrator."
  );
});

test("never surfaces SMTP secrets or provider internals", () => {
  assert.equal(
    userFacingDeliveryEmailError("Invalid login for SMTP_USER=someone SMTP_PASS=secret"),
    "Unable to send the email. Please try again or contact the administrator."
  );
  assert.equal(
    userFacingDeliveryEmailError("connect ECONNREFUSED SMTP_HOST=smtp.gmail.com"),
    "Unable to send the email. Please try again or contact the administrator."
  );
});

test("keeps actionable shop-email validation messages", () => {
  assert.equal(userFacingDeliveryEmailError("Shop email is missing."), "Shop email is missing.");
  assert.equal(userFacingDeliveryEmailError("Shop email is invalid."), "Shop email is invalid.");
});

test("failure feedback is inline only — never a toast/modal", () => {
  const smtpDown = deliveryEmailAttemptFeedback({
    success: false,
    status: "failed",
    message: "Unable to send email.",
  });
  assert.equal(smtpDown.toast, null);
  assert.equal(smtpDown.inlineError, "Unable to send email.");

  const thrown = deliveryEmailAttemptFeedback(new Error("Unable to send email."));
  assert.equal(thrown.toast, null);
  assert.equal(thrown.inlineError, "Unable to send email.");
});

test("success feedback is a toast with no inline error", () => {
  const ok = deliveryEmailAttemptFeedback({ success: true, status: "sent" });
  assert.equal(ok.toast, "✓ Email sent successfully");
  assert.equal(ok.inlineError, null);
});
