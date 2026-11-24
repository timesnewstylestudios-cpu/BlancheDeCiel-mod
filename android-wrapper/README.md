# Android-Hülle

Capacitor-Projekt um die statische Website. Die App spricht Bluetooth über `@capacitor-community/bluetooth-le`. `bridge/blanche-bridge.js` setzt dafür `window.BlancheBridge`. Die Website erkennt die Brücke von selbst.

Zwei Bauanleitungen, beide auf Deutsch:

- Rechner mit Android Studio: [docs/android-studio.md](../docs/android-studio.md)
- Telefon mit Termux: [docs/android-termux.md](../docs/android-termux.md)

Kurz auf einem Rechner, nachdem im Repository-Wurzelverzeichnis `npm ci` und `npm run build` gelaufen sind:

```bash
cd android-wrapper
npm install
npm run prepare
npx cap add android
npx cap sync
npx cap open android
```

`npx cap add android` nur beim ersten Mal. `android/` entsteht lokal und wird nicht eingecheckt.

Wer die Hülle ohne Capacitor schreibt, setzt dieselbe Brücke selbst. `window.BlancheBridge.requestDevice()` liefert ein Promise mit `{ name }`. Alternativ liefert `window.Android.btPing()` einen Namen als String.
