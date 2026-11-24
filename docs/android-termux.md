# Android-App auf dem Telefon mit Termux

Dieselbe Capacitor-Hülle wie in [android-studio.md](android-studio.md), nur ohne Desktop. Das ist ein belegter, aber empfindlicher Weg. Auf einem Rechner mit Android Studio ist der Build zuverlässiger. Was hier unsicher ist, steht dabei.

Die Schritte gelten für Termux von F-Droid auf einem arm64-Gerät (`uname -m` zeigt `aarch64`). Termux aus dem Play Store ist veraltet und wird nicht unterstützt.

AndroidIDE und ähnliche Termux-IDEs bringen oft ein eigenes arm64-SDK mit. Wer so eine IDE nutzt, kann deren SDK als `ANDROID_HOME` verwenden und ab Schritt „Gradle“ weitermachen. Die IDE ersetzt nicht das Repository: die Website muss trotzdem gebaut und mit `cap sync` in `www/` liegen.

## 1. Pakete

```bash
pkg update
pkg install -y nodejs-lts openjdk-17 git wget unzip termux-tools aapt2
```

- `nodejs-lts` liefert Node und npm. `node -v` soll 20 oder neuer sein.
- `openjdk-17` ist das JDK, das Capacitor 7 und das Android Gradle Plugin verlangen.
- `gradle` aus den Termux-Paketen nicht für dieses Projekt benutzen. Das Projekt bringt `./gradlew` mit, sobald `cap add android` gelaufen ist. Die Wrapper-Version und das Plugin passen zusammen, ein systemweites Gradle oft nicht.
- `aapt2` aus Termux ist ein arm64-Binary. Googles Build-Tools liefern `aapt2` nur für x86_64. Ohne Austausch bricht der Build auf dem Telefon mit `Exec format error` ab.

`JAVA_HOME` setzen. Der genaue Ordner heißt in Termux meist so:

```bash
export JAVA_HOME="$PREFIX/lib/jvm/java-17-openjdk"
export PATH="$PATH:$JAVA_HOME/bin"
```

Wenn der Ordner fehlt: `ls "$PREFIX/lib/jvm"` und den dort liegenden Java-17-Ordner nehmen. Die beiden `export`-Zeilen in `~/.bashrc` schreiben, damit sie nach einem neuen Terminal noch gelten.

Mehrere Gigabyte frei lassen. npm, das SDK und Gradle laden viel.

## 2. Android-SDK

`sdkmanager` selbst ist ein Java-Programm und läuft auf arm64. Die damit installierten Build-Tools sind trotzdem x86_64-Linux. Plattformdateien (`android.jar`) sind davon unabhängig und verwendbar.

Die Linux-ZIP der Command-Line-Tools von https://developer.android.com/studio#command-line-tools-only herunterladen. Die Zahl im Dateinamen ändert sich. Beispiel, die URL bei einem 404 auf der Seite nachsehen:

```bash
mkdir -p "$HOME/android-sdk/cmdline-tools"
cd "$HOME/android-sdk/cmdline-tools"
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip
rm commandlinetools-linux-11076708_latest.zip
mv cmdline-tools latest
```

Die ZIP entpackt einen Ordner `cmdline-tools`. Der muss am Ende `$HOME/android-sdk/cmdline-tools/latest/bin/sdkmanager` heißen. Liegt `sdkmanager` eine Ebene daneben, den Ordner umbenennen, bis der Pfad stimmt.

```bash
export ANDROID_HOME="$HOME/android-sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
yes | sdkmanager --licenses
sdkmanager "platforms;android-35" "build-tools;35.0.0"
```

Capacitor 7 schreibt nach `cap add` die SDK-Nummer nach `android/variables.gradle`. Steht dort 36 statt 35, die passende Plattform nachinstallieren: `sdkmanager "platforms;android-36"`.

