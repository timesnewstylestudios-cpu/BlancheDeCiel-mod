import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, '../dist');
const www = resolve(root, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(dist, www, { recursive: true });
const indexPath = resolve(www, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const tag = '<script type="module" src="./blanche-bridge.js"></script>';
if (!html.includes('blanche-bridge.js')) {
  writeFileSync(indexPath, html.replace('</body>', `${tag}\n</body>`));
}
cpSync(resolve(root, 'bridge/blanche-bridge.js'), resolve(www, 'blanche-bridge.js'));
console.log('www aktualisiert aus ../dist');
