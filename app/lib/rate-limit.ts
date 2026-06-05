const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

const attempts = new Map<string, AttemptRecord>();

setInterval(() => {
  const now = Date.now();
  attempts.forEach((record, key) => {
    if (now - record.firstAttempt > WINDOW_MS) {
      attempts.delete(key);
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
