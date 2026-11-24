/* SPDX-License-Identifier: GPL-3.0-or-later
 * Web Bluetooth is missing in many embedded WebViews. These probes try, in order:
 * a native bridge, Capacitor BLE, Web Bluetooth, Web Serial and Web USB.
 */

export function chromeIntentUrl(href = (typeof location !== 'undefined' ? location.href : 'https://example.com')) {
  const url = new URL(href, 'https://example.com');
  const scheme = url.protocol.replace(':', '') || 'https';
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
}

export function linkPaths(root = globalThis) {
  const nav = root.navigator || {};
  const bridge = root.BlancheBridge || root.Android || null;
  return {
    bridge: !!(bridge && (bridge.requestDevice || bridge.btPing || bridge.bluetoothPing)),
    capacitor: !!root.Capacitor?.Plugins?.BluetoothLe,
    webBluetooth: !!nav.bluetooth,
    webSerial: !!nav.serial,
    webUsb: !!nav.usb,
  };
}

export function bluetoothAvailable(root = globalThis) {
  const paths = linkPaths(root);
  return paths.bridge || paths.capacitor || paths.webBluetooth || paths.webSerial || paths.webUsb;
}

async function fromBridge(root) {
  const bridge = root.BlancheBridge || root.Android;
  if (!bridge) return null;
  if (typeof bridge.requestDevice === 'function') {
    const device = await bridge.requestDevice();
    return { ok: true, path: 'bridge', name: device?.name || device?.deviceId || 'bridge' };
  }
  if (typeof bridge.bluetoothPing === 'function') {
    const result = await bridge.bluetoothPing();
    return { ...result, path: 'bridge' };
  }
  if (typeof bridge.btPing === 'function') {
    const name = bridge.btPing();
    return { ok: !!name, path: 'bridge', name: name || 'bridge' };
  }
  return null;
}

async function fromCapacitor(root) {
  const ble = root.Capacitor?.Plugins?.BluetoothLe;
  if (!ble?.requestDevice) return null;
  if (ble.initialize) await ble.initialize();
  const device = await ble.requestDevice({});
  return { ok: true, path: 'capacitor', name: device?.name || device?.deviceId || 'ble' };
}

async function fromWebBluetooth(nav) {
  if (!nav.bluetooth) return null;
  const device = await nav.bluetooth.requestDevice({ acceptAllDevices: true });
  return { ok: true, path: 'web-bluetooth', name: device.name || 'gerät' };
}

async function fromSerial(nav) {
  if (!nav.serial) return null;
  const port = await nav.serial.requestPort();
  await port.open({ baudRate: 9600 });
  const writer = port.writable?.getWriter();
  if (writer) {
    await writer.write(new TextEncoder().encode('{"bdc":"ping"}\n'));
    writer.releaseLock();
  }
  return { ok: true, path: 'web-serial', name: 'serial' };
}

async function fromUsb(nav) {
  if (!nav.usb) return null;
  const device = await nav.usb.requestDevice({ filters: [] });
  await device.open();
  if (device.configuration == null && device.selectConfiguration) await device.selectConfiguration(1);
  return { ok: true, path: 'web-usb', name: device.productName || 'usb' };
}

export async function bluetoothPing(root = globalThis) {
  const attempts = [
    () => fromBridge(root),
    () => fromCapacitor(root),
    () => fromWebBluetooth(root.navigator || {}),
    () => fromSerial(root.navigator || {}),
    () => fromUsb(root.navigator || {}),
  ];
  const paths = linkPaths(root);
  if (!Object.values(paths).some(Boolean)) return { ok: false, reason: 'unavailable', paths };
  let last = { ok: false, reason: 'unavailable', paths };
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result?.ok) return { ...result, paths };
      if (result) last = { ...result, paths };
    } catch (error) {
      last = { ok: false, reason: error?.name || 'error', message: error?.message || '', paths };
    }
  }
  return last;
}
