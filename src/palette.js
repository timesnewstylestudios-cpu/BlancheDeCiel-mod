/* SPDX-License-Identifier: GPL-3.0-or-later
 * Core colours match vendor/penguinmod-blocks/core/colours.js (Apache-2.0, MIT).
 * New BlancheDeCiel categories use the same three-stop shape.
 */

export const PALETTE = {
  motion: { de: 'Bewegung', en: 'Motion', c1: '#4C97FF', c2: '#4280D7', c3: '#3373CC' },
  looks: { de: 'Aussehen', en: 'Looks', c1: '#9966FF', c2: '#855CD6', c3: '#774DCB' },
  sound: { de: 'Klang', en: 'Sound', c1: '#CF63CF', c2: '#C94FC9', c3: '#BD42BD' },
  events: { de: 'Ereignisse', en: 'Events', c1: '#FFBF00', c2: '#E6AC00', c3: '#CC9900' },
  control: { de: 'Steuerung', en: 'Control', c1: '#FFAB19', c2: '#EC9C13', c3: '#CF8B17' },
  sensing: { de: 'Fühlen', en: 'Sensing', c1: '#5CB1D6', c2: '#47A8D1', c3: '#2E8EB8' },
  operators: { de: 'Operatoren', en: 'Operators', c1: '#59C059', c2: '#46B946', c3: '#389438' },
  variables: { de: 'Variablen', en: 'Variables', c1: '#FF8C1A', c2: '#FF8000', c3: '#DB6E00' },
  lists: { de: 'Listen', en: 'Lists', c1: '#FF661A', c2: '#FF5500', c3: '#E64D00' },
  myblocks: { de: 'Meine Blöcke', en: 'My Blocks', c1: '#FF6680', c2: '#FF4D6A', c3: '#FF3355' },
  pen: { de: 'Stift', en: 'Pen', c1: '#0FBD8C', c2: '#0DA57A', c3: '#0B8E69' },
  audio: { de: 'Audio', en: 'Audio', c1: '#E4572E', c2: '#C73E1D', c3: '#A83318' },
  graphics: { de: 'Grafik', en: 'Graphics', c1: '#2E86AB', c2: '#1B6A89', c3: '#14556F' },
  grid: { de: 'Netz', en: 'Grid', c1: '#0F9D8A', c2: '#0C7C6E', c3: '#095E54' },
  ai: { de: 'KI', en: 'AI', c1: '#5B4B8A', c2: '#46396E', c3: '#322850' },
  analyse: { de: 'Analyse', en: 'Analyse', c1: '#6B5B95', c2: '#55497A', c3: '#3E345C' },
  neural: { de: 'Netz', en: 'Neural', c1: '#3D8B8B', c2: '#2F6F6F', c3: '#215555' },
  unix: { de: 'Rechner', en: 'Shell', c1: '#5A6A7A', c2: '#465564', c3: '#33404C' },
};

export const CATEGORY_ORDER = [
  'motion', 'looks', 'sound', 'events', 'control', 'sensing', 'operators',
  'variables', 'lists', 'myblocks', 'pen', 'audio', 'graphics', 'grid', 'ai', 'neural', 'unix', 'analyse',
];

export function categoryColor(id) {
  return PALETTE[id] || { de: id, en: id, c1: '#777777', c2: '#555555', c3: '#333333' };
}
