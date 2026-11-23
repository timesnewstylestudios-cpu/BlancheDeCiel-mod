/* SPDX-License-Identifier: GPL-3.0-or-later
 * Subset of the PenguinMod unsandboxed extension shape.
 */

const BLOCK_TYPES = {
  COMMAND: 'command',
  REPORTER: 'reporter',
  BOOLEAN: 'Boolean',
  HAT: 'hat',
  CONDITIONAL: 'conditional',
  LOOP: 'loop',
  EVENT: 'event',
};

const ARG_TYPES = {
  NUMBER: 'number',
  STRING: 'string',
  BOOLEAN: 'Boolean',
  COLOR: 'color',
  ANGLE: 'angle',
};

function castType(blockType) {
  const value = String(blockType || 'command');
  if (value === 'Boolean' || value === 'boolean') return 'boolean';
  if (value === 'reporter') return 'reporter';
  if (value === 'hat' || value === 'event') return 'hat';
  if (value === 'conditional') return 'celse';
  if (value === 'loop') return 'c';
  return 'command';
}

function argDefault(def) {
  const type = def?.type;
  if (type === 'number' || type === 'angle') return { kind: 'num', value: Number(def.defaultValue ?? 0) };
  return { kind: 'str', value: def?.defaultValue != null ? String(def.defaultValue) : '' };
}

export function createExtensionHost() {
  const map = new Map();

  function register(extension) {
    if (!extension || typeof extension.getInfo !== 'function') {
      throw new Error('extension-shape');
    }
    const info = extension.getInfo();
    if (!info || !info.id) throw new Error('extension-id');
    const argNames = {};
    const blocks = [];
    for (const block of info.blocks || []) {
      if (!block || typeof block !== 'object') continue;
      const names = Object.keys(block.arguments || {});
      argNames[block.opcode] = names;
      const type = castType(block.blockType);
      let text = String(block.text || block.opcode);
      names.forEach((name, index) => {
        text = text.replaceAll(`[${name}]`, `%${index + 1}`);
      });
      blocks.push({
        opcode: block.opcode,
        type,
        text,
        color: info.color1 || '#5B4B8A',
        args: names.map((name) => argDefault(block.arguments[name])),
      });
    }
    map.set(info.id, {
      id: info.id,
      name: info.name || info.id,
      color: info.color1 || '#5B4B8A',
      instance: extension,
      argNames,
      blocks,
    });
  }

  const Scratch = {
    BlockType: BLOCK_TYPES,
    ArgumentType: ARG_TYPES,
    Cast: {
      toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
      },
      toString(value) {
        return value == null ? '' : String(value);
      },
      toBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
          const text = value.toLowerCase();
          return text !== '' && text !== '0' && text !== 'false';
        }
        return !!value;
      },
    },
    extensions: {
      unsandboxed: true,
      isPenguinMod: true,
      isBlancheDeCiel: true,
      register,
    },
    vm: null,
  };

  return {
    Scratch,
    register,
    get(id) { return map.get(id) || null; },
    list() { return [...map.values()]; },
    load(code) {
      const run = new Function('Scratch', `${code}\n//# sourceURL=blanche-extension.js`);
      run(Scratch);
    },
  };
}
