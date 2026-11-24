/* Mailbox and hourly quota. KV when bound, otherwise the memory of this isolate. */

export function createBoard(kv) {
  const mem = new Map();
  return {
    async get(key) {
      if (kv) return kv.get(key);
      return mem.has(key) ? mem.get(key) : null;
    },
    async set(key, value) {
      if (kv) return kv.put(key, String(value), { expirationTtl: 7200 });
      mem.set(key, String(value));
    },
  };
}

export async function charge(board, id, now, limit = 60) {
  const key = `q:${id}:${Math.floor(now / 3600000)}`;
  const count = Number(await board.get(key) || 0);
  if (count >= limit) return { ok: false, count };
  await board.set(key, String(count + 1));
  return { ok: true, count: count + 1 };
}

export async function pushMail(board, room, msg) {
  const key = `box:${room}`;
  const list = JSON.parse(await board.get(key) || '[]');
  list.push(msg);
  while (list.length > 40) list.shift();
  await board.set(key, JSON.stringify(list));
  return list.length;
}

export async function readMail(board, room, after, self) {
  const list = JSON.parse(await board.get(`box:${room}`) || '[]');
  return list.filter((item) => item.id !== self && (item.at || 0) > after);
}
