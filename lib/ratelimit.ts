type Entry = { count: number; resetAt: number };

// Per-key and per-IP attempt cap, plus a process-wide cap as the last line of defense.
const MAX_ATTEMPTS = 5;
const MAX_GLOBAL = 120;
const WINDOW_MS = 60_000;
const MAX_ENTRIES = 1000;
const GLOBAL_KEY = "__global__";

const attempts = new Map<string, Entry>();

function prune(now: number) {
  if (attempts.size < MAX_ENTRIES) return;
  for (const [key, entry] of attempts) if (now >= entry.resetAt) attempts.delete(key);
  // Last resort against flooding: drop the remainder so the map cannot grow unbounded.
  // Limits re-arm immediately; per-key counting resumes on the next attempt.
  if (attempts.size >= MAX_ENTRIES) attempts.clear();
}

function countWithin(key: string, now: number, limit: number): boolean {
  const entry = attempts.get(key);
  if (!entry) return true;
  if (now >= entry.resetAt) {
    attempts.delete(key);
    return true;
  }
  return entry.count < limit;
}

function bump(key: string, now: number) {
  const entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

// Counts every attempt up front (synchronously, before any await) so concurrent
// requests can never exceed the cap. Keys should include the credential key plus
// the client IP; clearFailures only clears the credential key on success.
export function beginAttempt(keys: string[]) {
  const now = Date.now();
  prune(now);
  if (!countWithin(GLOBAL_KEY, now, MAX_GLOBAL)) return false;
  for (const key of keys) if (!countWithin(key, now, MAX_ATTEMPTS)) return false;
  bump(GLOBAL_KEY, now);
  for (const key of keys) bump(key, now);
  return true;
}

export function clearFailures(key: string) {
  attempts.delete(key);
}

// Behind a reverse proxy the first hop of x-forwarded-for is the real client IP;
// without one all direct connections share the "unknown" key, swallowed by the
// per-credential and global caps.
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0]?.trim() || "unknown" : "unknown";
}
