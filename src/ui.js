/* SPDX-License-Identifier: GPL-3.0-or-later */

import { translate } from './i18n.js';
import { CATEGORY_ORDER } from './palette.js';
import { clampSize, clampZoom, paintFor, THEMES } from './themes.js';
import featuresDoc from '../docs/funktionen.md?raw';
import examplesDoc from '../docs/beispiele.md?raw';
import laterDoc from '../docs/vorschlaege.md?raw';
import { blocksInCategory, createBlock, labelFor, specByOpcode } from './catalog.js';
import { applyBdl, errorText } from './bdl.js';
import { cloneData, createProject, uid } from './model.js';
import { SCALE_BDL, TABLE_BDL, SAMPLE_EXTENSION } from './examples.js';
import { exportSb3 } from './sb3.js';
import { analyzeBytes } from './importfile.js';
import { createStageView } from './stageview.js';
import { bluetoothAvailable, bluetoothPing, chromeIntentUrl, linkPaths } from './bluetooth.js';
import { COSTUME_LIBRARY, SOUND_LIBRARY } from './library.js';
import { addBackpackItem, loadBackpack, removeBackpackItem, saveBackpack } from './backpack.js';
import { qrSvg } from './qr.js';
import { dropScripts, placeStack, sameBranch, takeStack, tidyScripts } from './stack.js';

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
    pane: 'code',
    tool: '',
    search: '',
    tour: 0,
    status: '',
    analysis: null,
    editing: null,
  };
  const wideQuery = window.matchMedia('(min-width: 1000px)');
  const t = (key) => translate(settings.lang, key);

  root.innerHTML = `
    <div class="app wide" id="shell" data-pane="code">
      <header class="menubar">
        <div class="brand"><strong>BlancheDeCiel</strong><span id="tagline"></span></div>
        <nav class="menus" aria-label="Menü">
          <div class="menu">
            <button type="button" class="menu-btn" data-menu="file" id="menu-file"></button>
            <div class="menu-pop" hidden>
              <button id="new" type="button"></button>
              <button id="open" type="button"></button>
              <button id="save" type="button"></button>
              <button id="export" type="button"></button>
              <select id="examples"></select>
            </div>
          </div>
          <div class="menu">
            <button type="button" class="menu-btn" data-menu="edit" id="menu-edit"></button>
            <div class="menu-pop" hidden>
              <button id="undo" type="button"></button>
              <button id="redo" type="button"></button>
              <button id="lang-de" type="button" title="Deutsch">DE</button>
              <button id="lang-en" type="button" title="English">EN</button>
            </div>
          </div>
          <div class="menu">
            <button type="button" class="menu-btn" data-menu="view" id="menu-view"></button>
            <div class="menu-pop" hidden>
              <button type="button" data-format="classic"></button>
              <button type="button" data-format="compact"></button>
              <button type="button" data-format="touch"></button>
              <button type="button" data-format="focus"></button>
              <button type="button" data-format="stage"></button>
              <button type="button" id="density"></button>
              <button type="button" data-blocks="normal"></button>
              <button type="button" data-blocks="flat"></button>
              <button type="button" data-blocks="contrast"></button>
              <label>${esc(t('theme'))}<select id="theme">${Object.entries(THEMES).map(([id, item]) => `<option value="${id}">${esc(settings.lang === 'en' ? item.en : item.de)}</option>`).join('')}</select></label>
            </div>
          </div>
          <div class="menu">
            <button type="button" class="menu-btn" data-menu="ext" id="menu-ext"></button>
            <div class="menu-pop" hidden>
              <button type="button" data-pane="ai"></button>
              <button type="button" data-pane="import"></button>
              <button type="button" data-pane="grid"></button>
              <button type="button" data-pane="unix"></button>
              <button type="button" data-pane="backpack"></button>
              <button type="button" data-pane="settings"></button>
            </div>
          </div>
          <div class="menu">
            <button type="button" class="menu-btn" data-menu="help" id="menu-help"></button>
            <div class="menu-pop" hidden>
              <button type="button" data-pane="help"></button>
              <button type="button" id="show-tour"></button>
            </div>
          </div>
        </nav>
        <div class="runbar">
          <input id="project-name" aria-label="Projekt">
          <button class="primary" id="flag" type="button"></button>
          <button class="stop" id="stop" type="button"></button>
        </div>
      </header>
      <nav class="tabs" id="tabs"></nav>
      <div class="workspace-row" id="workspace-row">
        <nav class="cats" id="cats"></nav>
        <div class="split" data-split="cats" role="separator" aria-orientation="vertical"></div>
        <aside class="palette" id="palette"></aside>
        <div class="split" data-split="palette" role="separator" aria-orientation="vertical"></div>
        <div class="workspace-frame" id="workspace-frame">
          <main class="workspace" id="workspace"></main>
          <div class="scroll-pad" id="scroll-pad">
            <button type="button" id="scroll-left" data-dx="-160" data-dy="0">←</button>
            <button type="button" id="scroll-up" data-dx="0" data-dy="-160">↑</button>
            <button type="button" id="scroll-right" data-dx="160" data-dy="0">→</button>
            <button type="button" id="scroll-down" data-dx="0" data-dy="160">↓</button>
          </div>
        </div>
        <div class="split" data-split="stage" role="separator" aria-orientation="vertical"></div>
        <aside class="side">
          <div class="stage-tools row">
            <button type="button" id="stage-small"></button>
            <button type="button" id="stage-normal"></button>
            <button type="button" id="stage-large"></button>
            <button type="button" id="stage-full"></button>
            <span id="stage-zoom" class="zoom-label"></span>
            <button type="button" id="code-out" title="Code −">−</button>
            <button type="button" id="code-in" title="Code +">+</button>
            <button type="button" id="code-reset"></button>
            <button type="button" id="code-fit"></button>
            <span id="zoom-label" class="zoom-label"></span>
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
    <div id="insert-mark" hidden></div>
    <div id="draw" hidden>
      <canvas id="draw-canvas" width="160" height="160"></canvas>
      <div class="row"><input id="draw-color" type="color" value="#4C97FF"><button type="button" id="draw-clear"></button><button type="button" id="draw-save"></button><button type="button" id="draw-close">OK</button></div>
    </div>
    <form id="ask" hidden>
      <div id="ask-text" class="grow"></div>
      <input id="ask-input" class="grow">
      <button type="submit">OK</button>
    </form>
    <input id="file" type="file" hidden accept=".sb3,.pmp,.zip,.json,.html,.htm,.js,.bdl,.txt">
    <div id="ctx" hidden role="menu"></div>
    <div id="tour" hidden><p id="tour-text"></p><div class="row"><button type="button" id="tour-next"></button><button type="button" id="tour-skip"></button></div></div>`;

  const shell = root.querySelector('#shell');
  const stageView = createStageView(root.querySelector('#stage-mount'));
  const fileInput = root.querySelector('#file');
  let askResolve = null;

  const sprite = () => session.project.sprites.find((item) => item.id === state.spriteId) || session.project.sprites[0];
  const setStatus = (text) => { state.status = text; root.querySelector('#status').textContent = text; };

  function applyLayout() {
    const layout = settings.layout || {};
    const row = root.querySelector('#workspace-row');
    document.documentElement.dataset.format = settings.format || 'classic';
    document.documentElement.dataset.blocks = settings.blockStyle || 'normal';
    document.documentElement.dataset.theme = settings.theme || 'light';
    const format = settings.format || 'classic';
    const preset = { classic: [112, 280, 380], compact: [80, 200, 260], touch: [96, 320, 300], focus: [96, 280, 0], stage: [80, 220, 560] }[format] || [112, 280, 380];
    if (!row || !wideQuery.matches || format === 'focus') {
      if (row) row.style.gridTemplateColumns = '';
    } else {
      const cats = clampSize(layout.cats || preset[0], 72, 180);
      const palette = clampSize(layout.palette || preset[1], 180, 520);
      const stageWidth = settings.stageMode === 'small' ? 240 : settings.stageMode === 'large' ? 560 : clampSize(layout.stage || preset[2], 220, 720);
      row.style.gridTemplateColumns = `${cats}px 10px ${palette}px 10px minmax(180px,1fr) 10px ${stageWidth}px`;
    }
    const mount = root.querySelector('#stage-mount');
    const stageZoom = clampZoom(settings.stageZoom || (settings.stageMode === 'large' ? 1.35 : settings.stageMode === 'small' ? 0.7 : 1));
    if (mount && settings.stageMode !== 'full') {
      mount.style.height = `${clampSize(layout.stageHeight, 140, 640)}px`;
      mount.style.zoom = String(stageZoom);
    }
    const scripts = root.querySelector('#scripts');
    if (scripts) scripts.style.zoom = String(clampZoom(settings.codeZoom || 1));
    const label = root.querySelector('#zoom-label');
    if (label) label.textContent = `${Math.round((settings.codeZoom || 1) * 100)}%`;
    const stageLabel = root.querySelector('#stage-zoom');
    if (stageLabel) stageLabel.textContent = `${Math.round(stageZoom * 100)}%`;
    shell.classList.toggle('tool-open', !!state.tool);
  }

  function labels() {
    root.querySelector('#tagline').textContent = t('tagline');
    root.querySelector('#menu-file').textContent = t('file');
    root.querySelector('#menu-edit').textContent = t('edit');
    root.querySelector('#menu-view').textContent = t('view');
    root.querySelector('#menu-ext').textContent = t('extensions');
    root.querySelector('#menu-help').textContent = t('help');
    root.querySelector('#flag').textContent = t('flag');
    root.querySelector('#flag').title = `${t('flag')} (Leertaste)`;
    root.querySelector('#stop').textContent = t('stop');
    root.querySelector('#stop').title = t('stop');
    root.querySelector('#undo').textContent = t('undo');
    root.querySelector('#undo').title = 'Strg+Z';
    root.querySelector('#redo').textContent = t('redo');
    root.querySelector('#redo').title = 'Strg+Umschalt+Z';
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
    if (small) { small.textContent = t('stageSmall'); small.title = t('stageSmall'); }
    const normal = root.querySelector('#stage-normal');
    if (normal) { normal.textContent = t('stageNormal'); normal.title = t('stageNormal'); }
    const large = root.querySelector('#stage-large');
    if (large) { large.textContent = t('stageLarge'); large.title = t('stageLarge'); }
    const full = root.querySelector('#stage-full');
    if (full) { full.textContent = t('stageFull'); full.title = t('stageFull'); }
    const reset = root.querySelector('#code-reset');
    if (reset) { reset.textContent = t('zoomReset'); reset.title = t('zoomReset'); }
    const fit = root.querySelector('#code-fit');
    if (fit) { fit.textContent = t('zoomFit'); fit.title = t('zoomFit'); }
    const tidy = root.querySelector('#tidy');
    if (tidy) tidy.textContent = t('tidy');
    const density = root.querySelector('#density');
    if (density) density.textContent = settings.density === 'compact' ? t('densityNormal') : t('densityCompact');
    document.documentElement.dataset.density = settings.density || (settings.format === 'compact' ? 'compact' : 'normal');
    const showTour = root.querySelector('#show-tour');
    if (showTour) showTour.textContent = t('tour');
    root.querySelectorAll('[data-format]').forEach((button) => { button.textContent = t(`format_${button.dataset.format}`); });
    root.querySelectorAll('[data-blocks]').forEach((button) => { button.textContent = t(`blocks_${button.dataset.blocks}`); });
    root.querySelectorAll('button[data-pane]').forEach((button) => { if (t(button.dataset.pane)) button.textContent = t(button.dataset.pane); });
    applyLayout();
    const drawSave = root.querySelector('#draw-save');
    if (drawSave) drawSave.textContent = t('drawSave');
    const drawClear = root.querySelector('#draw-clear');
    if (drawClear) drawClear.textContent = '×';
    const tabs = wideQuery.matches ? [] : [['code', 'code'], ['stage', 'stage'], ['sprites', 'sprites']];
    root.querySelector('#tabs').innerHTML = tabs.map(([id, key]) => `<button type="button" data-pane="${id}" class="${state.pane === id ? 'active' : ''}">${esc(t(key))}</button>`).join('');
    root.querySelector('#tool-tabs').innerHTML = '';
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
    const query = (state.search || '').trim().toLowerCase();
    const items = blocksInCategory(state.category).filter((spec) => {
      if (!query) return true;
      return labelFor(spec, settings.lang).toLowerCase().includes(query) || spec.opcode.includes(query);
    }).map((spec) => {
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
    root.querySelector('#palette').innerHTML = `<input id="block-search" type="search" value="${esc(state.search || '')}" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}"><p class="hint">${esc(t('clickAdd'))}</p>${extra}${items}`;
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
      mouth += `<div class="mouth" data-mouth="b" data-script="${esc(scriptId)}" data-route="${esc(route)}">${(block.body || []).map((child, index) => renderBlock(child, scriptId, `${route}.b.${index}`)).join('') || '<span class="drop-hint"></span>'}</div>`;
    }
    if (block.elseBody) {
      mouth += `<div class="else-label">${esc(t('else'))}</div><div class="mouth" data-mouth="e" data-script="${esc(scriptId)}" data-route="${esc(route)}">${block.elseBody.map((child, index) => renderBlock(child, scriptId, `${route}.e.${index}`)).join('') || '<span class="drop-hint"></span>'}</div>`;
    }
    return `<article class="block ${spec?.type || 'command'} ${selected ? 'selected' : ''}" data-opcode="${esc(block.opcode)}" data-script="${esc(scriptId)}" data-route="${esc(route)}" style="background:${color.c1}"><div class="rowline">${label}</div>${mouth}</article>`;
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
    root.querySelector('#workspace').innerHTML = `<div class="scripts" id="scripts">${cards}<canvas id="minimap" width="120" height="80"></canvas></div><div class="row"><button type="button" id="tidy">${esc(t('tidy'))}</button><button type="button" id="delete-block">${esc(t('deleteBlock'))}</button></div>`;
    const map = root.querySelector('#minimap');
    if (map) {
      const ctx2 = map.getContext('2d');
      ctx2.clearRect(0, 0, 120, 80);
      ctx2.fillStyle = '#d5e8f5';
      current.scripts.forEach((script) => {
        ctx2.fillRect(script.x / 20, script.y / 22, 18, 8);
      });
    }
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
        <textarea id="ai-request" placeholder="${esc(t('aiResult'))}"></textarea>
        <div class="row"><button type="button" class="primary" id="ai-local">${esc(t('localSuggest'))}</button></div>
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
        <div class="row"><button type="button" id="join-room">${esc(t('joinRoom'))}</button><button type="button" id="join-meet">${esc(t('meet'))}</button></div>
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
        <label>${esc(t('serverUrl'))}<input id="server-url" type="text" spellcheck="false" placeholder="https://…"></label>
        <label>${esc(t('coordinatorUrl'))}<input id="coordinator-url" type="text" spellcheck="false" placeholder="https://…"></label>
        <label>${esc(t('turnUrl'))}<input id="turn-url" type="text" spellcheck="false" placeholder="turn:…"></label>
        <label>${esc(t('turnUser'))}<input id="turn-user" type="text" spellcheck="false"></label>
        <label>${esc(t('turnCred'))}<input id="turn-cred" type="password" autocomplete="off" spellcheck="false"></label>
        <p class="hint">${esc(t('serverHint'))}</p>
        <label class="row"><input id="ai-blocks" type="checkbox"> ${esc(t('aiBlocks'))}</label>
        <p class="hint">${esc(t('aiBlocksHint'))}</p>
      </section>
      <section data-tool-panel="backpack">
        <button type="button" id="pack-script">${esc(t('backpackIn'))}</button>
        <div id="backpack-list"></div>
      </section>
      <section data-tool-panel="help">
        <p>${esc(t('helpIntro'))}</p>
        <div id="help-body"></div>
      </section>`;
    const server = root.querySelector('#server-url');
    if (server) server.value = settings.serverUrl || '';
    const coordinator = root.querySelector('#coordinator-url');
    if (coordinator) coordinator.value = settings.coordinatorUrl || '';
    const turnUrl = root.querySelector('#turn-url');
    if (turnUrl) turnUrl.value = settings.turnUrl || '';
    const turnUser = root.querySelector('#turn-user');
    if (turnUser) turnUser.value = settings.turnUser || '';
    const turnCred = root.querySelector('#turn-cred');
    if (turnCred) turnCred.value = settings.turnCred || '';
    const theme = root.querySelector('#theme');
    if (theme) theme.value = settings.theme || 'light';
    const tracker = root.querySelector('#tracker');
    if (tracker) tracker.value = settings.trackerUrl || '';
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
    }).join('') + `<h3>${esc(t('shortcuts'))}</h3><pre class="out">${esc(t('shortcutList'))}</pre><h3>${esc(t('features'))}</h3><pre class="out">${esc(featuresDoc)}</pre><h3>Beispiele</h3><pre class="out">${esc(examplesDoc)}</pre><h3>Vorschläge für später</h3><pre class="out">${esc(laterDoc)}</pre>`;
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
    const menuBtn = event.target.closest('button[data-menu]');
    if (menuBtn) {
      const pop = menuBtn.parentElement.querySelector('.menu-pop');
      const open = pop.hidden;
      root.querySelectorAll('.menu-pop').forEach((item) => { item.hidden = true; });
      pop.hidden = !open;
      return;
    }
    if (!event.target.closest('.menu')) root.querySelectorAll('.menu-pop').forEach((item) => { item.hidden = true; });
    if (event.target.id === 'tidy') {
      session.update((project) => {
        const current = project.sprites.find((item) => item.id === state.spriteId);
        if (current) tidyScripts(current.scripts);
      });
      return;
    }
    if (event.target.id === 'density') {
      settings.density = settings.density === 'compact' ? 'normal' : 'compact';
      saveSettings(settings);
      refresh();
      return;
    }
    const format = event.target.closest('button[data-format]');
    if (format) {
      settings.format = format.dataset.format;
      settings.layout = { ...(settings.layout || {}) };
      saveSettings(settings);
      root.querySelectorAll('.menu-pop').forEach((item) => { item.hidden = true; });
      refresh();
      return;
    }
    const blocks = event.target.closest('button[data-blocks]');
    if (blocks) {
      settings.blockStyle = blocks.dataset.blocks;
      saveSettings(settings);
      root.querySelectorAll('.menu-pop').forEach((item) => { item.hidden = true; });
      refresh();
      return;
    }
    const pane = event.target.closest('button[data-pane]');
    if (pane) {
      const id = pane.dataset.pane;
      if (['code', 'blocks', 'scripts', 'stage', 'sprites'].includes(id)) {
        state.pane = id === 'blocks' || id === 'scripts' ? 'code' : id;
        state.tool = '';
      } else {
        state.tool = id;
        state.pane = wideQuery.matches ? state.pane : id;
      }
      root.querySelectorAll('.menu-pop').forEach((item) => { item.hidden = true; });
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
    if (event.target.id === 'block-search') {
      state.search = event.target.value;
      const start = event.target.selectionStart;
      renderPalette();
      const field = root.querySelector('#block-search');
      if (field) { field.focus(); field.setSelectionRange(start, start); }
      return;
    }
    if (event.target.matches('.block input, .block select, .nested input, .nested select')) {
      if (!state.editing) state.editing = JSON.stringify(session.project);
      onLiteral(event.target);
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
  let learnedAt = 0;
  function startPan(event, scroller) {
    drag = {
      kind: 'pan',
      pointer: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
      scroller,
      moved: false,
    };
    if (event.pointerType !== 'touch' && event.cancelable) event.preventDefault();
    if (event.pointerType !== 'touch') {
      try { scroller.setPointerCapture(event.pointerId); } catch { /* synthetic pointers have no capture */ }
    }
  }
  const mark = root.querySelector('#insert-mark');
  function showGhost(text, x, y) {
    const ghost = root.querySelector('#ghost');
    ghost.textContent = text;
    ghost.hidden = false;
    ghost.style.left = `${x + 12}px`;
    ghost.style.top = `${y + 12}px`;
  }
  function hideGhost() {
    const ghost = root.querySelector('#ghost');
    ghost.textContent = '';
    ghost.hidden = true;
    mark.hidden = true;
  }
  function edgeScroll(x, y) {
    const workspace = root.querySelector('#workspace');
    if (!workspace) return;
    const box = workspace.getBoundingClientRect();
    if (x < box.left + 28) workspace.scrollLeft -= 16;
    if (x > box.right - 28) workspace.scrollLeft += 16;
    if (y < box.top + 28) workspace.scrollTop -= 16;
    if (y > box.bottom - 28) workspace.scrollTop += 16;
  }
  function dropTarget(x, y) {
    const under = document.elementFromPoint(x, y);
    if (!under) return { kind: 'cancel' };
    if (under.closest('#palette')) return { kind: 'delete' };
    const mouth = under.closest('.mouth');
    if (mouth) return { kind: 'into', scriptId: mouth.dataset.script, route: mouth.dataset.route, where: mouth.dataset.mouth === 'e' ? 'else' : 'into' };
    const block = under.closest('article.block');
    if (block && block.closest('#workspace')) {
      const rect = block.getBoundingClientRect();
      return {
        kind: 'snap',
        scriptId: block.dataset.script,
        route: block.dataset.route,
        where: y < rect.top + rect.height * 0.35 ? 'before' : 'after',
      };
    }
    const workspace = under.closest('#workspace');
    if (workspace) {
      const scripts = root.querySelector('#scripts');
      const origin = scripts.getBoundingClientRect();
      const zoom = Number(scripts.style.zoom || 1) || 1;
      return { kind: 'new', x: (x - origin.left) / zoom, y: (y - origin.top) / zoom };
    }
    return { kind: 'cancel' };
  }
  root.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#scroll-pad')) return;
    if (event.button != null && event.button > 1) return;
    const workspace = root.querySelector('#workspace');
    const palette = root.querySelector('#palette');
    const move = event.target.closest('[data-move-script]');
    const paletteBlock = event.target.closest('#palette [data-opcode]');
    const workspaceBlock = event.target.closest('#workspace article.block');
    if (event.target.closest('input,select,button,textarea,a')) return;
    const inWorkspace = event.target.closest('#workspace');
    const inPalette = event.target.closest('#palette');
    const gutter = (el) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const vertical = event.clientX >= rect.right - 28;
      const horizontal = event.clientY >= rect.bottom - 28;
      if (!vertical && !horizontal) return null;
      return vertical ? 'y' : 'x';
    };
    const bar = (inWorkspace && gutter(inWorkspace)) || (inPalette && gutter(inPalette));
    if (bar && event.button === 0) {
      const scroller = inWorkspace && gutter(inWorkspace) ? inWorkspace : inPalette;
      drag = {
        kind: 'bar',
        pointer: event.pointerId,
        type: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        left: scroller.scrollLeft,
        top: scroller.scrollTop,
        scroller,
        axis: gutter(scroller),
        moved: false,
      };
      if (event.cancelable) event.preventDefault();
      try { scroller.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
      return;
    }
    if (event.button === 1 && (inWorkspace || inPalette)) {
      startPan(event, inPalette && !inWorkspace ? palette : workspace);
      return;
    }
    const emptyWorkspace = inWorkspace && !workspaceBlock && !move;
    const emptyPalette = inPalette && !paletteBlock;
    if (emptyWorkspace || (emptyPalette && event.pointerType === 'touch')) {
      startPan(event, emptyPalette && !emptyWorkspace ? palette : workspace);
      return;
    }
    if (!move && !paletteBlock && !workspaceBlock) return;
    drag = {
      kind: 'block',
      pointer: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      scriptId: move?.dataset.moveScript || workspaceBlock?.dataset.script || null,
      route: workspaceBlock?.dataset.route || null,
      opcode: paletteBlock?.dataset.opcode || workspaceBlock?.dataset.opcode || null,
      fromPalette: !!paletteBlock && !workspaceBlock,
      moved: false,
      armed: false,
      holdArmed: false,
      hold: null,
    };
    if (event.pointerType !== 'touch' && event.cancelable) event.preventDefault();
    if (event.pointerType === 'touch') {
      const pointer = event.pointerId;
      drag.hold = setTimeout(() => {
        if (drag && drag.pointer === pointer && drag.kind === 'block' && !drag.moved) drag.holdArmed = true;
      }, 320);
    }
  });
  root.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.kind === 'bar') {
      drag.moved = true;
      const el = drag.scroller;
      if (drag.axis === 'y') {
        const track = Math.max(1, el.clientHeight);
        const max = Math.max(0, el.scrollHeight - track);
        el.scrollTop = drag.top + (event.clientY - drag.y) * Math.max(1, max / track);
      } else {
        const track = Math.max(1, el.clientWidth);
        const max = Math.max(0, el.scrollWidth - track);
        el.scrollLeft = drag.left + (event.clientX - drag.x) * Math.max(1, max / track);
      }
      return;
    }
    if (drag.kind === 'pan') {
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      drag.scroller.scrollLeft = drag.left + (drag.x - event.clientX);
      drag.scroller.scrollTop = drag.top + (drag.y - event.clientY);
      return;
    }
    if (!drag.armed) {
      if (drag.type !== 'touch') {
        if (Math.hypot(dx, dy) < 4) return;
        drag.armed = true;
      } else if (drag.fromPalette && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        drag.armed = true;
      } else if (drag.holdArmed) {
        drag.armed = true;
      } else if (Math.hypot(dx, dy) > 10) {
        const scroller = drag.fromPalette ? root.querySelector('#palette') : root.querySelector('#workspace');
        drag.kind = 'pan';
        drag.scroller = scroller;
        drag.left = scroller.scrollLeft;
        drag.top = scroller.scrollTop;
        drag.moved = true;
        scroller.scrollLeft = drag.left - dx;
        scroller.scrollTop = drag.top - dy;
        return;
      } else return;
    }
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    document.documentElement.dataset.dragging = '1';
    if (!drag.undo && drag.scriptId && !drag.route && !drag.fromPalette) {
      session.pushUndo(JSON.stringify(session.project));
      drag.undo = true;
    }
    showGhost(drag.opcode || t('scripts'), event.clientX, event.clientY);
    edgeScroll(event.clientX, event.clientY);
    const target = dropTarget(event.clientX, event.clientY);
    drag.target = target;
    if (target.kind === 'snap' || target.kind === 'into') {
      const host = root.querySelector(`article.block[data-script="${target.scriptId}"][data-route="${target.route}"]`);
      if (host) {
        const rect = host.getBoundingClientRect();
        mark.hidden = false;
        mark.style.left = `${rect.left}px`;
        mark.style.top = `${target.where === 'before' ? rect.top : rect.bottom - 4}px`;
        mark.style.width = `${Math.max(48, rect.width)}px`;
      }
    } else mark.hidden = true;
    if (drag.scriptId && !drag.route && !drag.fromPalette) {
      const script = sprite().scripts.find((item) => item.id === drag.scriptId);
      if (script) { script.x += dx; script.y += dy; drag.x = event.clientX; drag.y = event.clientY; renderWorkspace(); }
    }
  });
  root.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    clearTimeout(drag.hold);
    document.documentElement.dataset.dragging = '';
    const info = drag;
    drag = null;
    if (info.kind === 'pan' || info.kind === 'bar') {
      hideGhost();
      if (info.moved) suppressClick = true;
      return;
    }
    hideGhost();
    if (info.moved && info.scriptId && !info.route && !info.fromPalette) {
      suppressClick = true;
      session.touch();
    } else if (info.moved) {
      suppressClick = true;
      const target = info.target || dropTarget(event.clientX, event.clientY);
      session.update((project) => {
        const current = project.sprites.find((item) => item.id === state.spriteId) || project.sprites[0];
        const blocked = info.route != null && target.scriptId === info.scriptId && sameBranch(info.route, target.route);
        if (target.kind === 'cancel' || (blocked && target.kind !== 'new' && target.kind !== 'delete')) return;
        let stack = [];
        if (info.fromPalette) {
          if (target.kind === 'delete') return;
          const made = createBlock(info.opcode);
          if (made) stack = [made];
        } else if (info.route != null) {
          const script = current.scripts.find((item) => item.id === info.scriptId);
          if (script) stack = takeStack(script, info.route);
          dropScripts(current.scripts);
        }
        if (!stack.length || target.kind === 'delete') return;
        if (target.kind === 'snap' || target.kind === 'into') {
          const script = current.scripts.find((item) => item.id === target.scriptId);
          if (script) placeStack(script, target.route, stack, target.where || 'after');
          return;
        }
        if (target.kind === 'new') {
          current.scripts.push({ id: uid(), x: target.x, y: target.y, proc: null, blocks: stack });
        }
      });
      const now = Date.now();
      if (now - learnedAt > 500) {
        learnedAt = now;
        ctx.local.learnBlocks((sprite()?.scripts || []).flatMap((script) => script.blocks || []));
        ctx.persistLocal?.();
      }
    } else if (info.moved && info.scriptId && !info.route) session.touch();
    });
  root.addEventListener('pointercancel', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    clearTimeout(drag.hold);
    document.documentElement.dataset.dragging = '';
    hideGhost();
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
      const text = ctx.local.suggest(session.project);
      state.lastSuggestion = text;
      root.querySelector('#ai-output').value = text;
      root.querySelector('#ai-status').textContent = t('aiApply');
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
      const url = settings.coordinatorUrl || settings.serverUrl;
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
    const persistSettings = () => {
      settings.serverUrl = root.querySelector('#server-url')?.value.trim() || '';
      settings.coordinatorUrl = root.querySelector('#coordinator-url')?.value.trim() || '';
      settings.turnUrl = root.querySelector('#turn-url')?.value.trim() || '';
      settings.turnUser = root.querySelector('#turn-user')?.value.trim() || '';
      settings.turnCred = root.querySelector('#turn-cred')?.value || '';
      settings.theme = root.querySelector('#theme')?.value || 'light';
      document.documentElement.dataset.theme = settings.theme;
      saveSettings(settings);
      refresh();
    };
    root.querySelector('#server-url').onchange = persistSettings;
    root.querySelector('#coordinator-url').onchange = persistSettings;
    root.querySelector('#turn-url').onchange = persistSettings;
    root.querySelector('#turn-user').onchange = persistSettings;
    root.querySelector('#turn-cred').onchange = persistSettings;
    root.querySelector('#theme').onchange = persistSettings;
    root.querySelector('#ai-blocks').onchange = (event) => {
      session.update((project) => { project.aiBlocksEnabled = event.target.checked; });
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
  ctx.bridge.overlap = (a, b) => stageView.overlap(a, b);
  ctx.bridge.touchColor = (sprite, color) => stageView.touchColor(sprite, color);
  ctx.bridge.colorTouch = (sprite, mine, other) => stageView.colorTouch(sprite, mine, other);
  const setStage = (mode, zoom) => {
    settings.stageMode = mode;
    if (zoom) settings.stageZoom = zoom;
    saveSettings(settings);
    applyLayout();
  };
  root.querySelector('#stage-small').onclick = () => setStage('small', 0.7);
  root.querySelector('#stage-normal').onclick = () => setStage('normal', 1);
  root.querySelector('#stage-large').onclick = () => setStage('large', 1.35);
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
  root.querySelector('#code-reset').onclick = () => setZoom(1);
  root.querySelector('#code-fit').onclick = () => {
    const workspace = root.querySelector('#workspace');
    setZoom(workspace.clientWidth / 680);
  };
  const stageMount = root.querySelector('#stage-mount');
  stageMount.addEventListener('wheel', (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    settings.stageZoom = clampZoom((settings.stageZoom || 1) * factor);
    settings.stageMode = 'normal';
    saveSettings(settings);
    applyLayout();
  }, { passive: false });
  let stagePointers = new Map();
  let stagePan = null;
  stageMount.addEventListener('pointerdown', (event) => {
    if (event.shiftKey) {
      stagePan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: stageMount.scrollLeft, top: stageMount.scrollTop };
      event.stopPropagation();
    }
    if (event.pointerType === 'touch') stagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }, true);
  stageMount.addEventListener('pointermove', (event) => {
    if (stagePan && event.pointerId === stagePan.id) {
      stageMount.scrollLeft = stagePan.left - (event.clientX - stagePan.x);
      stageMount.scrollTop = stagePan.top - (event.clientY - stagePan.y);
    }
    if (!stagePointers.has(event.pointerId) || stagePointers.size < 2) return;
    const previous = [...stagePointers.values()];
    stagePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = [...stagePointers.values()];
    const before = Math.hypot(previous[0].x - previous[1].x, previous[0].y - previous[1].y);
    const after = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y);
    if (before > 0) {
      settings.stageZoom = clampZoom((settings.stageZoom || 1) * (after / before));
      applyLayout();
    }
  });
  stageMount.addEventListener('pointerup', (event) => {
    stagePointers.delete(event.pointerId);
    if (stagePan?.id === event.pointerId) stagePan = null;
  });
  root.addEventListener('contextmenu', (event) => {
    const block = event.target.closest('.workspace .block');
    const menu = root.querySelector('#ctx');
    if (!block) { menu.hidden = true; return; }
    event.preventDefault();
    state.selection = { scriptId: block.dataset.script, route: block.dataset.route };
    menu.hidden = false;
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.innerHTML = `<button type="button" data-ctx="copy">${esc(t('duplicate'))}</button><button type="button" data-ctx="delete">${esc(t('deleteBlock'))}</button>`;
  });
  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-ctx]');
    if (!action) return;
    if (action.dataset.ctx === 'delete') deleteSelection();
    if (action.dataset.ctx === 'copy' && state.selection) {
      const current = sprite();
      const script = current.scripts.find((item) => item.id === state.selection.scriptId);
      const block = script && blockFromRoute(script, state.selection.route);
      if (block) insertMade(cloneData(block), specByOpcode(block.opcode) || { type: 'command' });
    }
    root.querySelector('#ctx').hidden = true;
  });
  const tourSteps = () => [t('tour1'), t('tour2'), t('tour3'), t('tour4')];
  const showTour = (step) => {
    const box = root.querySelector('#tour');
    state.tour = step;
    if (step >= tourSteps().length) {
      box.hidden = true;
      localStorage.setItem('bdc.tour.v1', '1');
      return;
    }
    box.hidden = false;
    root.querySelector('#tour-text').textContent = tourSteps()[step];
    root.querySelector('#tour-next').textContent = step === tourSteps().length - 1 ? t('tourDone') : t('tourNext');
    root.querySelector('#tour-skip').textContent = t('tourSkip');
  };
  root.querySelector('#tour-next').onclick = () => showTour(state.tour + 1);
  root.querySelector('#tour-skip').onclick = () => { root.querySelector('#tour').hidden = true; localStorage.setItem('bdc.tour.v1', '1'); };
  root.querySelector('#show-tour').onclick = () => showTour(0);
  if (!localStorage.getItem('bdc.tour.v1')) showTour(0);
  window.addEventListener('keydown', (event) => {
    const typing = event.target.matches('input, textarea, select');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) session.redo();
      else session.undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      root.querySelector('#save').click();
    } else if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      setZoom((settings.codeZoom || 1) + 0.1);
    } else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault();
      setZoom((settings.codeZoom || 1) - 0.1);
    } else if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault();
      setZoom(1);
    } else if (!typing && event.key === ' ') {
      event.preventDefault();
      root.querySelector('#flag').click();
    } else if (!typing && (event.key === 'Delete' || event.key === 'Backspace') && state.selection) {
      deleteSelection();
    }
  });
  const wheelOf = (el, event) => {
    if (event.ctrlKey || event.metaKey) return false;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
    event.preventDefault();
    if (event.shiftKey) el.scrollLeft += (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
    else {
      el.scrollLeft += event.deltaX * unit;
      el.scrollTop += event.deltaY * unit;
    }
    return true;
  };
  root.querySelector('#workspace').addEventListener('wheel', (event) => {
    const workspace = root.querySelector('#workspace');
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      setZoom((settings.codeZoom || 1) * (event.deltaY < 0 ? 1.05 : 0.95));
      return;
    }
    wheelOf(workspace, event);
  }, { passive: false });
  root.querySelector('#palette').addEventListener('wheel', (event) => {
    wheelOf(root.querySelector('#palette'), event);
  }, { passive: false });
  root.addEventListener('touchmove', (event) => {
    if (!drag || drag.type !== 'touch') return;
    const panning = drag.kind === 'pan';
    const dragging = drag.kind === 'block' && drag.armed;
    if ((panning || dragging) && event.cancelable) event.preventDefault();
  }, { passive: false });
  root.querySelectorAll('#scroll-pad button').forEach((button) => {
    const dx = Number(button.dataset.dx);
    const dy = Number(button.dataset.dy);
    let timer = 0;
    const step = () => {
      const workspace = root.querySelector('#workspace');
      if (!workspace) return;
      workspace.scrollLeft += dx;
      workspace.scrollTop += dy;
    };
    const stop = () => { window.clearTimeout(timer); timer = 0; };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      step();
      let wait = 280;
      const tick = () => { step(); wait = 70; timer = window.setTimeout(tick, wait); };
      timer = window.setTimeout(tick, wait);
    });
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('pointerleave', stop);
  });
  const pointers = new Map();
  root.querySelector('#workspace').addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && drag?.kind === 'pan') drag = null;
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
