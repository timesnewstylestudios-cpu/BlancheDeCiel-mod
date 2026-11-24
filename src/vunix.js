/* SPDX-License-Identifier: GPL-3.0-or-later
 * An in-memory Unix-like shell. It cannot see the real disk, the network, or other processes.
 */

const LIMITS = { files: 200, bytes: 200000, out: 8000, commands: 32 };

export function practiceFiles() {
  return {
    '/home/gast/liesmich.txt': { text: 'Willkommen. Diese Übung liegt nur in diesem virtuellen Rechner.', mode: '644' },
    '/home/gast/notiz.txt': { text: 'Die Marke steht in /home/gast/geheim/marke.txt', mode: '644' },
    '/home/gast/geheim/marke.txt': { text: 'bdc{nur-sandbox}', mode: '600' },
    '/etc/aufgabe.conf': { text: 'writable=yes\npassword=admin\n', mode: '666' },
  };
}

export function createMachine(options = {}) {
  const files = {};
  const procs = [];
  let nextPid = 2;
  let cwd = '/home/gast';
  const env = { PATH: '/bin', USER: 'gast', HOME: '/home/gast' };
  if (options.practice !== false) {
    Object.assign(files, practiceFiles());
  }
  const machine = {
    files,
    env,
    cwd: () => cwd,
    dump() {
      return { cwd, env: { ...env }, files: structuredClone(files) };
    },
    exec(line) {
      const started = Date.now();
      const segments = splitPipes(tokenize(String(line).slice(0, 500)));
      if (segments.length > LIMITS.commands) return finish(126, '', 'Zu viele Befehle');
      let input = '';
      let output = '';
      let code = 0;
      let error = '';
      for (const segment of segments) {
        if (Date.now() - started > 40) return finish(124, output, 'Zeitgrenze');
        const parsed = parseRedirects(segment);
        if (parsed.input != null) input = readFile(files, resolve(cwd, parsed.input))?.text ?? '';
        const result = runCommand(parsed.argv, input, machine, () => cwd, (next) => { cwd = next; });
        procs.push({ pid: nextPid, cmd: parsed.argv.join(' '), state: 'done' });
        nextPid += 1;
        if (procs.length > 20) procs.shift();
        code = result.code;
        error = result.err;
        output = result.out;
        if (parsed.output) {
          writeFile(files, resolve(cwd, parsed.output), parsed.append ? `${readFile(files, resolve(cwd, parsed.output))?.text || ''}${output}` : output);
          output = '';
        }
        input = output;
        if (code !== 0) break;
      }
      return finish(code, output, error);
    },
  };

  function runCommand(argv, input, box, getCwd, setCwd) {
    const [cmd, ...args] = argv;
    if (!cmd) return { code: 0, out: input, err: '' };
    if (cmd === 'echo') return ok(args.join(' '));
    if (cmd === 'pwd') return ok(getCwd());
    if (cmd === 'cd') {
      const next = resolve(getCwd(), args[0] || env.HOME);
      setCwd(next);
      box.cwd = () => next;
      return ok('');
    }
    if (cmd === 'ls') {
      const dir = resolve(getCwd(), args[0] || '.');
      const names = Object.keys(files)
        .filter((path) => path.startsWith(dir === '/' ? '/' : `${dir}/`) && path.slice((dir === '/' ? 1 : dir.length + 1)).indexOf('/') < 0)
        .map((path) => path.slice(path.lastIndexOf('/') + 1));
      return ok(names.join('\n'));
    }
    if (cmd === 'cat') {
      if (!args.length) return ok(input);
      const texts = args.map((arg) => readFile(files, resolve(getCwd(), arg))?.text ?? '');
      return ok(texts.join('\n'));
    }
    if (cmd === 'mkdir' || cmd === 'rm') return ok('');
    if (cmd === 'grep') {
      const pattern = args[0] ?? '';
      const source = args[1] ? (readFile(files, resolve(getCwd(), args[1]))?.text || '') : input;
      return ok(source.split('\n').filter((line) => line.includes(pattern)).join('\n'));
    }
    if (cmd === 'env') return ok(Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n'));
    if (cmd === 'ps') return ok(procs.map((proc) => `${proc.pid} ${proc.state} ${proc.cmd}`).join('\n'));
    if (cmd === 'audit') return ok(audit(files));
    if (cmd === 'owncheck') {
      if (args[0] !== 'ich-bin-berechtigt') return { code: 1, out: '', err: 'Bestätigung fehlt. Schreibe owncheck ich-bin-berechtigt.' };
      return ok('Bestätigt. Geprüft wird nur diese Sandbox. Portscans und Angriffe auf andere Rechner sind nicht enthalten.');
    }
    if (cmd === 'practice') {
      Object.keys(files).forEach((key) => delete files[key]);
      Object.assign(files, practiceFiles());
      return ok('Übung geladen');
    }
    return { code: 127, out: '', err: `Unbekannt: ${cmd}` };
  }

  return machine;
}

function finish(code, out, err) {
  return { code, out: String(out).slice(0, LIMITS.out), err: String(err).slice(0, 500) };
}

function ok(out) {
  return { code: 0, out, err: '' };
}

function audit(files) {
  const lines = [];
  for (const [path, file] of Object.entries(files)) {
    if (file.mode === '666') lines.push(`schreibbar ${path}`);
    if (String(file.text).includes('password=')) lines.push(`kennwort-zeile ${path}`);
  }
  return lines.join('\n');
}

function tokenize(line) {
  const out = [];
  let cur = '';
  let quote = '';
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = '';
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '|') {
      if (cur) out.push(cur);
      cur = '';
      out.push('|');
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function splitPipes(tokens) {
  const parts = [[]];
  for (const token of tokens) {
    if (token === '|') parts.push([]);
    else parts[parts.length - 1].push(token);
  }
  return parts.filter((part) => part.length);
}

function parseRedirects(tokens) {
  const argv = [];
  let output = null;
  let append = false;
  let input = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '>' || token === '>>') {
      output = tokens[index + 1] || '';
      append = token === '>>';
      index += 1;
    } else if (token === '<') {
      input = tokens[index + 1] || '';
      index += 1;
    } else argv.push(token);
  }
  return { argv, output, append, input };
}

function resolve(cwd, input) {
  if (!input || input === '.') return cwd || '/';
  const abs = input.startsWith('/') ? input : `${cwd === '/' ? '' : cwd}/${input}`;
  const parts = [];
  for (const part of abs.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function readFile(files, path) {
  return files[path] || null;
}

function writeFile(files, path, text) {
  if (Object.keys(files).length >= LIMITS.files && !files[path]) return;
  files[path] = { text: String(text).slice(0, LIMITS.bytes), mode: '644' };
}

export function createHost() {
  let worker = null;
  let seq = 0;
  const pending = new Map();
  const fallback = createMachine({ practice: true });
  function ensure() {
    if (worker || typeof Worker === 'undefined') return worker;
    try {
      worker = new Worker(new URL('./vunix-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const done = pending.get(event.data?.id);
        if (!done) return;
        pending.delete(event.data.id);
        done(event.data);
      };
    } catch {
      worker = null;
    }
    return worker;
  }
  return {
    exec(line) {
      const live = ensure();
      if (!live) return Promise.resolve(fallback.exec(line));
      return new Promise((resolve) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ code: 124, out: '', err: 'Zeitgrenze' });
        }, 200);
        pending.set(id, (result) => {
          clearTimeout(timer);
          resolve({ code: result.code, out: result.out || '', err: result.err || '' });
        });
        live.postMessage({ t: 'exec', id, line });
      });
    },
  };
}
