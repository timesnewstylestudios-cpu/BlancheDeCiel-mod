/* Shared with the site tests. The worker keeps buckets in memory per isolate. */

export function takeToken(buckets, id, now, limit = 20, windowMs = 3600000) {
  const current = buckets.get(id);
  const bucket = !current || now >= current.reset ? { count: 0, reset: now + windowMs } : current;
  if (bucket.count >= limit) {
    buckets.set(id, bucket);
    return { ok: false, retryMs: Math.max(0, bucket.reset - now) };
  }
  bucket.count += 1;
  buckets.set(id, bucket);
  return { ok: true, retryMs: 0 };
}
