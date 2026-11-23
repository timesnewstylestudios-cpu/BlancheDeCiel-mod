/* SPDX-License-Identifier: GPL-3.0-or-later */

export async function chatComplete({ baseUrl, apiKey, model, system, user, temperature = 0.2, maxTokens = 1400 }) {
  const root = String(baseUrl || 'https://api.x.ai/v1').replace(/\/$/, '');
  const response = await fetch(`${root}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'grok-4.7',
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!response.ok) {
    const detail = json?.error?.message || text.slice(0, 280);
    throw new Error(`xAI ${response.status}: ${detail}`);
  }
  const content = json?.choices?.[0]?.message?.content || '';
  return { content, model: json?.model || model, usage: json?.usage || null };
}
