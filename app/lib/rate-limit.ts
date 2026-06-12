const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
// Upper bound on any caller-supplied window. Periodic cleanup uses this so it
// never evicts a counter that is still inside its (longer) window. Callers of
// consumeRateLimit must keep windowMs at or below this.
const MAX_COUNTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

const attempts = new Map<string, AttemptRecord>();
// Counters for general-purpose per-call limiting (e.g. expensive AI endpoints).
const counters = new Map<string, AttemptRecord>();

setInterval(() => {
  const now = Date.now();
  attempts.forEach((record, key) => {
    if (now - record.firstAttempt > WINDOW_MS) {
      attempts.delete(key);
    }
  });
  counters.forEach((record, key) => {
    if (now - record.firstAttempt > MAX_COUNTER_WINDOW_MS) {
      counters.delete(key);
    }
  });
}, 60_000);

export function isRateLimited(key: string): boolean {
  const record = attempts.get(key);
  if (!record) return false;
  if (Date.now() - record.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSec: number;
}

/**
 * General-purpose fixed-window limiter that counts **every** call against a
 * key, not just failures. Use it to cap expensive per-user operations such as
 * AI endpoints. `windowMs` must be <= MAX_COUNTER_WINDOW_MS so periodic cleanup
 * doesn't evict counters early.
 *
 * Note: state is in-memory and per-instance — adequate for curbing runaway
 * usage, but a shared store (Redis) is needed for hard cross-instance limits.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const record = counters.get(key);

  if (!record || now - record.firstAttempt > windowMs) {
    counters.set(key, { count: 1, firstAttempt: now });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (record.count >= limit) {
    const retryAfterSec = Math.ceil((windowMs - (now - record.firstAttempt)) / 1000);
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  record.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}
