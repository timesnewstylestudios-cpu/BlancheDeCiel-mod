/* Optionale Brücke. Läuft nur in der Capacitor-Hülle, nicht in der statischen Website. */
import { BleClient } from '@capacitor-community/bluetooth-le';

window.BlancheBridge = {
  async requestDevice() {
    await BleClient.initialize({ androidNeverForLocation: true });
    const device = await BleClient.requestDevice({ allowDuplicates: false });
    return { name: device.name || 'ble', deviceId: device.deviceId };
  },
  async bluetoothPing() {
    const device = await this.requestDevice();
    return { ok: true, name: device.name, path: 'capacitor' };
  },
};
