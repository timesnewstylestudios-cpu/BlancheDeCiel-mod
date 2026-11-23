/* SPDX-License-Identifier: GPL-3.0-or-later */

import { uid } from './model.js';
import { CATEGORY_ORDER } from './palette.js';

const n = (def) => ({ type: 'number', def });
const s = (def = '') => ({ type: 'string', def });
const col = (def) => ({ type: 'color', def });
const menu = (def, options) => ({ type: 'menu', def, options });
const bool = () => ({
  type: 'bool',
  def: {
    kind: 'block',
    opcode: 'gt',
    args: [
      { kind: 'block', opcode: 'x', args: [] },
      { kind: 'num', value: 0 },
    ],
  },
});

function spec(opcode, cat, type, de, en, args = []) {
  return { opcode, cat, type, de, en, args };
}

export const BLOCKS = [
  spec('move', 'motion', 'command', 'gehe %1 Schritte', 'move %1 steps', [n(10)]),
  spec('turn', 'motion', 'command', 'drehe dich nach rechts um %1 Grad', 'turn right %1 degrees', [n(15)]),
  spec('turnl', 'motion', 'command', 'drehe dich nach links um %1 Grad', 'turn left %1 degrees', [n(15)]),
  spec('goto', 'motion', 'command', 'gehe zu x: %1 y: %2', 'go to x: %1 y: %2', [n(0), n(0)]),
  spec('setx', 'motion', 'command', 'setze x auf %1', 'set x to %1', [n(0)]),
  spec('changex', 'motion', 'command', 'ändere x um %1', 'change x by %1', [n(10)]),
  spec('sety', 'motion', 'command', 'setze y auf %1', 'set y to %1', [n(0)]),
  spec('changey', 'motion', 'command', 'ändere y um %1', 'change y by %1', [n(10)]),
  spec('point', 'motion', 'command', 'setze Richtung auf %1', 'point in direction %1', [n(90)]),
  spec('pointtowards', 'motion', 'command', 'zeige auf %1', 'point towards %1', [menu('mouse', ['mouse'])]),
  spec('glide', 'motion', 'command', 'gleite %1 Sekunden zu x: %2 y: %3', 'glide %1 secs to x: %2 y: %3', [n(1), n(0), n(0)]),
  spec('bounce', 'motion', 'command', 'pralle vom Rand ab', 'if on edge, bounce'),
  spec('x', 'motion', 'reporter', 'x-Position', 'x position'),
  spec('y', 'motion', 'reporter', 'y-Position', 'y position'),
  spec('dir', 'motion', 'reporter', 'Richtung', 'direction'),

  spec('say', 'looks', 'command', 'sage %1 für %2 Sekunden', 'say %1 for %2 seconds', [s('Hallo'), { ...n(2), optional: true }]),
  spec('think', 'looks', 'command', 'denke %1 für %2 Sekunden', 'think %1 for %2 seconds', [s('Hmm'), { ...n(2), optional: true }]),
  spec('show', 'looks', 'command', 'zeige dich', 'show'),
  spec('hide', 'looks', 'command', 'verstecke dich', 'hide'),
  spec('setsize', 'looks', 'command', 'setze Größe auf %1', 'set size to %1', [n(100)]),
  spec('changesize', 'looks', 'command', 'ändere Größe um %1', 'change size by %1', [n(10)]),
  spec('size', 'looks', 'reporter', 'Größe', 'size'),
  spec('switchcostume', 'looks', 'command', 'wechsle zu Kostüm %1', 'switch costume to %1', [s('kostüm')]),
  spec('nextcostume', 'looks', 'command', 'nächstes Kostüm', 'next costume'),
  spec('costume', 'looks', 'reporter', 'Kostümnummer', 'costume number'),
  spec('ghost', 'looks', 'command', 'setze Durchsichtigkeit auf %1', 'set ghost effect to %1', [n(0)]),

  spec('whenflag', 'events', 'hat', 'Wenn die grüne Flagge angeklickt', 'when green flag clicked'),
  spec('whenkey', 'events', 'hat', 'Wenn Taste %1 gedrückt', 'when %1 key pressed', [menu('space', ['space', 'up', 'down', 'left', 'right', 'enter', 'a', 'w', 's', 'd'])]),
  spec('whenclick', 'events', 'hat', 'Wenn diese Figur angeklickt', 'when this sprite clicked'),
  spec('whenreceive', 'events', 'hat', 'Wenn ich %1 empfange', 'when I receive %1', [s('Nachricht')]),
  spec('whenclone', 'control', 'hat', 'Wenn ich als Klon starte', 'when I start as a clone'),
  spec('broadcast', 'events', 'command', 'sende %1 an alle', 'broadcast %1', [s('Nachricht')]),

  spec('wait', 'control', 'command', 'warte %1 Sekunden', 'wait %1 seconds', [n(1)]),
  spec('repeat', 'control', 'c', 'wiederhole %1 mal', 'repeat %1', [n(10)]),
  spec('forever', 'control', 'c', 'wiederhole fortlaufend', 'forever'),
  spec('if', 'control', 'celse', 'falls %1 dann', 'if %1 then', [bool()]),
  spec('repeatuntil', 'control', 'c', 'wiederhole bis %1', 'repeat until %1', [bool()]),
  spec('waituntil', 'control', 'command', 'warte bis %1', 'wait until %1', [bool()]),
  spec('clone', 'control', 'command', 'erzeuge Klon von %1', 'create clone of %1', [s('myself')]),
  spec('deleteclone', 'control', 'command', 'lösche diesen Klon', 'delete this clone'),
  spec('stop', 'control', 'command', 'stoppe %1', 'stop %1', [menu('all', ['all', 'this', 'other'])]),
  spec('call', 'myblocks', 'command', 'rufe %1 auf', 'call %1', [s('tanz')]),

  spec('ask', 'sensing', 'command', 'frage %1 und warte', 'ask %1 and wait', [s('Wie heißt du?')]),
  spec('answer', 'sensing', 'reporter', 'Antwort', 'answer'),
  spec('timer', 'sensing', 'reporter', 'Stoppuhr', 'timer'),
  spec('resettimer', 'sensing', 'command', 'setze Stoppuhr zurück', 'reset timer'),
  spec('mousex', 'sensing', 'reporter', 'Maus x', 'mouse x'),
  spec('mousey', 'sensing', 'reporter', 'Maus y', 'mouse y'),
  spec('mousedown', 'sensing', 'boolean', 'Maustaste gedrückt?', 'mouse down?'),
  spec('keydown', 'sensing', 'boolean', 'Taste %1 gedrückt?', 'key %1 pressed?', [menu('space', ['space', 'up', 'down', 'left', 'right', 'enter', 'a', 'w', 's', 'd'])]),
  spec('touching', 'sensing', 'boolean', 'wird %1 berührt?', 'touching %1?', [menu('edge', ['edge', 'mouse'])]),
  spec('distance', 'sensing', 'reporter', 'Entfernung von %1', 'distance to %1', [menu('mouse', ['mouse'])]),
  spec('current', 'sensing', 'reporter', 'aktuell %1', 'current %1', [menu('second', ['year', 'month', 'date', 'hour', 'minute', 'second'])]),

  spec('add', 'operators', 'reporter', '%1 + %2', '%1 + %2', [n(0), n(0)]),
  spec('sub', 'operators', 'reporter', '%1 − %2', '%1 - %2', [n(0), n(0)]),
  spec('mul', 'operators', 'reporter', '%1 × %2', '%1 * %2', [n(0), n(0)]),
  spec('div', 'operators', 'reporter', '%1 ÷ %2', '%1 / %2', [n(0), n(1)]),
  spec('mod', 'operators', 'reporter', '%1 mod %2', '%1 mod %2', [n(0), n(2)]),
  spec('round', 'operators', 'reporter', 'runde %1', 'round %1', [n(0)]),
  spec('rand', 'operators', 'reporter', 'Zufallszahl von %1 bis %2', 'pick random %1 to %2', [n(1), n(10)]),
  spec('join', 'operators', 'reporter', 'verbinde %1 %2', 'join %1 %2', [s('Hallo '), s('Welt')]),
  spec('strlen', 'operators', 'reporter', 'Länge von %1', 'length of %1', [s('Apfel')]),
  spec('letter', 'operators', 'reporter', 'Buchstabe %1 von %2', 'letter %1 of %2', [n(1), s('Apfel')]),
  spec('gt', 'operators', 'boolean', '%1 > %2', '%1 > %2', [n(0), n(50)]),
  spec('lt', 'operators', 'boolean', '%1 < %2', '%1 < %2', [n(0), n(50)]),
  spec('eq', 'operators', 'boolean', '%1 = %2', '%1 = %2', [n(0), n(0)]),
  spec('and', 'operators', 'boolean', '%1 und %2', '%1 and %2', [bool(), bool()]),
  spec('or', 'operators', 'boolean', '%1 oder %2', '%1 or %2', [bool(), bool()]),
  spec('not', 'operators', 'boolean', 'nicht %1', 'not %1', [bool()]),
  spec('contains', 'operators', 'boolean', '%1 enthält %2?', '%1 contains %2?', [s('Apfel'), s('Ap')]),

  spec('set', 'variables', 'command', 'setze %1 auf %2', 'set %1 to %2', [s('punkte'), n(0)]),
  spec('change', 'variables', 'command', 'ändere %1 um %2', 'change %1 by %2', [s('punkte'), n(1)]),
  spec('var', 'variables', 'reporter', 'Wert von %1', 'value of %1', [s('punkte')]),

  spec('push', 'lists', 'command', 'füge %1 zu %2 hinzu', 'add %1 to %2', [s('Ding'), s('liste')]),
  spec('remove', 'lists', 'command', 'lösche %1 aus %2', 'delete %1 of %2', [n(1), s('liste')]),
  spec('clearlist', 'lists', 'command', 'lösche alles aus %1', 'delete all of %1', [s('liste')]),
  spec('item', 'lists', 'reporter', 'Element %1 von %2', 'item %1 of %2', [n(1), s('liste')]),
  spec('len', 'lists', 'reporter', 'Länge von Liste %1', 'length of list %1', [s('liste')]),
  spec('has', 'lists', 'boolean', '%1 enthält %2?', '%1 contains %2?', [s('liste'), s('Ding')]),

  spec('pendown', 'pen', 'command', 'Stift runter', 'pen down'),
  spec('penup', 'pen', 'command', 'Stift hoch', 'pen up'),
  spec('penclear', 'pen', 'command', 'lösche alles vom Stift', 'erase all'),
  spec('pencolor', 'pen', 'command', 'setze Stiftfarbe auf %1', 'set pen color to %1', [col('#0FBD8C')]),
  spec('pensize', 'pen', 'command', 'setze Stiftdicke auf %1', 'set pen size to %1', [n(2)]),
  spec('stamp', 'pen', 'command', 'hinterlasse Abdruck', 'stamp'),

  spec('tone', 'audio', 'command', 'spiele Ton %1 Hz für %2 Sekunden', 'play tone %1 Hz for %2 seconds', [n(440), n(0.4)]),
  spec('note', 'audio', 'command', 'spiele Note %1 für %2 Schläge', 'play note %1 for %2 beats', [n(60), n(0.5)]),
  spec('wave', 'audio', 'command', 'setze Wellenform auf %1', 'set wave to %1', [menu('sine', ['sine', 'square', 'sawtooth', 'triangle'])]),
  spec('filter', 'audio', 'command', 'setze Filter %1 auf %2 Hz', 'set filter %1 to %2 Hz', [menu('lowpass', ['lowpass', 'highpass', 'bandpass']), n(1200)]),
  spec('adsr', 'audio', 'command', 'setze Hüllkurve A %1 D %2 S %3 R %4', 'set envelope A %1 D %2 S %3 R %4', [n(0.02), n(0.08), n(0.7), n(0.12)]),
  spec('recstart', 'audio', 'command', 'starte Aufnahme', 'start recording'),
  spec('recstop', 'audio', 'command', 'stoppe Aufnahme', 'stop recording'),
  spec('recplay', 'audio', 'command', 'spiele Aufnahme', 'play recording'),
  spec('playsnd', 'audio', 'command', 'spiele Klang %1', 'play sound %1', [s('klang')]),
  spec('volume', 'audio', 'reporter', 'Lautstärke', 'volume'),
  spec('fft', 'audio', 'reporter', 'FFT-Band %1', 'FFT band %1', [n(1)]),

  spec('rect', 'graphics', 'command', 'Rechteck x %1 y %2 Breite %3 Höhe %4', 'rectangle x %1 y %2 width %3 height %4', [n(-40), n(-30), n(80), n(60)]),
  spec('oval', 'graphics', 'command', 'Oval x %1 y %2 Breite %3 Höhe %4', 'oval x %1 y %2 width %3 height %4', [n(0), n(0), n(80), n(80)]),
  spec('line', 'graphics', 'command', 'Linie von %1 %2 nach %3 %4', 'line from %1 %2 to %3 %4', [n(-50), n(0), n(50), n(0)]),
  spec('gfxclear', 'graphics', 'command', 'lösche Zeichnung', 'clear drawing'),
  spec('layer', 'graphics', 'command', 'wechsle zu Schicht %1', 'switch to layer %1', [s('zeichnung')]),
  spec('shader', 'graphics', 'command', 'setze Shader auf %1', 'set shader to %1', [menu('none', ['none', 'invert', 'pixel', 'vignette', 'wave', 'gray', 'sepia', 'edge'])]),
  spec('box3d', 'graphics', 'command', 'Quader x %1 y %2 z %3 Größe %4', 'box x %1 y %2 z %3 size %4', [n(0), n(0), n(0), n(70)]),
  spec('sphere3d', 'graphics', 'command', 'Kugel x %1 y %2 z %3 Größe %4', 'sphere x %1 y %2 z %3 size %4', [n(40), n(20), n(0), n(36)]),
  spec('cam', 'graphics', 'command', 'setze Kamera x %1 y %2 z %3', 'set camera x %1 y %2 z %3', [n(0), n(0), n(280)]),
  spec('rot3d', 'graphics', 'command', 'drehe Kamera Gier %1 Nick %2', 'rotate camera yaw %1 pitch %2', [n(30), n(20)]),
  spec('clear3d', 'graphics', 'command', 'lösche 3D-Szene', 'clear 3D scene'),

  spec('row', 'grid', 'command', 'neue Zeile in %1 mit %2', 'new row in %1 with %2', [s('mess'), n(0)]),
  spec('setcell', 'grid', 'command', 'setze Zelle von %1 Zeile %2 Spalte %3 auf %4', 'set cell of %1 row %2 column %3 to %4', [s('mess'), n(1), n(1), n(0)]),
  spec('cell', 'grid', 'reporter', 'Zelle von %1 Zeile %2 Spalte %3', 'cell of %1 row %2 column %3', [s('mess'), n(1), n(1)]),
  spec('share', 'grid', 'command', 'teile Tabelle %1 im Netz', 'share table %1 on the grid', [s('mess')]),
  spec('fetch', 'grid', 'command', 'hole Tabelle %1 aus dem Netz', 'fetch table %1 from the grid', [s('mess')]),
  spec('job', 'grid', 'command', 'verteile %1 auf Tabelle %2 Spalte %3', 'distribute %1 on table %2 column %3', [menu('sum', ['sum', 'min', 'max', 'count']), s('mess'), n(1)]),
  spec('jobresult', 'grid', 'reporter', 'Ergebnis %1 von %2 Spalte %3', 'result %1 of %2 column %3', [menu('sum', ['sum', 'min', 'max', 'count']), s('mess'), n(1)]),
  spec('peers', 'grid', 'reporter', 'Anzahl Gegenstellen', 'peer count'),
  spec('bt', 'grid', 'boolean', 'Bluetooth verfügbar?', 'bluetooth available?'),
  spec('btping', 'grid', 'command', 'Bluetooth-Gerät wählen', 'pick bluetooth device'),

  spec('aiprompt', 'ai', 'command', 'frage die KI %1', 'ask the AI %1', [s('zeichne ein Quadrat')]),
  spec('comment', 'analyse', 'command', 'Kommentar %1', 'comment %1', [s('')]),
  spec('log', 'analyse', 'command', 'schreibe %1 ins Protokoll', 'log %1', [s('Hallo')]),
  spec('decomp', 'analyse', 'command', 'schreibe Pseudocode nach Analyse', 'write pseudocode into Analyse'),
];