Unsicher und schon vorgekommen: AGP sucht `platforms/android-35`, sdkmanager legt `platforms/android-35` oder `android-35.0` an. Fehlt das Verzeichnis, eine symbolische Verknüpfung auf den vorhandenen Ordner setzen.

`local.properties` entsteht erst mit dem Android-Projekt (Schritt 4). Dort muss stehen:

```properties
sdk.dir=/data/data/com.termux/files/home/android-sdk
```

Den Pfad mit `echo "$ANDROID_HOME"` prüfen. Keine `~` verwenden.

## 3. aapt2 und zipalign

In `~/.gradle/gradle.properties` (anlegen, falls die Datei fehlt):

```properties
android.aapt2FromMavenOverride=/data/data/com.termux/files/usr/bin/aapt2
org.gradle.jvmargs=-Xmx1024m -Dfile.encoding=UTF-8
org.gradle.parallel=false
org.gradle.workers.max=1
```

`$PREFIX/bin/aapt2` ist derselbe Pfad. Die kleine Heap-Größe ist Absicht: Telefone beenden Gradle sonst mit Speicherknappheit. Der Build dauert dadurch länger.

Das Termux-`aapt2` kann für neue Ressourcenformate zu alt sein. Typische Meldung: Fehler in `aapt2` zu „resource table“ oder einer nicht unterstützten Version. Dann das Binary aus einer arm64-Build-Tools-Sammlung ersetzen. Eine Quelle, die in Termux-Projekten genannt wird, ist das Paket von lzhiyong:

https://github.com/lzhiyong/termux-ndk/releases/download/android-sdk/android-sdk-aarch64.zip

Ob die Datei unter dieser URL noch liegt, vor dem Laden prüfen. Die Releases-Seite https://github.com/lzhiyong/termux-ndk/releases ist die Referenz, falls der direkte Link 404 liefert. `aapt2` und `zipalign` aus dem Archiv nach `$PREFIX/bin/` kopieren und `chmod +x` setzen. `zipalign` aus den Google-Build-Tools ist ebenfalls x86_64. AGP ruft es am Ende auf. Fehlt ein arm64-`zipalign`, scheitert der Build spät, nach dem Dexen. Dieselbe Ersetzung behebt das.

`file "$(command -v aapt2)"` muss `ARM aarch64` oder `arm64` zeigen, nicht `x86-64`.

Manche arm64-Builds sind gegen glibc gelinkt, nicht gegen Bionic. Dann erscheint `libc.so: invalid ELF header`, weil Termux `LD_LIBRARY_PATH` setzt. In dem Fall Gradle so starten:

```bash
env -u LD_PRELOAD -u LD_LIBRARY_PATH ./gradlew assembleDebug
```

Das Termux-Paket `aapt2` ist für Bionic gebaut. Dafür die Variablen nicht löschen, sonst findet es seine Bibliotheken nicht. Das Skript `scripts/build-android-termux.sh` lässt die Variablen stehen. Nur bei der glibc-Meldung `TERMUX_CLEAR_LD=1` davor setzen.

## 4. Repository, Website, Capacitor

```bash
git clone https://github.com/timesnewstylestudios-cpu/BlancheDeCiel-mod.git
cd BlancheDeCiel-mod
npm ci
npm test
npm run build
cd android-wrapper
npm install
npm run prepare
npx cap add android
npx cap sync
```

`npx cap add android` nur beim ersten Mal. Danach `npm run prepare` und `npx cap sync`, wenn sich die Website geändert hat.

In `android/local.properties` die Zeile `sdk.dir=...` eintragen, falls Capacitor sie nicht gesetzt hat.

In `android/gradle.properties` dieselbe `android.aapt2FromMavenOverride`-Zeile wie oben anhängen, falls sie dort fehlt. AGP liest die Datei im Projekt. `~/.gradle/gradle.properties` gilt zusätzlich. Beides zu setzen schadet nicht.

## 5. Debug-APK

```bash
cd android
./gradlew assembleDebug
```

Oder aus dem Repository-Wurzelverzeichnis:

