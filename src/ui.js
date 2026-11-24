/* SPDX-License-Identifier: GPL-3.0-or-later */

import { translate } from './i18n.js';
import { CATEGORY_ORDER } from './palette.js';
import { clampSize, clampZoom, paintFor, THEMES } from './themes.js';
import { beginLogin } from './oauth.js';
import featuresDoc from '../docs/funktionen.md?raw';
import examplesDoc from '../docs/beispiele.md?raw';
import laterDoc from '../docs/vorschlaege.md?raw';
import { blocksInCategory, createBlock, labelFor, specByOpcode } from './catalog.js';
import { applyBdl, errorText, extractBdl } from './bdl.js';
import { cloneData, createProject, uid } from './model.js';
import bdlDoc from '../docs/bdl.md?raw';
import { SCALE_BDL, TABLE_BDL, SAMPLE_EXTENSION } from './examples.js';
import { exportSb3 } from './sb3.js';
import { analyzeBytes } from './importfile.js';
import { buildAiMessages } from './prompt.js';
import { chatComplete } from './client.js';
import { createStageView } from './stageview.js';
import { bluetoothAvailable, bluetoothPing, chromeIntentUrl, linkPaths } from './bluetooth.js';
import { COSTUME_LIBRARY, SOUND_LIBRARY } from './library.js';
import { addBackpackItem, loadBackpack, removeBackpackItem, saveBackpack } from './backpack.js';
import { qrSvg } from './qr.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function parentList(script, route) {
  const parts = route === '' ? [] : route.split('.');
  let list = script.blocks;
  for (let index = 0; index < parts.length - 1; index += 2) {
    const block = list[Number(parts[index])];
    list = parts[index + 1] === 'e' ? block.elseBody : block.body;
  }
  return { list, index: Number(parts[parts.length - 1] || 0) };
}

function blockFromRoute(script, route) {
  const { list, index } = parentList(script, route);
  return list[index];
}

