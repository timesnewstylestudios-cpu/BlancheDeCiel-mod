/* Hourly counter. The worker keeps it in one Durable Object so every isolate shares it. */

export async function chargeStorage(storage, id, now, limit = 60) {
  const key = `q:${id}:${Math.floor(now / 3600000)}`;
  const count = Number(await storage.get(key) || 0);
  if (count >= limit) return { ok: false, count };
  await storage.put(key, String(count + 1));
  return { ok: true, count: count + 1 };
}
