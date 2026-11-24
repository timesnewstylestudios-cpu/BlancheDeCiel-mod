/* Cloudflare Worker. Verifies an X user token, then calls xAI with a key that stays here. */

import { takeToken } from './limit.js';
import { createRoom } from './room.js';

const buckets = new Map();

function cors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Access-Control-Allow-Headers', 'authorization,content-type');
  headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

function json(body, status, origin) {
  return cors(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }), origin);
}

async function xUser(token) {
  const response = await fetch('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const body = await response.json();
  return body?.data?.username || body?.data?.id || null;
}

async function exchange(request, env) {
  const body = await request.json();
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: body.code || '',
    redirect_uri: body.redirectUri || '',
    code_verifier: body.verifier || '',
    client_id: body.clientId || env.X_CLIENT_ID || '',
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (env.X_CLIENT_SECRET) {
    headers.Authorization = `Basic ${btoa(`${form.get('client_id')}:${env.X_CLIENT_SECRET}`)}`;
  }
  const response = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers, body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { error: payload.error_description || payload.error || 'token', status: response.status };
  const user = await xUser(payload.access_token);
  return { access_token: payload.access_token, user: user || '', status: 200 };
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/oauth/token') {
      const result = await exchange(request, env);
      const status = result.status || 200;
      delete result.status;
      return json(result, status, origin);
    }
    if (request.method === 'POST' && url.pathname === '/v1/chat') {
      if (!env.XAI_API_KEY) return json({ error: 'server-key-missing' }, 500, origin);
      const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const user = await xUser(token);
      if (!user) return json({ error: 'x-token' }, 401, origin);
      const limit = Number(env.RATE_LIMIT || 20);
      const gate = takeToken(buckets, user, Date.now(), limit, 3600000);
      if (!gate.ok) return json({ error: 'rate', retryMs: gate.retryMs }, 429, origin);
      const upstream = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.XAI_API_KEY}`,
        },
        body: await request.text(),
      });
      const text = await upstream.text();
      return cors(new Response(text, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
      }), origin);
    }
    if (url.pathname === '/meet' || url.pathname === '/queue' || url.pathname === '/gossip') {
      if (!env.ROOMS) return json({ error: 'no-coordinator' }, 501, origin);
      const room = url.searchParams.get('room') || 'himmel';
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      const upstream = await stub.fetch(request);
      if (request.headers.get('Upgrade') === 'websocket') return upstream;
      return cors(upstream, origin);
    }
    return json({ error: 'not-found' }, 404, origin);
  },
};

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
