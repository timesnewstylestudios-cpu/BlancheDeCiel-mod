# Android-Hülle mit Bluetooth

Die Website in `dist/` bleibt der Weg für AppGeyser und GitHub Pages. Diese Hülle ist ein zweiter Weg, wenn Bluetooth auf dem Gerät wirklich senden und wählen soll.

AppGeyser liefert kein Web Bluetooth. Chrome auf demselben Telefon schon. In der Website gibt es dafür „In Chrome öffnen“. Diese Hülle setzt zusätzlich `window.BlancheBridge` über das Plugin `@capacitor-community/bluetooth-le`. Die Website erkennt die Brücke ohne Änderung am AppGeyser-Build.

## Bauen

Voraussetzung: Node.js 20, Android Studio, ein Gerät oder Emulator mit Bluetooth.

Im Repository-Wurzelverzeichnis zuerst die Website bauen:

```bash
npm ci
npm run build
```

Dann:

```bash
cd android-wrapper
npm install
npm run prepare
npx cap add android
npx cap sync
npx cap open android
```

`cap add android` nur beim ersten Mal. Danach reichen `npm run prepare` und `npx cap sync`. In Android Studio die App starten. Beim ersten Bluetooth-Tipp fragt das System nach der Berechtigung und einem Gerät.

`android/` entsteht lokal und wird nicht mitgeliefert. Wer die Hülle ohne Capacitor schreibt, kann dieselbe Brücke selbst setzen: `window.BlancheBridge.requestDevice()` soll ein Promise mit `{ name }` liefern, oder `window.Android.btPing()` einen Namen als String.
