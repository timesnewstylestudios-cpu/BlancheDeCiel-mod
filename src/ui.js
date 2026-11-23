/* SPDX-License-Identifier: GPL-3.0-or-later */

import { translate } from './i18n.js';
import { categoryColor, CATEGORY_ORDER } from './palette.js';
import { blocksInCategory, createBlock, labelFor, specByOpcode } from './catalog.js';
import { applyBdl, errorText, extractBdl } from './bdl.js';
import { createProject, uid } from './model.js';
import bdlDoc from '../docs/bdl.md?raw';
import { SCALE_BDL, TABLE_BDL, SAMPLE_EXTENSION } from './examples.js';
import { exportSb3 } from './sb3.js';
import { analyzeBytes } from './importfile.js';
import { buildAiMessages } from './prompt.js';
import { chatComplete } from './client.js';
import { createStageView } from './stageview.js';
import { bluetoothAvailable, bluetoothPing } from './bluetooth.js';

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
      <div class="workspace-row">
        <nav class="cats" id="cats"></nav>
        <aside class="palette" id="palette"></aside>
        <main class="workspace" id="workspace"></main>
        <aside class="side">
          <div class="stage-mount" id="stage-mount"></div>
          <div class="sprites" id="sprites"></div>
          <div class="tool-tabs" id="tool-tabs"></div>
          <div class="tool" id="tool"></div>
        </aside>
      </div>
      <footer id="status"></footer>
    </div>
    <div id="ghost"></div>
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
    const tabs = wideQuery.matches
      ? [['ai', 'ai'], ['import', 'import'], ['grid', 'grid'], ['settings', 'settings'], ['help', 'help']]
      : [['blocks', 'blocks'], ['scripts', 'scripts'], ['stage', 'stage'], ['ai', 'ai'], ['import', 'import'], ['grid', 'grid'], ['settings', 'settings'], ['help', 'help']];
    root.querySelector('#tabs').innerHTML = tabs.map(([id, key]) => `<button type="button" data-pane="${id}" class="${state.pane === id || (wideQuery.matches && state.tool === id) ? 'active' : ''}">${esc(t(key))}</button>`).join('');
    root.querySelector('#tool-tabs').innerHTML = ['ai', 'import', 'grid', 'settings', 'help'].map((id) => `<button type="button" data-tool="${id}" class="${state.tool === id ? 'active' : ''}">${esc(t(id))}</button>`).join('');
    shell.dataset.pane = wideQuery.matches ? 'wide' : state.pane;
    shell.classList.toggle('wide', wideQuery.matches);
    for (const section of root.querySelectorAll('[data-tool-panel]')) {
      section.hidden = section.dataset.toolPanel !== state.tool;
    }
    setStatus(state.status || t('ready'));
  }

  function renderCats() {
    root.querySelector('#cats').innerHTML = CATEGORY_ORDER.map((id) => {
      const color = categoryColor(id);
      const name = settings.lang === 'en' ? color.en : color.de;
      return `<button type="button" data-category="${id}" style="background:${color.c1}" class="${state.category === id ? 'active' : ''}">${esc(name)}</button>`;
    }).join('');
  }

  function renderPalette() {
    const color = categoryColor(state.category);
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
      extra += procs.map((script) => `<button type="button" data-call="${esc(script.proc)}">${esc(t('proc'))} ${esc(script.proc)}</button>`).join('');
      extra += `<button type="button" id="load-ext">${esc(t('loadExtension'))}</button>`;
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
    const color = categoryColor(spec?.cat || 'control');
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
    root.querySelector('#sprites').innerHTML = session.project.sprites.map((item) => `
      <div class="sprite-chip ${item.id === sprite()?.id ? 'active' : ''}" data-sprite="${esc(item.id)}">
        <input data-rename="${esc(item.id)}" value="${esc(item.name)}" aria-label="${esc(t('rename'))}">
      </div>`).join('') + `<button type="button" id="add-sprite">${esc(t('addSprite'))}</button>${sprite()?.isStage ? '' : `<button type="button" id="del-sprite">${esc(t('deleteSprite'))}</button>`}<label class="sprite-chip">${esc(t('costume'))}<input id="costume" type="file" accept="image/*"></label><label class="sprite-chip">${esc(t('sound'))}<input id="sound" type="file" accept="audio/*,.wav,.mp3,.ogg,.webm,.m4a,.flac"></label>`;
  }

  function buildTools() {
    root.querySelector('#tool').innerHTML = `
      <section data-tool-panel="ai">
        <p>${esc(t('aiIntro'))}</p>
        <textarea id="ai-request"></textarea>
        <div class="row"><button type="button" class="primary" id="ai-send">${esc(t('aiSend'))}</button><span id="ai-estimate"></span></div>
        <label>${esc(t('aiResult'))}<textarea id="ai-output"></textarea></label>
        <button type="button" id="ai-apply">${esc(t('aiApply'))}</button>
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
        <button type="button" id="bt-try">${esc(t('btTry'))}</button>
        <h3>${esc(t('tables'))}</h3>
        <pre class="out" id="table-view"></pre>
      </section>
      <section data-tool-panel="settings">
        <label>${esc(t('apiKey'))}<input id="api-key" type="password" autocomplete="off"></label>
        <label>${esc(t('model'))}<input id="api-model" type="text"></label>
        <label>${esc(t('baseUrl'))}<input id="api-base" type="text"></label>
        <label class="row"><input id="ai-blocks" type="checkbox"> ${esc(t('aiBlocks'))}</label>
        <p class="hint">${esc(t('aiBlocksHint'))}</p>
        <button type="button" id="forget-key">${esc(t('forgetKey'))}</button>
      </section>
      <section data-tool-panel="help">
        <p>${esc(t('helpIntro'))}</p>
        <div id="help-body"></div>
      </section>`;
    root.querySelector('#api-key').value = settings.apiKey;
    root.querySelector('#api-model').value = settings.model;
    root.querySelector('#api-base').value = settings.baseUrl;
    root.querySelector('#ai-blocks').checked = !!session.project.aiBlocksEnabled;
    root.querySelector('#node-id').textContent = gridApi.node.id.slice(0, 12);
    root.querySelector('#bt-state').textContent = bluetoothAvailable() ? t('btYes') : t('btNo');
  }

  function renderHelp() {
    const body = root.querySelector('#help-body');
    if (!body) return;
    body.innerHTML = CATEGORY_ORDER.map((id) => {
      const color = categoryColor(id);
      const title = settings.lang === 'en' ? color.en : color.de;
      const lines = blocksInCategory(id).map((spec) => `<li><code>${esc(spec.opcode)}</code> — ${esc(labelFor(spec, settings.lang))}</li>`).join('');
      return `<h3 style="color:${color.c3}">${esc(title)}</h3><ul>${lines}</ul>`;
    }).join('') + `<h3>${esc(t('dsl'))}</h3><pre class="out">${esc(bdlDoc)}</pre>`;
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
    const peers = root.querySelector('#peer-count');
    if (peers) {
      peers.textContent = String(gridApi.node.peerCount());
      root.querySelector('#peer-state').textContent = gridApi.node.peerCount() ? t('connected') : t('noPeers');
    }
    const box = root.querySelector('#ai-blocks');
    if (box) box.checked = !!session.project.aiBlocksEnabled;
    renderHelp();
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
    root.querySelector('#ai-send').onclick = async () => {
      const status = root.querySelector('#ai-status');
      if (!settings.apiKey) { status.textContent = t('aiKeyMissing'); state.tool = 'settings'; refresh(); return; }
      const request = root.querySelector('#ai-request').value;
      const messages = buildAiMessages(session.project, request);
      status.textContent = t('aiSending');
      try {
        const result = await chatComplete({
          baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model,
          system: messages.system, user: messages.user,
        });
        const bdl = extractBdl(result.content);
        root.querySelector('#ai-output').value = bdl;
        const applied = applyBdl(session.project, bdl);
        if (!applied.ok) status.textContent = applied.errors.map((error) => errorText(error, settings.lang)).join('; ');
        else { session.touch(); status.textContent = t('aiApplied'); }
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
      else { session.touch(); status.textContent = t('aiApplied'); }
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
      setStatus(result.ok ? result.name : `${t('btNo')}: ${result.reason}`);
    };
    const persistSettings = () => {
      settings.apiKey = root.querySelector('#api-key').value;
      settings.model = root.querySelector('#api-model').value.trim() || 'grok-4.7';
      settings.baseUrl = root.querySelector('#api-base').value.trim() || 'https://api.x.ai/v1';
      saveSettings(settings);
    };
    root.querySelector('#api-key').onchange = persistSettings;
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
  window.addEventListener('resize', refresh);

  const stageSpriteHit = { id: null };
  stageView.view.addEventListener('pointerdown', (event) => {
    const hit = stageView.pointerDown(event, session.project);
    const at = stageView.localScratch(event);
    runtimeInput(at, true);
    if (hit) {
      state.spriteId = hit.id;
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
