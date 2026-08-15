/**
 * Rate-lock / Shop Sales correction-window logic.
 *
 * A completed trip goes through Rate Entry → Save & Lock, which sets:
 *
 *   trips.rate_completed = TRUE
 *   trips.rate_locked_at = NOW()
 *
 * For 10 days after `rate_locked_at`, Shop Sales may still correct the
 * operational/financial fields of a delivery (birds, weight, rate, and the
 * server-computed amount). After exactly 10 days those fields become
 * permanently immutable.
 *
 * The authoritative window evaluation happens in PostgreSQL (see trigger
 * `trg_trip_deliveries_rate_lock`). The service-layer mirror below is used
 * only to return friendly HTTP 409 errors before hitting the DB guard.
 */
export const RATE_LOCK_WINDOW_DAYS = 10;
export function evaluateRateLock(lock, now = new Date()) {
    const rateCompleted = Boolean(lock.rate_completed);
    const lockedAt = lock.rate_locked_at == null ? null : new Date(String(lock.rate_locked_at));
    const closesAt = lockedAt
        ? new Date(lockedAt.getTime() + RATE_LOCK_WINDOW_DAYS * 24 * 60 * 60 * 1000)
        : null;
    const correctionWindowExpired = rateCompleted
        ? Boolean(closesAt && now.getTime() >= closesAt.getTime())
        : false;
    return {
        rateCompleted,
        rateLockedAt: lockedAt ? lockedAt.toISOString() : null,
        rateLockedBy: null,
        correctionWindowExpired,
        correctionWindowClosesAt: closesAt ? closesAt.toISOString() : null,
    };
}
//# sourceMappingURL=rateLock.js.map