/* SPDX-License-Identifier: GPL-3.0-or-later
 * Web Bluetooth is optional. Android WebView (AppGeyser) does not provide it.
 */

export function bluetoothAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export async function bluetoothPing() {
  if (!bluetoothAvailable()) return { ok: false, reason: 'unavailable' };
  try {
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
    return { ok: true, name: device.name || 'gerät' };
  } catch (error) {
    return { ok: false, reason: error?.name || 'error', message: error?.message || '' };
  }
}
