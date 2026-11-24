/* SPDX-License-Identifier: GPL-3.0-or-later */

import { createMachine } from './vunix.js';

let machine = createMachine({ practice: true });

self.onmessage = (event) => {
  const data = event.data || {};
  if (data.t === 'reset') {
    machine = createMachine({ practice: true });
    self.postMessage({ id: data.id, ok: true });
    return;
  }
  if (data.t === 'exec') {
    const result = machine.exec(String(data.line || ''));
    self.postMessage({ id: data.id, ...result });
  }
};
