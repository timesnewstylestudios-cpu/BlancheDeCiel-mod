/* Coturn REST credentials: username is the expiry unix time, password is HMAC-SHA1. */

export async function mintTurn({ secret, urls, ttl = 3600, now = Date.now(), hmac }) {
  const expiry = Math.floor(now / 1000) + ttl;
  const username = String(expiry);
  const credential = await hmac(secret, username);
  return { urls, username, credential };
}

export async function hmacSha1Base64(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  let text = '';
  for (const byte of new Uint8Array(sig)) text += String.fromCharCode(byte);
  return btoa(text);
}