```bash
bash scripts/build-android-termux.sh
```

Das Skript prüft Node, Java und `aapt2`, baut die Website, führt `cap sync` aus, schreibt die aapt2-Zeile und startet `assembleDebug`. Es installiert keine Pakete und lädt kein SDK. Dafür bleiben die Schritte 1 bis 3 zuständig.

Die APK:

`android-wrapper/android/app/build/outputs/apk/debug/app-debug.apk`

Installation auf demselben Telefon:

```bash
termux-open --view app/build/outputs/apk/debug/app-debug.apk
```

Der System-Installer öffnet sich. Unbekannte Herkunft muss in den Android-Einstellungen erlaubt sein. `adb` auf demselben Gerät gegen sich selbst ist umständlich und hier nicht nötig.

Bluetooth-Rechte sind dieselben wie in der Studio-Anleitung: `BLUETOOTH_SCAN` und `BLUETOOTH_CONNECT`, auf älteren API-Stufen zusätzlich die alten Bluetooth-Rechte. Die Nachfrage kommt beim ersten Tippen auf den Bluetooth-Knopf.

## 6. Signierte Release-APK

`keytool` kommt mit OpenJDK und läuft auf arm64.

```bash
keytool -genkeypair -v \
  -keystore "$HOME/blanche-release.keystore" \
  -alias blanche \
  -keyalg RSA -keysize 2048 -validity 10000
```

Signierung eintragen wie in [android-studio.md](android-studio.md), Abschnitt „Signierte Release-APK und AAB“. Danach:

```bash
cd android-wrapper/android
./gradlew assembleRelease
```

`bundleRelease` für ein AAB ist derselbe Aufruf mit anderem Task. Er braucht ebenfalls das arm64-`aapt2` und genug Speicher. Auf kleinen Geräten ist ein Release-Build mit R8 der häufigste Abbruch. `minifyEnabled false` steht deshalb in der Studio-Anleitung und gilt hier genauso.

`apksigner` aus den Google-Build-Tools ist ein Java-Programm und läuft, `zipalign` daneben oft nicht. Wenn der Release-Task an `zipalign` scheitert, das arm64-Binary aus demselben Archiv wie `aapt2` über die Datei in `build-tools/<version>/zipalign` legen.

## 7. Bekannte Grenzen

- Der offizielle Android-SDK-Manager installiert auf arm64 keine lauffähigen Build-Tools. `aapt2` und `zipalign` müssen aus Termux oder einem arm64-Archiv kommen. Welche Binary neu genug für das gerade von Capacitor erzeugte Android-Gradle-Plugin ist, ändert sich. Ein Debug-Build, der mit der Termux-`aapt2` durchläuft, ist der Beleg, nicht diese Seite.
- Telefone mit wenig RAM brechen Gradle ab, auch mit `-Xmx1024m`. Dann auf einem Rechner mit Android Studio bauen und nur die APK auf das Telefon kopieren.
- `npx cap add android` und der erste Gradle-Lauf laden aus dem Netz. Ohne Netz bricht der Schritt ab. Ein einmal erzeugter `android/`-Ordner und ein gefüllter Gradle-Cache lassen spätere Debug-Builds eher offline zu. Das ist nicht garantiert, weil Plugins ihre Abhängigkeiten prüfen.
- Native Bibliotheken im BLE-Plugin liegen als fertige `.so` für `arm64-v8a` im AAR. Ein NDK-Build auf dem Telefon ist für diese App nicht nötig. Fehlt die Bibliothek in der APK, ist das Plugin nicht mit `cap sync` angekommen, nicht der Compiler.
- Play-Store-Upload eines auf dem Telefon signierten AAB ist möglich, wenn `bundleRelease` durchläuft. Die Prüfung im Play Console kann trotzdem eine zu alte `aapt2`-Version bemängeln. Dann das neuere arm64-Binary verwenden oder das Bundle auf dem Desktop neu bauen.
