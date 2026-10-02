type Entry = { count: number; resetAt: number };

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;
const attempts = new Map<string, Entry>();

function prune(now: number) {
  if (attempts.size < 1000) return;
  for (const [key, entry] of attempts) if (now >= entry.resetAt) attempts.delete(key);
}

export function isRateLimited(key: string) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() >= entry.resetAt) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string) {
  const now = Date.now();
  prune(now);
  const entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearFailures(key: string) {
  attempts.delete(key);
}
