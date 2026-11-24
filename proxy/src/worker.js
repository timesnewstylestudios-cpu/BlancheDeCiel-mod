/* Cloudflare Worker. Meeting point only: WebSocket relay, task chunks, gossip.
 * No model API and no login. The local net stays in the browser.
 */

import { createRoom } from './room.js';
import { createBoard, pushMail, readMail } from './board.js';
import { chargeStorage } from './quota.js';
import { hmacSha1Base64, mintTurn } from './turn.js';

const memory = createBoard(null);

function cors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Access-Control-Allow-Headers', 'content-type');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

function json(body, status, origin) {
  return cors(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }), origin);
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
    const url = new URL(request.url);
    const board = memory;
    if (url.pathname === '/ice') {
      const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
      if (env.TURN_SECRET && env.TURN_URL) {
        iceServers.push(await mintTurn({ secret: env.TURN_SECRET, urls: env.TURN_URL, hmac: hmacSha1Base64 }));
      } else if (env.CF_TURN_KEY && env.CF_TURN_TOKEN) {
        const minted = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY}/credentials/generate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.CF_TURN_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: 3600 }),
        });
        if (minted.ok) {
          const body = await minted.json();
          if (Array.isArray(body.iceServers)) iceServers.push(...body.iceServers);
        }
      }
      return json({ iceServers }, 200, origin);
    }
    const limit = Number(env.QUOTA || 60);
    const chargeNow = (id) => quotaCharge(env, id, Date.now(), limit);
    if ((url.pathname === '/queue' || url.pathname === '/gossip') && request.method === 'POST') {
      const gate = await chargeNow(url.searchParams.get('room') || 'himmel');
      if (!gate.ok) return json({ error: 'rate', count: gate.count }, 429, origin);
    }
    if (url.pathname === '/poll') {
      const room = url.searchParams.get('room') || 'himmel';
      const id = url.searchParams.get('id') || '';
      if (request.method === 'POST') {
        const gate = await chargeNow(id || room);
        if (!gate.ok) return json({ error: 'rate', count: gate.count }, 429, origin);
        const body = await request.json();
        await pushMail(board, room, { ...body, id: body.id || id, at: Date.now() });
        return json({ ok: true }, 200, origin);
      }
      const after = Number(url.searchParams.get('after') || 0);
      const msgs = await readMail(board, room, after, id);
      return json({ msgs }, 200, origin);
    }
    if (url.pathname === '/meet' || url.pathname === '/queue' || url.pathname === '/gossip') {
      if (!env.ROOMS) return json({ error: 'no-coordinator', poll: '/poll' }, 501, origin);
      const room = url.searchParams.get('room') || 'himmel';
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      const upstream = await stub.fetch(request);
      if (request.headers.get('Upgrade') === 'websocket') return upstream;
      return cors(upstream, origin);
    }
    return json({ error: 'not-found' }, 404, origin);
  },
};

async function quotaCharge(env, id, now, limit) {
  if (env.ROOMS) {
    const stub = env.ROOMS.get(env.ROOMS.idFromName('quota'));
    const response = await stub.fetch('https://quota.internal/quota', {
      method: 'POST',
      body: JSON.stringify({ id, now, limit }),
    });
    return response.json();
  }
  return chargeStorage({
    async get(key) { return memory.get(key); },
    async put(key, value) { await memory.set(key, value); },
  }, id, now, limit);
}

export class Meeting {
  constructor(state) {
    this.state = state;
    this.room = createRoom();
    this.sockets = new Map();
  }

  send(id, msg) {
    try { this.sockets.get(id)?.send(JSON.stringify(msg)); } catch { /* closed */ }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/quota' && request.method === 'POST') {
      const body = await request.json();
      const gate = await chargeStorage(this.state.storage, body.id || 'all', body.now || Date.now(), body.limit || 60);
      return Response.json(gate);
    }
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      const id = crypto.randomUUID();
      server.accept();
      this.sockets.set(id, server);
      for (const item of this.room.join(id)) this.send(item.to, item.msg);
      server.addEventListener('message', (event) => {
        let msg = {};
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.t === 'signal' || msg.t === 'gossip') {
          for (const item of this.room.relay(id, msg)) this.send(item.to, item.msg);
        }
        if (msg.t === 'task') this.room.putChunk(msg.id, msg.seq, msg.total, msg.data || '');
      });
      server.addEventListener('close', () => {
        this.sockets.delete(id);
        this.room.leave(id);
      });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/queue' && request.method === 'POST') {
      const body = await request.json();
      const done = this.room.putChunk(body.id, body.seq, body.total, body.data || '');
      return Response.json({ ok: true, done });
    }
    if (url.pathname === '/queue' && request.method === 'GET') {
      return Response.json(this.room.getTask(url.searchParams.get('id')) || { total: 0, chunks: [] });
    }
    if (url.pathname === '/gossip' && request.method === 'POST') {
      const body = await request.json();
      const members = this.room.noteGossip({ key: body.key || '', hash: body.hash || '' });
      for (const id of members) this.send(id, { t: 'gossip', key: body.key || '', hash: body.hash || '' });
      return Response.json({ ok: true, peers: members.length });
    }
    return Response.json({ error: 'not-found' }, { status: 404 });
  }
}
