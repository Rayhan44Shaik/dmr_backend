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
export declare const RATE_LOCK_WINDOW_DAYS = 10;
export interface RateLockState {
    rateCompleted: boolean;
    rateLockedAt: string | null;
    rateLockedBy: string | null;
    /** True when the 10-day correction window has permanently closed. */
    correctionWindowExpired: boolean;
    /** ISO timestamp at which the window closes (null when not locked). */
    correctionWindowClosesAt: string | null;
}
export declare function evaluateRateLock(lock: {
    rate_completed?: boolean | null;
    rate_locked_at?: string | Date | null;
}, now?: Date): RateLockState;
