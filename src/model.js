/* SPDX-License-Identifier: GPL-3.0-or-later */

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function createSprite(name, extra = {}) {
  return {
    id: uid(),
    name,
    isStage: !!extra.isStage,
    x: extra.x ?? 0,
    y: extra.y ?? 0,
    dir: extra.dir ?? 90,
    size: extra.size ?? 100,
    visible: extra.visible !== false,
    penDown: false,
    penColor: '#0FBD8C',
    penSize: 2,
    layer: 'zeichnung',
    wave: 'sine',
    filterType: 'lowpass',
    filterFreq: 18000,
    adsr: { a: 0.02, d: 0.08, s: 0.7, r: 0.12 },
    bubble: null,
    variables: {},
    lists: {},
    scripts: [],
    costume: null,
    costumeName: '',
    costumes: [],
    costumeIndex: 0,
    sounds: [],
    isClone: false,
    cloneParent: null,
    effects: { ghost: 0 },
  };
}

export function block(opcode, args = [], extra = {}) {
  return {
    id: uid(),
    opcode,
    args,
    body: extra.body || null,
    elseBody: extra.elseBody || null,
  };
}

export function num(value) {
  return { kind: 'num', value: Number(value) };
}

export function str(value) {
  return { kind: 'str', value: String(value) };
}

export function emptyProject() {
  return {
    name: 'Projekt',
    tempo: 120,
    sprites: [],
    tables: {},
    jobResults: {},
    jobLog: [],
    shader: 'none',
    boxes: [],
    spheres: [],
    camera: { x: 0, y: 0, z: 280, yaw: 30, pitch: 20 },
    drawOps: [],
    aiBlocksEnabled: false,
    log: [],
    answer: '',
  };
}

export function createProject() {
  const project = emptyProject();
  const stage = createSprite('Bühne', { isStage: true });
  const figur = createSprite('Figur');
  figur.scripts.push({
    id: uid(),
    x: 48,
    y: 48,
    proc: null,
    blocks: [
      block('whenflag'),
      block('pendown'),
      block('repeat', [num(4)], {
        body: [block('move', [num(80)]), block('turn', [num(90)])],
      }),
      block('say', [str('Quadrat'), num(2)]),
    ],
  });
  project.sprites.push(stage, figur);
  return project;
}

export function stageOf(project) {
  return project.sprites.find((sprite) => sprite.isStage) || project.sprites[0] || null;
}

export function runnableScripts(sprite) {
  return sprite.scripts.filter((script) => !script.proc);
}

export function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

export function comparable(project) {
  const data = cloneData(project);
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      delete node.id;
      delete node.bubble;
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(data);
  return data;
}

export function findSprite(project, name) {
  return project.sprites.find((sprite) => sprite.name === name && !sprite.isClone) || null;
}

const STAGE_NAMES = new Set(['Bühne', 'Buehne', 'Stage']);

export function ensureSprite(project, name) {
  let sprite = findSprite(project, name);
  if (sprite) return sprite;
  const wantsStage = STAGE_NAMES.has(name) && !project.sprites.some((item) => item.isStage);
  sprite = createSprite(name, { isStage: wantsStage });
  if (sprite.isStage) project.sprites.unshift(sprite);
  else project.sprites.push(sprite);
  return sprite;
}
