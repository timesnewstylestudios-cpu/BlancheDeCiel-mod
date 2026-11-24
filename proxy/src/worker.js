/* Cloudflare Worker. Verifies an X user token, then calls xAI with a key that stays here. */

import { takeToken } from './limit.js';

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
    return json({ error: 'not-found' }, 404, origin);
  },
};
