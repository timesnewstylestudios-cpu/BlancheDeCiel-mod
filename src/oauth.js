/* SPDX-License-Identifier: GPL-3.0-or-later
 * X OAuth 2.0 PKCE for a public client. The browser never holds an X client secret.
 * The access token is not an xAI key. Chat still goes through the configured proxy.
 */

const AUTH = 'https://twitter.com/i/oauth2/authorize';

function base64url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function randomVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function authorizeUrl({ clientId, redirectUri, state, challenge }) {
  const url = new URL(AUTH);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'users.read tweet.read offline.access');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function redirectUri() {
  return `${location.origin}${location.pathname}`;
}

export async function beginLogin(clientId) {
  const verifier = randomVerifier();
  const state = randomVerifier();
  const challenge = await codeChallenge(verifier);
  sessionStorage.setItem('bdc.pkce', verifier);
  sessionStorage.setItem('bdc.pkce.state', state);
  location.assign(authorizeUrl({ clientId, redirectUri: redirectUri(), state, challenge }));
}

export async function finishLogin(settings) {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const verifier = sessionStorage.getItem('bdc.pkce');
  if (!code || !verifier || !settings.proxyUrl) return settings;
  if (params.get('state') !== sessionStorage.getItem('bdc.pkce.state')) return settings;
  const result = await exchangeCode({
    proxyUrl: settings.proxyUrl,
    clientId: settings.xClientId,
    code,
    verifier,
    redirectUri: redirectUri(),
  });
  sessionStorage.removeItem('bdc.pkce');
  sessionStorage.removeItem('bdc.pkce.state');
  settings.xToken = result.token;
  settings.xUser = result.user;
  history.replaceState({}, '', `${location.pathname}${location.hash}`);
  return settings;
}

export async function exchangeCode({ proxyUrl, clientId, code, verifier, redirectUri }) {
  const root = String(proxyUrl || '').replace(/\/$/, '');
  const response = await fetch(`${root}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, code, verifier, redirectUri }),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!response.ok) throw new Error(json?.error || `OAuth ${response.status}`);
  return { token: json.access_token || '', user: json.user || '' };
}
