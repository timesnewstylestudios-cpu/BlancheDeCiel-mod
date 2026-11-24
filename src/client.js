/* SPDX-License-Identifier: GPL-3.0-or-later */

export function chatBody({ model, system, user, temperature = 0.2, maxTokens = 1400 }) {
  return {
    model: model || 'grok-4.7',
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
}

async function readChat(response) {
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!response.ok) {
    const detail = json?.error?.message || json?.error || text.slice(0, 280);
    throw new Error(`xAI ${response.status}: ${detail}`);
  }
  return { content: json?.choices?.[0]?.message?.content || '', model: json?.model, usage: json?.usage || null };
}

export async function chatComplete({ baseUrl, apiKey, model, system, user, temperature = 0.2, maxTokens = 1400 }) {
  const root = String(baseUrl || 'https://api.x.ai/v1').replace(/\/$/, '');
  const response = await fetch(`${root}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(chatBody({ model, system, user, temperature, maxTokens })),
  });
  const result = await readChat(response);
  return { ...result, model: result.model || model };
}

export async function chatViaProxy({ proxyUrl, xToken, model, system, user, temperature = 0.2, maxTokens = 1400 }) {
  const root = String(proxyUrl || '').replace(/\/$/, '');
  const response = await fetch(`${root}/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${xToken}`,
    },
    body: JSON.stringify(chatBody({ model, system, user, temperature, maxTokens })),
  });
  return readChat(response);
}
