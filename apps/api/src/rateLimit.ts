// A tiny fixed-window, in-memory rate limiter — no external dependency. Enough
// to protect the paid /api/ai-move route from a runaway client in a single-
// instance deployment. (A multi-instance deploy would move this to Redis.)
export type RateLimitOptions = { windowMs: number; max: number };

export function rateLimit({ windowMs, max }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Returns true if the request is allowed, false if the key is over budget.
  return (key: string): boolean => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  };
}