const byOpcode = new Map(BLOCKS.map((entry) => [entry.opcode, entry]));

export function specByOpcode(opcode) {
  return byOpcode.get(opcode) || null;
}

export function blocksInCategory(cat) {
  return BLOCKS.filter((entry) => entry.cat === cat);
}

export function defaultExpr(arg) {
  if (arg.def && typeof arg.def === 'object') return structuredClone(arg.def);
  if (arg.type === 'number') return { kind: 'num', value: arg.def ?? 0 };
  return { kind: 'str', value: arg.def ?? '' };
}

export function createBlock(opcode) {
  const entry = specByOpcode(opcode);
  if (!entry) return null;
  return {
    id: uid(),
    opcode,
    args: (entry.args || []).map(defaultExpr),
    body: entry.type === 'c' || entry.type === 'celse' ? [] : null,
    elseBody: entry.type === 'celse' ? [] : null,
  };
}

export function labelFor(entry, lang) {
  return lang === 'en' ? entry.en : entry.de;
}

export function categoriesInUse() {
  return CATEGORY_ORDER.filter((id) => BLOCKS.some((entry) => entry.cat === id) || id === 'myblocks');
}

export const COMMAND_OPCODES = BLOCKS.filter((entry) => ['command', 'c', 'celse'].includes(entry.type)).map((entry) => entry.opcode);
export const REPORTER_OPCODES = BLOCKS.filter((entry) => entry.type === 'reporter' || entry.type === 'boolean').map((entry) => entry.opcode);
export const HAT_OPCODES = BLOCKS.filter((entry) => entry.type === 'hat').map((entry) => entry.opcode);
