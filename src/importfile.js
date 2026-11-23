/* SPDX-License-Identifier: GPL-3.0-or-later */

import { extractBdl, parseBdl, applyBdl } from './bdl.js';
import { decompileJs } from './jsparse.js';
import { looksLikeZip, projectFromZip, importProjectJson } from './sb3.js';
import { projectPseudo } from './decompile.js';

function decodeBase64(text) {
  const clean = text.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function extractEmbeddedZip(text) {
  const start = String(text).indexOf('UEsDB');
  if (start < 0) return null;
  let end = start;
  while (end < text.length && /[A-Za-z0-9+/=\s]/.test(text[end])) end += 1;
  try {
    const bytes = decodeBase64(text.slice(start, end));
    if (!looksLikeZip(bytes)) return null;
    return bytes;
  } catch {
    return null;
  }
}

function extractEmbeddedJson(text) {
  const start = text.indexOf('"targets"');
  if (start < 0) return null;
  const brace = text.lastIndexOf('{', start);
  if (brace < 0) return null;
  let depth = 0;
  for (let index = brace; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(brace, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function analyzeText(name, text) {
  const warnings = [];
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.js') || (!lower.endsWith('.html') && /^\s*(function|const|let|var|class)\b/m.test(text || '') && !text.includes('"targets"'))) {
    const js = decompileJs(text);
    return { kind: 'js', ...js, note: 'own-code' };
  }
  if (lower.endsWith('.bdl') || lower.endsWith('.txt')) {
    const parsed = parseBdl(extractBdl(text));
    return { kind: 'bdl', source: extractBdl(text), errors: parsed.errors, warnings, note: 'own-code' };
  }
  const zip = extractEmbeddedZip(text || '');
  if (zip) {
    const project = projectFromZip(zip, warnings);
    if (project) return { kind: 'project', project, warnings, pseudo: projectPseudo(project), note: 'own-code' };
  }
  const embedded = extractEmbeddedJson(text || '');
  if (embedded?.targets) {
    const project = importProjectJson(embedded, {}, warnings);
    return { kind: 'project', project, warnings, pseudo: projectPseudo(project), note: 'own-code' };
  }
  if ((text || '').includes('"format"') && (text || '').includes('bdc')) {
    try {
      const json = JSON.parse(text);
      if (json.project) return { kind: 'bdc', project: json.project, warnings, pseudo: projectPseudo(json.project), note: 'own-code' };
    } catch { /* fall through */ }
  }
  const js = decompileJs(text || '');
  return { kind: js.ok ? 'js' : 'text', ...js, note: 'own-code' };
}

export function analyzeBytes(name, bytes) {
  const warnings = [];
  if (looksLikeZip(bytes)) {
    const project = projectFromZip(bytes, warnings);
    if (!project) return { kind: 'unknown', warnings, note: 'own-code' };
    return { kind: 'project', project, warnings, pseudo: projectPseudo(project), note: 'own-code' };
  }
  const text = new TextDecoder().decode(bytes);
  return analyzeText(name, text);
}

export function applyAnalysis(project, analysis) {
  if (!analysis) return { ok: false, errors: [{ line: 0, code: 'bad-token' }] };
  if (analysis.kind === 'project' || analysis.kind === 'bdc') {
    return { ok: true, replace: analysis.project };
  }
  if (analysis.kind === 'bdl' || analysis.bdl) {
    const source = analysis.source || analysis.bdl;
    return applyBdl(project, source);
  }
  return { ok: false, errors: [{ line: 0, code: 'bad-token' }] };
}
