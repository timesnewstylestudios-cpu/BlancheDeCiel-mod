# Android-App mit Android Studio

Diese Anleitung baut eine APK und ein App Bundle aus `android-wrapper/`. Die Website selbst bleibt der statische Ordner `dist/`. Bluetooth läuft in dieser App über `@capacitor-community/bluetooth-le` und `window.BlancheBridge`.

## 1. Voraussetzungen

- Node.js 20 oder neuer (aktuelle LTS-Linie). `node -v` muss mindestens `v20` zeigen.
- JDK 17. Android Studio bringt ein passendes JetBrains-Runtime mit; für die Kommandozeile zusätzlich ein JDK 17 installieren und `JAVA_HOME` darauf setzen. `java -version` muss 17 nennen.
- Android Studio (aktuelle stabile Ausgabe) mit Android SDK. Im SDK Manager installieren:
  - Android SDK Platform 35 (Capacitor 7 erwartet diese Plattform; liegt nach `cap add` eine andere Nummer in `android/variables.gradle`, diese Plattform nachinstallieren)
  - Android SDK Build-Tools 35
  - Android SDK Platform-Tools (`adb`)
- Ein Telefon mit USB-Debugging oder ein Emulator. Für Bluetooth ein echtes Gerät; Emulatoren haben kein verlässliches BLE.

`ANDROID_HOME` auf das SDK zeigen lassen, zum Beispiel unter Linux `~/Android/Sdk`. Android Studio zeigt den Pfad unter Settings → Languages & Frameworks → Android SDK.

## 2. Website bauen

Im Wurzelverzeichnis des Repositories:

```bash
npm ci
npm test
npm run build
```

`dist/` ist die Oberfläche, die danach in die App kopiert wird.

## 3. Android-Projekt erzeugen

```bash
cd android-wrapper
npm install
npm run prepare
npx cap add android
npx cap sync
npx cap open android
```

`npx cap add android` nur beim ersten Mal. Es legt `android-wrapper/android/` an. Dieser Ordner ist lokal und wird nicht eingecheckt. Später reichen `npm run prepare` im Ordner `android-wrapper` (nach einem neuen `npm run build` im Wurzelverzeichnis) und `npx cap sync`.

`npm run prepare` kopiert `../dist` nach `www/` und hängt `blanche-bridge.js` an. Die Brücke setzt `window.BlancheBridge`.

## 4. Debug-APK

In Android Studio: Build → Build Bundle(s) / APK(s) → Build APK(s).

Oder im Ordner `android-wrapper/android`:

```bash
./gradlew assembleDebug
```

Die Datei liegt unter

`android-wrapper/android/app/build/outputs/apk/debug/app-debug.apk`

Sie ist mit dem Debug-Schlüssel signiert. Installation über Android Studio (Run) oder:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Beim ersten Start fragt Android nach Geräten in der Nähe (Bluetooth). Die Brücke setzt `androidNeverForLocation: true`, damit ein Scan auf Android 12 und neuer keine Standortfreigabe braucht. Taucht trotzdem eine Standortabfrage auf, kommt sie aus dem Manifest des BLE-Plugins; der Scan selbst nutzt den Standort dann nicht.

Rechte, die das Plugin einmergegt:

- `android.permission.BLUETOOTH_SCAN`
- `android.permission.BLUETOOTH_CONNECT`
- auf API 30 und älter zusätzlich `BLUETOOTH` und `BLUETOOTH_ADMIN`

Mikrofon, falls die Aufnahme in der App genutzt wird, fragt das System getrennt (`RECORD_AUDIO`). Das ist keine Bluetooth-Berechtigung.

## 5. Signierte Release-APK und AAB

Schlüssel einmal erzeugen und außerhalb des Repositories aufbewahren. Die Passwörter nicht committen.

```bash
keytool -genkeypair -v \
  -keystore "$HOME/blanche-release.keystore" \
  -alias blanche \
  -keyalg RSA -keysize 2048 -validity 10000
```

In Android Studio: Build → Generate Signed App Bundle or APK. Den Keystore wählen, Alias `blanche`, Build-Variante `release`, und sowohl APK als auch Android App Bundle erzeugen lassen.

Dieselbe Signierung auf der Kommandozeile: Datei `android-wrapper/android/keystore.properties` (nicht committen):

```properties
storeFile=/home/DU/.blanche-release.keystore
storePassword=GEHEIM
keyAlias=blanche
keyPassword=GEHEIM
```

In `android-wrapper/android/app/build.gradle` im Block `android {` ergänzen, falls er noch keine `signingConfigs` für `release` hat. Capacitor erzeugt die Datei neu, wenn `android/` gelöscht und `cap add` wiederholt wird. Die Ergänzung danach wieder einsetzen.

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
```

`minifyEnabled false` lässt den ersten Release-Build ohne R8-Regeln durchlaufen. Schrumpfen kann später eingeschaltet werden, wenn die App startet.

```bash
cd android-wrapper/android
./gradlew assembleRelease
./gradlew bundleRelease
```

Ausgaben:

- APK: `app/build/outputs/apk/release/app-release.apk`
- AAB: `app/build/outputs/bundle/release/app-release.aab`

Die APK lässt sich mit `adb install -r` auf ein Gerät spielen. Das AAB ist das Format für den Play Store. Play App Signing übernimmt dort die endgültige Signatur; der Upload-Schlüssel ist der eben erzeugte Keystore.

## 6. Wenn der Build scheitert

- `SDK location not found`: `local.properties` im Ordner `android/` muss `sdk.dir=/absoluter/Pfad/zum/Sdk` enthalten. Android Studio schreibt das beim Öffnen. Auf der Kommandozeile die Zeile selbst eintragen. Unter Windows Backslashes verdoppeln.
- `java.lang.UnsupportedClassVersionError`: es läuft nicht JDK 17. `JAVA_HOME` prüfen.
- Lizenz nicht akzeptiert: `yes | sdkmanager --licenses` im SDK.
- Plugin-Version von Capacitor und vom BLE-Plugin müssen zusammenpassen. Im Ordner `android-wrapper` stehen die Versionen in `package.json`. Nach einem `npm install` dort immer `npx cap sync`.