export function mount(root, ctx) {
  const { session, runtime, settings, saveSettings, gridApi, audio, extensions } = ctx;
  const state = {
    category: 'motion',
    spriteId: session.project.sprites.find((sprite) => !sprite.isStage)?.id || session.project.sprites[0]?.id,
    selection: null,
    pane: 'ai',
    tool: 'ai',
    status: '',
    analysis: null,
    editing: null,
  };
  const wideQuery = window.matchMedia('(min-width: 1000px)');

  root.innerHTML = `
    <div class="app wide" id="shell" data-pane="ai">
      <header>
        <div class="brand"><strong>BlancheDeCiel</strong><span id="tagline"></span></div>
        <input id="project-name" aria-label="Projekt">
        <button class="primary" id="flag" type="button"></button>
        <button class="stop" id="stop" type="button"></button>
        <button id="undo" type="button"></button>
        <button id="redo" type="button"></button>
        <button id="lang-de" type="button">DE</button>
        <button id="lang-en" type="button">EN</button>
        <div class="file-menu row">
          <button id="new" type="button"></button>
          <button id="open" type="button"></button>
          <button id="save" type="button"></button>
          <button id="export" type="button"></button>
          <select id="examples"></select>
        </div>
      </header>
      <nav class="tabs" id="tabs"></nav>
      <div class="workspace-row" id="workspace-row">
        <nav class="cats" id="cats"></nav>
        <div class="split" data-split="cats" role="separator" aria-orientation="vertical"></div>
        <aside class="palette" id="palette"></aside>
        <div class="split" data-split="palette" role="separator" aria-orientation="vertical"></div>
        <main class="workspace" id="workspace"></main>
        <div class="split" data-split="stage" role="separator" aria-orientation="vertical"></div>
        <aside class="side">
          <div class="stage-tools row">
            <button type="button" id="stage-small"></button>
            <button type="button" id="stage-full"></button>
            <button type="button" id="code-out">−</button>
            <button type="button" id="code-in">+</button>
          </div>
          <div class="stage-mount" id="stage-mount"></div>
          <div class="split split-y" data-split="stageh" role="separator" aria-orientation="horizontal"></div>
          <div class="sprites" id="sprites"></div>
          <div class="tool-tabs" id="tool-tabs"></div>
          <div class="tool" id="tool"></div>
        </aside>
      </div>
      <footer id="status"></footer>
    </div>
    <div id="ghost"></div>
    <div id="draw" hidden>
      <canvas id="draw-canvas" width="160" height="160"></canvas>
      <div class="row"><input id="draw-color" type="color" value="#4C97FF"><button type="button" id="draw-clear"></button><button type="button" id="draw-save"></button><button type="button" id="draw-close">OK</button></div>
    </div>
    <form id="ask" hidden>
      <div id="ask-text" class="grow"></div>
      <input id="ask-input" class="grow">
      <button type="submit">OK</button>
    </form>
    <input id="file" type="file" hidden accept=".sb3,.pmp,.zip,.json,.html,.htm,.js,.bdl,.txt">`;

  const shell = root.querySelector('#shell');
  const stageView = createStageView(root.querySelector('#stage-mount'));
  const fileInput = root.querySelector('#file');
  let askResolve = null;

  const t = (key) => translate(settings.lang, key);
  const sprite = () => session.project.sprites.find((item) => item.id === state.spriteId) || session.project.sprites[0];
  const setStatus = (text) => { state.status = text; root.querySelector('#status').textContent = text; };

  function applyLayout() {
    const layout = settings.layout || {};
    const row = root.querySelector('#workspace-row');
    if (!row || !wideQuery.matches) {
      if (row) row.style.gridTemplateColumns = '';
      return;
    }
    const cats = clampSize(layout.cats, 72, 180);
    const palette = clampSize(layout.palette, 180, 520);
    const stage = settings.stageMode === 'small' ? 240 : clampSize(layout.stage, 220, 680);
    row.style.gridTemplateColumns = `${cats}px 10px ${palette}px 10px minmax(180px,1fr) 10px ${stage}px`;
    const mount = root.querySelector('#stage-mount');
    if (mount && settings.stageMode !== 'full') mount.style.height = `${clampSize(layout.stageHeight, 140, 640)}px`;
    const scripts = root.querySelector('#scripts');
    if (scripts) scripts.style.zoom = String(clampZoom(settings.codeZoom || 1));
  }

  function labels() {
    root.querySelector('#tagline').textContent = t('tagline');
    root.querySelector('#flag').textContent = t('flag');
    root.querySelector('#stop').textContent = t('stop');
    root.querySelector('#undo').textContent = t('undo');
    root.querySelector('#redo').textContent = t('redo');
    root.querySelector('#new').textContent = t('newProject');
    root.querySelector('#open').textContent = t('open');
    root.querySelector('#save').textContent = t('save');
    root.querySelector('#export').textContent = t('exportSb3');
    const names = { square: t('exampleSquare'), scale: t('exampleScale'), table: t('exampleTable') };
    const select = root.querySelector('#examples');
    const current = select.value;
    select.innerHTML = `<option value="">${esc(t('examples'))}</option>` + Object.entries(names).map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('');
    select.value = current;
    root.querySelector('#project-name').value = session.project.name || '';
    const small = root.querySelector('#stage-small');
    if (small) small.textContent = t('stageSmall');
    const full = root.querySelector('#stage-full');
    if (full) full.textContent = t('stageFull');
    applyLayout();
    const drawSave = root.querySelector('#draw-save');
    if (drawSave) drawSave.textContent = t('drawSave');
    const drawClear = root.querySelector('#draw-clear');
    if (drawClear) drawClear.textContent = '×';
    const tabs = wideQuery.matches
      ? [['ai', 'ai'], ['import', 'import'], ['grid', 'grid'], ['unix', 'unix'], ['backpack', 'backpack'], ['settings', 'settings'], ['help', 'help']]
      : [['blocks', 'blocks'], ['scripts', 'scripts'], ['stage', 'stage'], ['ai', 'ai'], ['import', 'import'], ['grid', 'grid'], ['unix', 'unix'], ['backpack', 'backpack'], ['settings', 'settings'], ['help', 'help']];
    root.querySelector('#tabs').innerHTML = tabs.map(([id, key]) => `<button type="button" data-pane="${id}" class="${state.pane === id || (wideQuery.matches && state.tool === id) ? 'active' : ''}">${esc(t(key))}</button>`).join('');
    root.querySelector('#tool-tabs').innerHTML = ['ai', 'import', 'grid', 'unix', 'backpack', 'settings', 'help'].map((id) => `<button type="button" data-tool="${id}" class="${state.tool === id ? 'active' : ''}">${esc(t(id))}</button>`).join('');
    shell.dataset.pane = wideQuery.matches ? 'wide' : state.pane;
    shell.classList.toggle('wide', wideQuery.matches);
    for (const section of root.querySelectorAll('[data-tool-panel]')) {
      section.hidden = section.dataset.toolPanel !== state.tool;
    }
    setStatus(state.status || t('ready'));
  }

  function renderCats() {
    root.querySelector('#cats').innerHTML = CATEGORY_ORDER.map((id) => {
      const color = paintFor(settings.theme, id);
      const name = settings.lang === 'en' ? color.en : color.de;
      return `<button type="button" data-category="${id}" style="background:${color.c1}" class="${state.category === id ? 'active' : ''}">${esc(name)}</button>`;
    }).join('');
  }

  function renderPalette() {
    const color = paintFor(settings.theme, state.category);
    const items = blocksInCategory(state.category).map((spec) => {
      const made = createBlock(spec.opcode);
      return `<div class="block ${spec.type}" data-opcode="${spec.opcode}" style="background:${color.c1}">${renderLabel(labelFor(spec, settings.lang), made, spec, '', '')}</div>`;
    }).join('');
    let extra = '';
    if (state.category === 'variables' || state.category === 'lists') {
      extra = `<div class="row"><input id="new-name" placeholder="${esc(t('varName'))}"><button type="button" id="make-var">${esc(t('newVar'))}</button><button type="button" id="make-list">${esc(t('newList'))}</button></div>`;
    }
    if (state.category === 'myblocks') {
      const procs = sprite().scripts.filter((script) => script.proc);
      extra += procs.map((script) => `<button type="button" data-call="${esc(script.proc)}">${esc(t('proc'))} ${esc(script.proc)}${script.params?.length ? ` (${esc(script.params.join(', '))})` : ''}</button>`).join('');
      extra += `<div class="row"><input id="proc-name" placeholder="${esc(t('newBlock'))}"><input id="proc-params" placeholder="${esc(t('params'))}"></div><label class="row"><input id="proc-warp" type="checkbox"> ${esc(t('warp'))}</label><button type="button" id="make-proc">${esc(t('create'))}</button><button type="button" id="load-ext">${esc(t('loadExtension'))}</button>`;
    }
    if (state.category === 'looks') {
      extra += `<p class="hint">${esc(t('library'))}</p><div class="row">${COSTUME_LIBRARY.map((item) => `<button type="button" data-costume="${esc(item.name)}">${esc(item.name)}</button>`).join('')}<button type="button" id="open-draw">${esc(t('draw'))}</button></div>`;
    }
    if (state.category === 'sound' || state.category === 'audio') {
      extra += `<p class="hint">${esc(t('library'))}</p><div class="row">${SOUND_LIBRARY.map((item) => `<button type="button" data-sound="${esc(item.name)}">${esc(item.name)}</button>`).join('')}</div>`;
    }
    for (const ext of extensions.list()) {
      if (state.category !== 'myblocks' && state.category !== 'ai') continue;
      extra += ext.blocks.map((block) => `<button type="button" data-ext="${esc(ext.id)}" data-ext-op="${esc(block.opcode)}" style="background:${ext.color};color:white">${esc(block.text)}</button>`).join('');
    }
    root.querySelector('#palette').innerHTML = `<p class="hint">${esc(t('clickAdd'))}</p>${extra}${items}`;
  }

  function renderArg(expr, specArg, scriptId, route, argpath) {
    if (expr?.kind === 'block') {
      const child = specByOpcode(expr.opcode);
      const inner = (expr.args || []).map((arg, index) => renderArg(arg, child?.args?.[index], scriptId, route, `${argpath}.${index}`)).join(' ');
      const title = child ? labelFor(child, settings.lang).replace(/%\d+/g, '').trim() : expr.opcode;
      return `<span class="nested">${esc(title)} ${inner}<button type="button" data-clear="${esc(scriptId)}|${esc(route)}|${esc(argpath)}">×</button></span>`;
    }
    const value = expr?.value ?? '';
    const attrs = `data-script="${esc(scriptId)}" data-route="${esc(route)}" data-argpath="${esc(argpath)}"`;
    if (specArg?.type === 'menu') {
      const options = specArg.options.map((option) => `<option value="${esc(option)}" ${String(value) === option ? 'selected' : ''}>${esc(option)}</option>`).join('');
      return `<select ${attrs}>${options}</select>`;
    }
    if (specArg?.type === 'color') return `<input type="color" value="${esc(value || '#000000')}" ${attrs}>`;
    const numeric = expr?.kind === 'num' || specArg?.type === 'number';
    return `<input class="${numeric ? 'num' : ''}" value="${esc(value)}" ${attrs}>`;
  }

  function renderLabel(template, block, spec, scriptId, route) {
    return template.split(/(%\d+)/g).map((part) => {
      const match = /^%(\d+)$/.exec(part);
      if (!match) return esc(part);
      const index = Number(match[1]) - 1;
      return renderArg(block.args[index], spec.args?.[index], scriptId, route, String(index));
    }).join('');
  }

  function renderBlock(block, scriptId, route) {
    if (block.opcode === 'ext') {
      const ext = extensions.get(block.args[0]?.value);
      const info = ext?.blocks.find((item) => item.opcode === block.args[1]?.value);
      const text = info?.text || `${block.args[0]?.value || 'ext'} ${block.args[1]?.value || ''}`;
      const fake = { args: block.args.slice(2) };
      const spec = { args: info?.args || [] };
      const selected = state.selection && state.selection.scriptId === scriptId && state.selection.route === route;
      return `<article class="block command ${selected ? 'selected' : ''}" data-script="${esc(scriptId)}" data-route="${esc(route)}" style="background:${info?.color || '#5B4B8A'}"><div class="rowline">${renderLabel(text, fake, spec, scriptId, route)}</div></article>`;
    }
    const spec = specByOpcode(block.opcode);
    const color = paintFor(settings.theme, spec?.cat || 'control');
    const selected = state.selection && state.selection.scriptId === scriptId && state.selection.route === route;
    const label = spec ? renderLabel(labelFor(spec, settings.lang), block, spec, scriptId, route) : esc(block.opcode);
    let mouth = '';
    if (block.body) {
      mouth += `<div class="mouth">${(block.body || []).map((child, index) => renderBlock(child, scriptId, `${route}.b.${index}`)).join('')}</div>`;
    }
    if (block.elseBody) {
      mouth += `<div class="else-label">${esc(t('else'))}</div><div class="mouth">${block.elseBody.map((child, index) => renderBlock(child, scriptId, `${route}.e.${index}`)).join('')}</div>`;
    }
    return `<article class="block ${spec?.type || 'command'} ${selected ? 'selected' : ''}" data-script="${esc(scriptId)}" data-route="${esc(route)}" style="background:${color.c1}"><div class="rowline">${label}</div>${mouth}</article>`;
  }

  function renderWorkspace() {
    const current = sprite();
    if (!current) {
      root.querySelector('#workspace').innerHTML = '';
      return;
    }
    const cards = current.scripts.map((script) => {
      const blocks = script.blocks.map((block, index) => renderBlock(block, script.id, String(index))).join('');
      const title = script.proc ? `${t('proc')} ${script.proc}` : `${Math.round(script.x)}, ${Math.round(script.y)}`;
      return `<section class="script-card" data-script-id="${esc(script.id)}" style="left:${script.x}px;top:${script.y}px"><header data-move-script="${esc(script.id)}">${esc(title)}</header>${blocks || `<div class="hint">${esc(t('emptyDrop'))}</div>`}</section>`;
    }).join('');
    root.querySelector('#workspace').innerHTML = `<div class="scripts" id="scripts">${cards}</div><div class="row"><button type="button" id="delete-block">${esc(t('deleteBlock'))}</button></div>`;
  }

  function renderSprites() {
    root.querySelector('#sprites').innerHTML = session.project.sprites.filter((item) => !item.isClone).map((item) => `
      <div class="sprite-chip ${item.id === sprite()?.id ? 'active' : ''}" data-sprite="${esc(item.id)}">
        <input data-rename="${esc(item.id)}" value="${esc(item.name)}" aria-label="${esc(t('rename'))}">
      </div>`).join('') + `<button type="button" id="add-sprite">${esc(t('addSprite'))}</button>${sprite()?.isStage ? '' : `<button type="button" id="del-sprite">${esc(t('deleteSprite'))}</button>`}<label class="sprite-chip">${esc(t('costume'))}<input id="costume" type="file" accept="image/*"></label><label class="sprite-chip">${esc(t('sound'))}<input id="sound" type="file" accept="audio/*,.wav,.mp3,.ogg,.webm,.m4a,.flac"></label>`;
  }

  function buildTools() {
    root.querySelector('#tool').innerHTML = `
      <section data-tool-panel="ai">
        <p>${esc(t('aiIntro'))}</p>
        <p id="x-user-ai"></p>
        <div class="row"><button type="button" class="primary" data-x-login>${esc(t('xLogin'))}</button><button type="button" id="ai-local">${esc(t('localSuggest'))}</button><button type="button" id="ai-send">${esc(t('aiSend'))}</button></div>
        <textarea id="ai-request"></textarea>
        <span id="ai-estimate"></span>
        <label>${esc(t('aiResult'))}<textarea id="ai-output"></textarea></label>
        <div class="row"><button type="button" class="primary" id="ai-apply">${esc(t('aiApply'))}</button><button type="button" id="ai-learn">${esc(t('learnOrder'))}</button></div>
        <div class="row"><button type="button" id="ai-export">${esc(t('exportWeights'))}</button><button type="button" id="ai-import">${esc(t('importWeights'))}</button></div>
        <p id="ai-status"></p>
      </section>
      <section data-tool-panel="import">
        <h2>${esc(t('importTitle'))}</h2>
        <p class="note">${esc(t('licenseNote'))}</p>
        <button type="button" id="import-pick">${esc(t('importPick'))}</button>
        <h3>${esc(t('pseudo'))}</h3>
        <pre class="out" id="pseudo"></pre>
        <h3>${esc(t('warnings'))}</h3>
        <pre class="out" id="warnings"></pre>
        <div class="row"><button type="button" id="import-apply">${esc(t('importApply'))}</button><button type="button" id="import-ai">${esc(t('importToAi'))}</button></div>
      </section>
      <section data-tool-panel="grid">
        <p>${esc(t('gridIntro'))}</p>
        <p>${esc(t('yourId'))}: <code id="node-id"></code></p>
        <p>${esc(t('peers'))}: <span id="peer-count">0</span> <span id="peer-state"></span></p>
        <div class="row"><button type="button" id="make-offer">${esc(t('offer'))}</button><button type="button" id="take-offer">${esc(t('pasteOffer'))}</button><button type="button" id="take-answer">${esc(t('pasteAnswer'))}</button></div>
        <textarea id="sdp" placeholder="${esc(t('sdp'))}"></textarea>
        <p>${esc(t('bluetooth'))}: <span id="bt-state"></span></p>
        <p id="bt-paths"></p>
        <div class="row"><button type="button" id="bt-try">${esc(t('btTry'))}</button><a id="chrome-open" href="#">${esc(t('chromeOpen'))}</a></div>
        <label>${esc(t('room'))}<input id="room" type="text" value="himmel"></label>
        <label>${esc(t('tracker'))}<input id="tracker" type="text" placeholder="wss://tracker.openwebtorrent.com"></label>
        <p class="hint">${esc(t('trackerHint'))}</p>
        <div class="row"><button type="button" id="join-room">${esc(t('joinRoom'))}</button><button type="button" id="join-meet">${esc(t('serverUrl'))}</button></div>
        <p class="hint">${esc(t('qrHint'))}</p>
        <div id="qr"></div>
        <h3>${esc(t('tables'))}</h3>
        <pre class="out" id="table-view"></pre>
      </section>
      <section data-tool-panel="unix">
        <p>${esc(t('shellIntro'))}</p>
        <input id="shell-line" type="text" value="audit">
        <button type="button" id="shell-run">${esc(t('shellRun'))}</button>
        <pre class="out" id="shell-out"></pre>
      </section>
      <section data-tool-panel="settings">
        <p id="x-user"></p>
        <label>${esc(t('serverUrl'))}<input id="server-url" type="text" spellcheck="false" placeholder="https://…"></label>
        <label>${esc(t('xClient'))}<input id="x-client" type="text" spellcheck="false"></label>
        <div class="row"><button type="button" class="primary" data-x-login>${esc(t('xLogin'))}</button><button type="button" id="use-local">${esc(t('useLocal'))}</button></div>
        <label>${esc(t('theme'))}<select id="theme">${Object.entries(THEMES).map(([id, item]) => `<option value="${id}">${esc(settings.lang === 'en' ? item.en : item.de)}</option>`).join('')}</select></label>
        <details>
          <summary>${esc(t('advanced'))}</summary>
        <label>${esc(t('apiKey'))}<input id="api-key" type="password" autocomplete="off" spellcheck="false"></label>
        <label class="row"><input id="remember-key" type="checkbox"> ${esc(t('rememberKey'))}</label>
        <p class="note">${esc(t('rememberWarn'))}</p>
        <label class="row"><input id="use-key" type="checkbox"> ${esc(t('apiKey'))}</label>
        <label>${esc(t('model'))}<input id="api-model" type="text"></label>
        <label>${esc(t('baseUrl'))}<input id="api-base" type="text"></label>
        <label>${esc(t('tracker'))}<input id="tracker-setting" type="text"></label>
        <label class="row"><input id="ai-blocks" type="checkbox"> ${esc(t('aiBlocks'))}</label>
        <p class="hint">${esc(t('aiBlocksHint'))}</p>
        <button type="button" id="forget-key">${esc(t('forgetKey'))}</button>
        </details>
      </section>
      <section data-tool-panel="backpack">
        <button type="button" id="pack-script">${esc(t('backpackIn'))}</button>
        <div id="backpack-list"></div>
      </section>
      <section data-tool-panel="help">
        <p>${esc(t('helpIntro'))}</p>
        <div id="help-body"></div>
      </section>`;
    root.querySelector('#api-key').value = settings.apiKey || '';
    const remember = root.querySelector('#remember-key');
    if (remember) remember.checked = !!settings.rememberKey;
    const server = root.querySelector('#server-url');
    if (server) server.value = settings.serverUrl || settings.proxyUrl || '';
    const useKey = root.querySelector('#use-key');
    if (useKey) useKey.checked = settings.aiMode === 'key';
    const whoAi = root.querySelector('#x-user-ai');
    if (whoAi) whoAi.textContent = settings.xUser ? `@${settings.xUser}` : '';
    const client = root.querySelector('#x-client');
    if (client) client.value = settings.xClientId || '';
    const who = root.querySelector('#x-user');
    if (who) who.textContent = settings.xUser ? `@${settings.xUser}` : '';
    const theme = root.querySelector('#theme');
    if (theme) theme.value = settings.theme || 'light';
    root.querySelector('#api-model').value = settings.model;
    root.querySelector('#api-base').value = settings.baseUrl;
    const tracker = root.querySelector('#tracker');
    if (tracker) tracker.value = settings.trackerUrl || '';
    const trackerSetting = root.querySelector('#tracker-setting');
    if (trackerSetting) trackerSetting.value = settings.trackerUrl || '';
    const paths = linkPaths();
    const pathLine = root.querySelector('#bt-paths');
    if (pathLine) pathLine.textContent = `${t('paths')}: ${Object.entries(paths).filter(([, on]) => on).map(([name]) => name).join(', ') || t('btNo')}`;
    const chrome = root.querySelector('#chrome-open');
    if (chrome) chrome.href = chromeIntentUrl();
    root.querySelector('#ai-blocks').checked = !!session.project.aiBlocksEnabled;
    root.querySelector('#node-id').textContent = gridApi.node.id.slice(0, 12);
    root.querySelector('#bt-state').textContent = bluetoothAvailable() ? t('btYes') : t('btNo');
  }

  function renderHelp() {
    const body = root.querySelector('#help-body');
    if (!body) return;
    body.innerHTML = CATEGORY_ORDER.map((id) => {
      const color = paintFor(settings.theme, id);
      const title = settings.lang === 'en' ? color.en : color.de;
      const lines = blocksInCategory(id).map((spec) => `<li><code>${esc(spec.opcode)}</code> — ${esc(labelFor(spec, settings.lang))}</li>`).join('');
      return `<h3 style="color:${color.c3}">${esc(title)}</h3><ul>${lines}</ul>`;
    }).join('') + `<h3>${esc(t('features'))}</h3><pre class="out">${esc(featuresDoc)}</pre><h3>Beispiele</h3><pre class="out">${esc(examplesDoc)}</pre><h3>Vorschläge für später</h3><pre class="out">${esc(laterDoc)}</pre><h3>${esc(t('dsl'))}</h3><pre class="out">${esc(bdlDoc)}</pre>`;
  }

  function refresh() {
    if (!session.project.sprites.some((item) => item.id === state.spriteId)) {
      state.spriteId = session.project.sprites.find((item) => !item.isStage)?.id || session.project.sprites[0]?.id;
    }
    labels();
    renderCats();
    renderPalette();
    renderWorkspace();
    renderSprites();
    const tables = root.querySelector('#table-view');
    if (tables) tables.textContent = JSON.stringify(session.project.tables, null, 2);
    const pack = root.querySelector('#backpack-list');
    if (pack) {
      const items = loadBackpack();
      pack.innerHTML = items.length
        ? items.map((item) => `<div class="row"><button type="button" data-unpack="${esc(item.id)}">${esc(item.type)} ${esc(item.name || '')}</button><button type="button" data-drop-pack="${esc(item.id)}">×</button></div>`).join('')
        : `<p>${esc(t('backpackEmpty'))}</p>`;
    }
    const peers = root.querySelector('#peer-count');
    if (peers) {
      peers.textContent = String(gridApi.node.peerCount());
      root.querySelector('#peer-state').textContent = gridApi.node.peerCount() ? t('connected') : t('noPeers');
    }
    const box = root.querySelector('#ai-blocks');
    if (box) box.checked = !!session.project.aiBlocksEnabled;
    renderHelp();
    applyLayout();
  }

  function insertMade(made, spec) {
    session.update((project) => {
      const current = project.sprites.find((item) => item.id === state.spriteId) || project.sprites[0];
      if (spec?.type === 'hat') {
        const script = { id: uid(), x: 36 + current.scripts.length * 16, y: 36, proc: null, blocks: [made] };
        current.scripts.push(script);
        state.selection = { scriptId: script.id, route: '0' };
        return;
      }
      if (spec?.type === 'reporter' || spec?.type === 'boolean') {
        const expr = { kind: 'block', opcode: made.opcode, args: made.args };
        if (!state.selection) return;
        const script = current.scripts.find((item) => item.id === state.selection.scriptId);
        const block = script && blockFromRoute(script, state.selection.route);
        if (!block?.args?.length) return;
        const slot = block.args.findIndex((arg, index) => specByOpcode(block.opcode)?.args?.[index]?.type === 'bool' || arg.kind !== 'block');
        block.args[Math.max(0, slot)] = expr;
        return;
      }
      let script = state.selection && current.scripts.find((item) => item.id === state.selection.scriptId);
      if (!script) script = [...current.scripts].reverse().find((item) => !item.proc);
      if (!script) {
        script = { id: uid(), x: 48, y: 48, proc: null, blocks: [createBlock('whenflag')] };
        current.scripts.push(script);
      }
      if (state.selection && script.id === state.selection.scriptId) {
        const { list, index } = parentList(script, state.selection.route);
        list.splice(index + 1, 0, made);
        state.selection = { scriptId: script.id, route: state.selection.route.replace(/\d+$/, String(index + 1)) };
      } else {
        script.blocks.push(made);
        state.selection = { scriptId: script.id, route: String(script.blocks.length - 1) };
      }
    });
  }

  function deleteSelection() {
    if (!state.selection) return;
    session.update((project) => {
      const current = project.sprites.find((item) => item.id === state.spriteId);
      const script = current?.scripts.find((item) => item.id === state.selection.scriptId);
      if (!script) return;
      const { list, index } = parentList(script, state.selection.route);
      list.splice(index, 1);
      if (!script.blocks.length && !script.proc) current.scripts = current.scripts.filter((item) => item !== script);
      state.selection = null;
    });
  }

  function readArgTarget(input) {
    const current = sprite();
    const script = current.scripts.find((item) => item.id === input.dataset.script);
    if (!script) return null;
    let block = blockFromRoute(script, input.dataset.route);
    if (block?.opcode === 'ext') {
      const parts = input.dataset.argpath.split('.').map(Number);
      let args = block.args.slice(2);
      for (let index = 0; index < parts.length - 1; index += 1) {
        const next = args[parts[index]];
        if (!next || next.kind !== 'block') return null;
        args = next.args;
      }
      const index = parts[parts.length - 1];
      return { expr: args[index], holder: args, index };
    }
    const parts = input.dataset.argpath.split('.').map(Number);
    let args = block.args;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const next = args[parts[index]];
      if (!next || next.kind !== 'block') return null;
      args = next.args;
    }
    const index = parts[parts.length - 1];
    return { expr: args[index], holder: args, index };
  }

  function onLiteral(input) {
    const target = readArgTarget(input);
    if (!target?.expr) return;
    if (target.expr.kind === 'num') target.expr.value = Number(input.value) || 0;
    else target.expr.value = input.type === 'color' ? input.value : input.value;
  }

  let suppressClick = false;
  root.addEventListener('click', (event) => {
    if (suppressClick) { suppressClick = false; return; }
    const pane = event.target.closest('button[data-pane]');
    if (pane) {
      state.pane = pane.dataset.pane;
      if (!['blocks', 'scripts', 'stage'].includes(state.pane)) state.tool = state.pane;
      refresh();
      return;
    }
    const tool = event.target.closest('button[data-tool]');
    if (tool) {
      state.tool = tool.dataset.tool;
      state.pane = tool.dataset.tool;
      refresh();
      return;
    }
    const category = event.target.closest('[data-category]');
    if (category) {
      state.category = category.dataset.category;
      refresh();
      return;
    }
    const opcode = event.target.closest('[data-opcode]');
    if (opcode && event.target.closest('#palette')) {
      const spec = specByOpcode(opcode.dataset.opcode);
      insertMade(createBlock(spec.opcode), spec);
      return;
    }
    const call = event.target.closest('[data-call]');
    if (call) {
      const made = createBlock('call');
      made.args[0] = { kind: 'str', value: call.dataset.call };
      insertMade(made, specByOpcode('call'));
      return;
    }
    const ext = event.target.closest('[data-ext]');
    if (ext) {
      const info = extensions.get(ext.dataset.ext)?.blocks.find((block) => block.opcode === ext.dataset.extOp);
      const made = {
        id: uid(),
        opcode: 'ext',
        args: [{ kind: 'str', value: ext.dataset.ext }, { kind: 'str', value: ext.dataset.extOp }, ...(info?.args || []).map((arg) => structuredClone(arg))],
        body: info?.type === 'c' || info?.type === 'celse' ? [] : null,
        elseBody: info?.type === 'celse' ? [] : null,
      };
      insertMade(made, { type: info?.type === 'hat' ? 'hat' : 'command' });
      return;
    }
    const block = event.target.closest('.workspace .block');
    if (block && !event.target.closest('input,select,button')) {
      state.selection = { scriptId: block.dataset.script, route: block.dataset.route };
      renderWorkspace();
      return;
    }
    const spriteChip = event.target.closest('[data-sprite]');
    if (spriteChip && !event.target.matches('input')) {
      state.spriteId = spriteChip.dataset.sprite;
      state.selection = null;
      refresh();
    }
  });

  root.addEventListener('input', (event) => {
    if (event.target.matches('.block input, .block select, .nested input, .nested select')) {
      if (!state.editing) state.editing = JSON.stringify(session.project);
      onLiteral(event.target);
    }
    if (event.target.id === 'ai-request') {
      const estimate = root.querySelector('#ai-estimate');
      if (estimate) estimate.textContent = `${buildAiMessages(session.project, event.target.value).estimate} ${t('aiTokens')}`;
    }
  });

  root.addEventListener('change', (event) => {
    if (event.target.matches('.block input, .block select, .nested input, .nested select')) {
      onLiteral(event.target);
      if (state.editing) session.pushUndo(state.editing);
      state.editing = null;
      session.touch();
    }
    if (event.target.id === 'examples' && event.target.value) {
      const value = event.target.value;
      event.target.value = '';
      if (value === 'square') session.replace(createProject());
      if (value === 'scale') { const project = createProject(); applyBdl(project, SCALE_BDL); session.replace(project); }
      if (value === 'table') { const project = createProject(); applyBdl(project, TABLE_BDL); session.replace(project); }
      state.spriteId = session.project.sprites.find((item) => !item.isStage)?.id;
    }
    if (event.target.dataset.rename) {
      const name = event.target.value.trim();
      if (!name) return;
      session.update((project) => {
        const item = project.sprites.find((spriteItem) => spriteItem.id === event.target.dataset.rename);
        if (item) item.name = name;
      });
    }
    if (event.target.id === 'costume' && event.target.files?.[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        session.update((project) => {
          const item = project.sprites.find((spriteItem) => spriteItem.id === state.spriteId);
          if (item) { item.costume = reader.result; item.costumeName = file.name; }
        });
        setStatus(t('costumeOk'));
      };
      reader.readAsDataURL(file);
    }
    if (event.target.id === 'sound' && event.target.files?.[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        session.update((project) => {
          const item = project.sprites.find((spriteItem) => spriteItem.id === state.spriteId);
          if (item) item.sounds.push({ name: file.name.replace(/\.[^.]+$/, ''), dataUrl: reader.result });
        });
        setStatus(t('soundOk'));
      };
      reader.readAsDataURL(file);
    }
  });

  root.addEventListener('click', (event) => {
    if (event.target.id === 'delete-block') deleteSelection();
    if (event.target.id === 'add-sprite') {
      session.update((project) => {
        const item = { ...createProject().sprites[1], id: uid(), name: `Figur ${project.sprites.length}`, scripts: [] };
        project.sprites.push(item);
        state.spriteId = item.id;
      });
    }
    if (event.target.id === 'del-sprite') {
      session.update((project) => {
        project.sprites = project.sprites.filter((item) => item.id !== state.spriteId || item.isStage);
      });
    }
    if (event.target.id === 'make-proc') {
      const name = root.querySelector('#proc-name')?.value.trim();
      if (!name) return;
      const params = (root.querySelector('#proc-params')?.value || '').split(/[\s,]+/).filter(Boolean);
      const warp = !!root.querySelector('#proc-warp')?.checked;
      session.update((project) => {
        const item = project.sprites.find((spriteItem) => spriteItem.id === state.spriteId);
        item.scripts = item.scripts.filter((script) => script.proc !== name);
        item.scripts.push({ id: uid(), x: 40, y: 40, proc: name, params, warp, blocks: [] });
      });
      return;
    }
    const costume = event.target.closest('[data-costume]');
    if (costume) {
      const found = COSTUME_LIBRARY.find((item) => item.name === costume.dataset.costume);
      if (!found) return;
      session.update((project) => {
        const item = project.sprites.find((spriteItem) => spriteItem.id === state.spriteId);
        item.costumes.push({ name: found.name, dataUrl: found.dataUrl });
        item.costumeIndex = item.costumes.length - 1;
        item.costume = found.dataUrl;
        item.costumeName = found.name;
      });
      return;
    }
    const sound = event.target.closest('[data-sound]');
    if (sound) {
      const found = SOUND_LIBRARY.find((item) => item.name === sound.dataset.sound);
      if (!found) return;
      session.update((project) => {
        const item = project.sprites.find((spriteItem) => spriteItem.id === state.spriteId);
        item.sounds.push({ name: found.name, dataUrl: found.dataUrl });
      });
      setStatus(t('soundOk'));
      return;
    }
    if (event.target.id === 'open-draw') {
      root.querySelector('#draw').hidden = false;
      return;
    }
    const unpack = event.target.closest('[data-unpack]');
    if (unpack) {
      const item = loadBackpack().find((entry) => entry.id === unpack.dataset.unpack);
      if (item?.type === 'script' && item.script) {
        session.update((project) => {
          const owner = project.sprites.find((spriteItem) => spriteItem.id === state.spriteId);
          const copy = cloneData(item.script);
          copy.id = uid();
          owner.scripts.push(copy);
        });
      }
      return;
    }
    const dropPack = event.target.closest('[data-drop-pack]');
    if (dropPack) {
      saveBackpack(removeBackpackItem(loadBackpack(), dropPack.dataset.dropPack));
      refresh();
      return;
    }
    if (event.target.id === 'load-ext') {
      if (!window.confirm(t('extensionWarn'))) return;
      try { extensions.load(SAMPLE_EXTENSION); refresh(); }
      catch (error) { setStatus(error.message || String(error)); }
      return;
    }
    if (event.target.id === 'make-var' || event.target.id === 'make-list') {
      const name = root.querySelector('#new-name')?.value.trim();
      if (!name) return;
      session.update((project) => {
        const item = project.sprites.find((spriteItem) => spriteItem.id === state.spriteId);
        if (event.target.id === 'make-var') item.variables[name] = 0;
        else item.lists[name] = [];
      });
    }
    const clear = event.target.closest('[data-clear]');
    if (clear) {
      const [scriptId, route, argpath] = clear.dataset.clear.split('|');
      session.update((project) => {
        const current = project.sprites.find((item) => item.id === state.spriteId);
        const script = current.scripts.find((item) => item.id === scriptId);
        const block = blockFromRoute(script, route);
        const parts = argpath.split('.').map(Number);
        let args = block.opcode === 'ext' ? block.args.slice(2) : block.args;
        for (let index = 0; index < parts.length - 1; index += 1) args = args[parts[index]].args;
        args[parts[parts.length - 1]] = { kind: 'num', value: 0 };
      });
    }
  });

  let drag = null;
  root.addEventListener('pointerdown', (event) => {
    const move = event.target.closest('[data-move-script]');
    const paletteBlock = event.target.closest('#palette [data-opcode]');
    if (!move && !paletteBlock) return;
    if (event.target.closest('input,select,button')) return;
    drag = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scriptId: move?.dataset.moveScript || null,
      opcode: paletteBlock?.dataset.opcode || null,
      moved: false,
    };
  });
  root.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    const ghost = root.querySelector('#ghost');
    ghost.textContent = drag.opcode || 'Skript';
    ghost.style.left = `${event.clientX + 8}px`;
    ghost.style.top = `${event.clientY + 8}px`;
    if (drag.scriptId && !drag.opcode) {
      const script = sprite().scripts.find((item) => item.id === drag.scriptId);
      if (script) { script.x += dx; script.y += dy; drag.x = event.clientX; drag.y = event.clientY; renderWorkspace(); }
    }
  });
  root.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    root.querySelector('#ghost').textContent = '';
    if (drag.moved && drag.opcode) {
      const spec = specByOpcode(drag.opcode);
      insertMade(createBlock(spec.opcode), spec);
    } else if (drag.moved && drag.scriptId) session.touch();
    if (drag.moved) suppressClick = true;
    drag = null;
  });

  root.querySelector('#flag').onclick = () => {
    try { audio.context(); } catch { /* unlocked later */ }
    session.checkpoint();
    runtime.start();
    setStatus(t('flag'));
  };
  root.querySelector('#stop').onclick = () => { runtime.stop(); session.touch(); setStatus(t('stop')); };
  root.querySelector('#undo').onclick = () => session.undo();
  root.querySelector('#redo').onclick = () => session.redo();
  root.querySelector('#lang-de').onclick = () => { settings.lang = 'de'; saveSettings(settings); document.documentElement.lang = 'de'; buildTools(); wireTools(); refresh(); };
  root.querySelector('#lang-en').onclick = () => { settings.lang = 'en'; saveSettings(settings); document.documentElement.lang = 'en'; buildTools(); wireTools(); refresh(); };
  root.querySelector('#new').onclick = () => {
    if (!window.confirm(t('confirmNew'))) return;
    session.replace(createProject());
    state.spriteId = session.project.sprites.find((item) => !item.isStage)?.id;
  };
  root.querySelector('#open').onclick = () => fileInput.click();
  root.querySelector('#save').onclick = () => {
    const blob = new Blob([JSON.stringify({ format: 'bdc-1', project: session.project })], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${session.project.name || 'projekt'}.bdc.json`;
    link.click();
    setStatus(t('saved'));
  };
  root.querySelector('#export').onclick = () => {
    const blob = new Blob([exportSb3(session.project)], { type: 'application/zip' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${session.project.name || 'projekt'}.sb3`;
    link.click();
  };
  root.querySelector('#project-name').onchange = (event) => {
    session.update((project) => { project.name = event.target.value || 'Projekt'; });
  };

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    state.analysis = analyzeBytes(file.name, bytes);
    root.querySelector('#pseudo').textContent = state.analysis.pseudo || state.analysis.bdl || state.analysis.source || '';
    root.querySelector('#warnings').textContent = (state.analysis.warnings || []).concat(state.analysis.errors || []).join('\n');
    state.tool = 'import';
    state.pane = 'import';
    refresh();
  };

  function wireTools() {
    root.querySelector('#ai-local').onclick = () => {
      settings.aiMode = 'local';
      saveSettings(settings);
      const text = ctx.local.suggest(session.project);
      state.lastSuggestion = text;
      root.querySelector('#ai-output').value = text;
      root.querySelector('#ai-status').textContent = t('aiApply');
    };
    root.querySelector('#ai-send').onclick = async () => {
      const status = root.querySelector('#ai-status');
      settings.aiMode = 'x';
      saveSettings(settings);
      const server = settings.serverUrl || settings.proxyUrl;
      if (!server || !settings.xToken) { status.textContent = t('aiKeyMissing'); return; }
      const request = root.querySelector('#ai-request').value;
      const messages = buildAiMessages(session.project, request);
      status.textContent = t('aiSending');
      try {
        const result = await ctx.sendChat(messages.system, messages.user);
        const bdl = extractBdl(result.content);
        state.lastSuggestion = bdl;
        root.querySelector('#ai-output').value = bdl;
        status.textContent = t('aiApply');
        if (result.usage) status.textContent += ` (${t('aiUsage')} ${result.usage.total_tokens ?? ''})`;
      } catch (error) {
        status.textContent = `${t('error')}: ${error.message || error}`;
      }
    };
    root.querySelector('#ai-apply').onclick = () => {
      const source = root.querySelector('#ai-output').value || root.querySelector('#ai-request').value;
      const applied = applyBdl(session.project, source);
      const status = root.querySelector('#ai-status');
      if (!applied.ok) status.textContent = applied.errors.map((error) => errorText(error, settings.lang)).join('; ');
      else {
        ctx.local.observe(state.lastSuggestion || '', source);
        ctx.persistLocal?.();
        session.touch();
        status.textContent = t('aiApplied');
      }
    };
    root.querySelector('#ai-learn').onclick = () => {
      const current = sprite();
      ctx.local.learnBlocks((current?.scripts || []).flatMap((script) => script.blocks || []));
      ctx.persistLocal?.();
      root.querySelector('#ai-status').textContent = t('learnOrder');
    };
    root.querySelector('#ai-export').onclick = () => {
      const pack = ctx.local.exportPack();
      gridApi.node.share('gewichte:lokal', [[JSON.stringify(pack)]]);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(pack)], { type: 'application/json' }));
      link.download = 'gewichte.json';
      link.click();
    };
    root.querySelector('#ai-import').onclick = async () => {
      const rows = await gridApi.node.fetch('gewichte:lokal');
      const raw = rows?.[0]?.[0];
      if (!raw) { root.querySelector('#ai-status').textContent = t('importWeights'); return; }
      ctx.local.importPack(JSON.parse(raw));
      ctx.persistLocal?.();
      root.querySelector('#ai-status').textContent = t('importWeights');
    };
    root.querySelector('#shell-run').onclick = async () => {
      const line = root.querySelector('#shell-line').value;
      const settled = await Promise.resolve(ctx.shell(line));
      root.querySelector('#shell-out').textContent = `${settled.out || ''}${settled.err ? `\n${settled.err}` : ''}`;
    };
    root.querySelector('#import-pick').onclick = () => fileInput.click();
    root.querySelector('#import-apply').onclick = () => {
      if (!state.analysis) return;
      if (state.analysis.project) {
        session.replace(state.analysis.project);
        state.spriteId = session.project.sprites.find((item) => !item.isStage)?.id;
        setStatus(t('replaced'));
        return;
      }
      const applied = applyBdl(session.project, state.analysis.bdl || state.analysis.source || '');
      if (!applied.ok) setStatus(applied.errors.map((error) => errorText(error, settings.lang)).join('; '));
      else setStatus(t('aiApplied'));
    };
    root.querySelector('#import-ai').onclick = () => {
      const text = root.querySelector('#pseudo').textContent;
      root.querySelector('#ai-request').value = settings.lang === 'en'
        ? `Rebuild this program with blocks. It is my own code or licensed for this:\n${text}`
        : `Baue dieses Programm mit Blöcken nach. Es ist eigener Code oder die Lizenz erlaubt es:\n${text}`;
      state.tool = 'ai';
      state.pane = 'ai';
      refresh();
    };
    root.querySelector('#make-offer').onclick = async () => {
      try { root.querySelector('#sdp').value = await gridApi.makeOffer(); }
      catch (error) { setStatus(error.message || String(error)); }
    };
    root.querySelector('#take-offer').onclick = async () => {
      try { root.querySelector('#sdp').value = await gridApi.acceptOffer(root.querySelector('#sdp').value.trim()); }
      catch (error) { setStatus(error.message || String(error)); }
    };
    root.querySelector('#take-answer').onclick = async () => {
      try { await gridApi.acceptAnswer(root.querySelector('#sdp').value.trim()); setStatus(t('connected')); }
      catch (error) { setStatus(error.message || String(error)); }
    };
    root.querySelector('#bt-try').onclick = async () => {
      const result = await bluetoothPing();
      setStatus(result.ok ? `${result.path || ''} ${result.name || ''}` : `${t('btNo')}: ${result.reason}`);
    };
    root.querySelector('#join-meet').onclick = () => {
      const url = settings.coordinatorUrl || settings.serverUrl || settings.proxyUrl;
      const room = root.querySelector('#room').value.trim() || 'himmel';
      if (!url) { setStatus(t('serverUrl')); return; }
      try { gridApi.joinMeet(url, room); setStatus(t('connected')); }
      catch (error) { setStatus(error.message || String(error)); }
    };
    root.querySelector('#join-room').onclick = () => {
      const room = root.querySelector('#room').value.trim();
      const url = (root.querySelector('#tracker').value || settings.trackerUrl || '').trim();
      settings.trackerUrl = url;
      saveSettings(settings);
      const qr = root.querySelector('#qr');
      try { qr.innerHTML = room ? qrSvg(`bdc:${room}`) : ''; }
      catch { qr.textContent = room; }
      if (!url) { setStatus(t('trackerHint')); return; }
      try {
        gridApi.joinRoom(url, room, (event) => setStatus(event.type === 'error' ? t('error') : t('connected')));
      } catch (error) {
        setStatus(error.message || String(error));
      }
    };
    root.querySelector('#pack-script').onclick = () => {
      const current = sprite();
      const script = state.selection && current.scripts.find((item) => item.id === state.selection.scriptId);
      if (!script) return;
      saveBackpack(addBackpackItem(loadBackpack(), { type: 'script', name: script.proc || current.name, script }));
      refresh();
    };
    root.querySelector('#tracker-setting').onchange = (event) => {
      settings.trackerUrl = event.target.value.trim();
      saveSettings(settings);
    };
    const persistSettings = () => {
      settings.apiKey = root.querySelector('#api-key').value;
      settings.rememberKey = !!root.querySelector('#remember-key')?.checked;
      settings.model = root.querySelector('#api-model').value.trim() || 'grok-4.7';
      settings.baseUrl = root.querySelector('#api-base').value.trim() || 'https://api.x.ai/v1';
      settings.serverUrl = root.querySelector('#server-url')?.value.trim() || '';
      settings.proxyUrl = settings.serverUrl;
      settings.xClientId = root.querySelector('#x-client')?.value.trim() || '';
      settings.theme = root.querySelector('#theme')?.value || 'light';
      settings.aiMode = root.querySelector('#use-key')?.checked ? 'key' : (settings.aiMode === 'local' ? 'local' : 'x');
      document.documentElement.dataset.theme = settings.theme;
      saveSettings(settings);
      refresh();
    };
    root.querySelector('#api-key').onchange = persistSettings;
    root.querySelector('#remember-key').onchange = persistSettings;
    root.querySelector('#server-url').onchange = persistSettings;
    root.querySelector('#x-client').onchange = persistSettings;
    root.querySelector('#theme').onchange = persistSettings;
    root.querySelector('#use-key').onchange = persistSettings;
    root.querySelectorAll('[data-x-login]').forEach((button) => {
      button.onclick = () => {
        settings.aiMode = 'x';
        saveSettings(settings);
        if (!settings.xClientId || !(settings.serverUrl || settings.proxyUrl)) { setStatus(t('serverUrl')); return; }
        beginLogin(settings.xClientId);
      };
    });
    root.querySelector('#use-local').onclick = () => {
      settings.aiMode = 'local';
      const box = root.querySelector('#use-key');
      if (box) box.checked = false;
      saveSettings(settings);
      setStatus(t('useLocal'));
    };
    root.querySelector('#api-model').onchange = persistSettings;
    root.querySelector('#api-base').onchange = persistSettings;
    root.querySelector('#ai-blocks').onchange = (event) => {
      session.update((project) => { project.aiBlocksEnabled = event.target.checked; });
    };
    root.querySelector('#forget-key').onclick = () => {
      settings.apiKey = '';
      root.querySelector('#api-key').value = '';
      saveSettings(settings);
    };
  }

  buildTools();
  wireTools();
  refresh();
  renderHelp();
  session.subscribe(refresh);
  wideQuery.addEventListener('change', refresh);
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 150);
  });

  const stageSpriteHit = { id: null };
  stageView.view.addEventListener('pointerdown', (event) => {
    const hit = stageView.pointerDown(event, session.project);
    const at = stageView.localScratch(event);
    runtimeInput(at, true);
    if (hit) {
      state.spriteId = hit.cloneParent || hit.id;
      stageSpriteHit.id = hit.id;
      runtime.clickSprite(hit);
      renderSprites();
    }
  });
  stageView.view.addEventListener('pointermove', (event) => {
    const at = stageView.pointerMove(event, session.project);
    runtimeInput(at, true);
  });
  stageView.view.addEventListener('pointerup', () => { stageView.pointerUp(); runtimeInput(null, false); });

  function runtimeInput(at, down) {
    if (at) {
      ctx.input.mouse.x = at.x;
      ctx.input.mouse.y = at.y;
    }
    ctx.input.mouse.down = down;
  }

  root.querySelector('#ask').onsubmit = (event) => {
    event.preventDefault();
    root.querySelector('#ask').hidden = true;
    const value = root.querySelector('#ask-input').value;
    if (askResolve) askResolve(value);
    askResolve = null;
  };

  window.addEventListener('keydown', (event) => {
    const key = mapKey(event);
    if (key) runtime.keydown(key);
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.target.matches('input,textarea')) {
      event.preventDefault();
      deleteSelection();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); session.undo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); session.redo(); }
  });
  window.addEventListener('keyup', (event) => { const key = mapKey(event); if (key) runtime.keyup(key); });

  function frame(now) {
    for (const item of session.project.sprites) {
      if (item.bubble && item.bubble.until < now) item.bubble = null;
    }
    stageView.paint(session.project, state.spriteId, now);
    const peers = root.querySelector('#peer-count');
    if (peers && document.activeElement?.tagName !== 'TEXTAREA') peers.textContent = String(gridApi.node.peerCount());
    runtime.step();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const drawCanvas = root.querySelector('#draw-canvas');
  const drawCtx = drawCanvas.getContext('2d');
  let drawing = false;
  const drawAt = (event) => {
    const rect = drawCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * drawCanvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * drawCanvas.height;
    drawCtx.fillStyle = root.querySelector('#draw-color').value;
    drawCtx.beginPath();
    drawCtx.arc(x, y, 5, 0, Math.PI * 2);
    drawCtx.fill();
  };
  drawCanvas.addEventListener('pointerdown', (event) => { drawing = true; drawAt(event); });
  drawCanvas.addEventListener('pointermove', (event) => { if (drawing) drawAt(event); });
  window.addEventListener('pointerup', () => { drawing = false; });
  root.querySelector('#draw-clear').onclick = () => drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  root.querySelector('#draw-close').onclick = () => { root.querySelector('#draw').hidden = true; };
  root.querySelector('#draw-save').onclick = () => {
    const dataUrl = drawCanvas.toDataURL('image/png');
    session.update((project) => {
      const item = project.sprites.find((spriteItem) => spriteItem.id === state.spriteId);
      item.costumes.push({ name: 'Zeichnung', dataUrl });
      item.costumeIndex = item.costumes.length - 1;
      item.costume = dataUrl;
      item.costumeName = 'Zeichnung';
    });
    root.querySelector('#draw').hidden = true;
  };

  ctx.bridge.sample = (x, y) => stageView.sample(x, y);
  root.querySelector('#stage-small').onclick = () => {
    settings.stageMode = settings.stageMode === 'small' ? 'normal' : 'small';
    saveSettings(settings);
    applyLayout();
  };
  root.querySelector('#stage-full').onclick = () => {
    const mount = root.querySelector('#stage-mount');
    if (!document.fullscreenElement) mount.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  const setZoom = (next) => {
    settings.codeZoom = clampZoom(next);
    saveSettings(settings);
    applyLayout();
  };
  root.querySelector('#code-in').onclick = () => setZoom((settings.codeZoom || 1) + 0.1);
  root.querySelector('#code-out').onclick = () => setZoom((settings.codeZoom || 1) - 0.1);
  root.querySelector('#workspace').addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom((settings.codeZoom || 1) * (event.deltaY < 0 ? 1.05 : 0.95));
  }, { passive: false });
  const pointers = new Map();
  root.querySelector('#workspace').addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  root.querySelector('#workspace').addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || pointers.size < 2) return;
    const previous = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = [...pointers.values()];
    const before = Math.hypot(previous[0].x - previous[1].x, previous[0].y - previous[1].y);
    const after = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y);
    if (before > 0) setZoom((settings.codeZoom || 1) * (after / before));
  });
  root.querySelector('#workspace').addEventListener('pointerup', (event) => pointers.delete(event.pointerId));
  root.querySelector('#workspace').addEventListener('pointercancel', (event) => pointers.delete(event.pointerId));
  root.querySelectorAll('.split').forEach((bar) => {
    bar.addEventListener('pointerdown', (event) => {
      bar.setPointerCapture(event.pointerId);
      const start = { x: event.clientX, y: event.clientY, layout: { ...(settings.layout || {}) } };
      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        const key = bar.dataset.split;
        if (key === 'cats') settings.layout.cats = clampSize(start.layout.cats + dx, 72, 180);
        if (key === 'palette') settings.layout.palette = clampSize(start.layout.palette + dx, 180, 520);
        if (key === 'stage') settings.layout.stage = clampSize(start.layout.stage - dx, 220, 680);
        if (key === 'stageh') settings.layout.stageHeight = clampSize((start.layout.stageHeight || 280) + dy, 140, 640);
        applyLayout();
      };
      const up = () => {
        bar.removeEventListener('pointermove', move);
        bar.removeEventListener('pointerup', up);
        saveSettings(settings);
      };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
  });

  ctx.bridge.ask = (question) => new Promise((resolve) => {
    askResolve = resolve;
    root.querySelector('#ask-text').textContent = question;
    root.querySelector('#ask-input').value = '';
    root.querySelector('#ask').hidden = false;
    root.querySelector('#ask-input').focus();
  });

  return { state, setStatus };
}

function mapKey(event) {
  const map = { ' ': 'space', Spacebar: 'space', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter' };
  if (map[event.key]) return map[event.key];
  if (/^[a-zA-Z]$/.test(event.key)) return event.key.toLowerCase();
  return '';
}

export function installAsk(runtime, ask) {
  runtime.ask = ask;
}
