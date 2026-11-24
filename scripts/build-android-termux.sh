#!/data/data/com.termux/files/usr/bin/bash
# Baut die Debug-APK in Termux, nachdem Node, JDK 17, ANDROID_HOME und ein arm64-aapt2 stehen.
# Pakete und das SDK installiert dieses Skript nicht. Die Schritte stehen in docs/android-termux.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WRAPPER="$ROOT/android-wrapper"
ANDROID="$WRAPPER/android"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Nur Linux/Termux." >&2
  exit 1
fi

if [[ -z "${PREFIX:-}" ]]; then
  echo "PREFIX ist leer. Das Skript erwartet Termux (F-Droid)." >&2
  exit 1
fi

arch="$(uname -m)"
if [[ "$arch" != "aarch64" ]]; then
  echo "Architektur ist $arch, nicht aarch64. Auf x86_64 die Studio-Anleitung nutzen." >&2
  exit 1
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Fehlt: $1" >&2
    echo "pkg install -y nodejs-lts openjdk-17 git wget unzip aapt2" >&2
    exit 1
  fi
}

need node
need npm
need java
need git

if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d "$PREFIX/lib/jvm/java-17-openjdk" ]]; then
    export JAVA_HOME="$PREFIX/lib/jvm/java-17-openjdk"
  else
    echo "JAVA_HOME ist nicht gesetzt und $PREFIX/lib/jvm/java-17-openjdk fehlt." >&2
    echo "ls \"$PREFIX/lib/jvm\" und JAVA_HOME auf den Java-17-Ordner setzen." >&2
    exit 1
  fi
fi

AAPT2="${AAPT2:-$PREFIX/bin/aapt2}"
if [[ ! -x "$AAPT2" ]]; then
  echo "Kein ausführbares aapt2 unter $AAPT2." >&2
  echo "pkg install -y aapt2   oder ein arm64-Binary dorthin legen. Siehe docs/android-termux.md." >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" || ! -d "$ANDROID_HOME" ]]; then
  echo "ANDROID_HOME fehlt oder ist kein Ordner." >&2
  echo "SDK mit sdkmanager installieren, dann export ANDROID_HOME=\"\$HOME/android-sdk\"." >&2
  exit 1
fi

echo "Website bauen …"
cd "$ROOT"
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build

echo "Capacitor vorbereiten …"
cd "$WRAPPER"
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run prepare
if [[ ! -d android ]]; then
  npx cap add android
fi
npx cap sync

LOCAL="$ANDROID/local.properties"
if [[ ! -f "$LOCAL" ]] || ! grep -q '^sdk.dir=' "$LOCAL"; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" >> "$LOCAL"
fi

PROPS="$ANDROID/gradle.properties"
touch "$PROPS"
if ! grep -q '^android.aapt2FromMavenOverride=' "$PROPS"; then
  printf '\nandroid.aapt2FromMavenOverride=%s\n' "$AAPT2" >> "$PROPS"
fi
if ! grep -q '^org.gradle.jvmargs=' "$PROPS"; then
  printf 'org.gradle.jvmargs=-Xmx1024m -Dfile.encoding=UTF-8\norg.gradle.parallel=false\norg.gradle.workers.max=1\n' >> "$PROPS"
fi

echo "Gradle assembleDebug …"
cd "$ANDROID"
if [[ "${TERMUX_CLEAR_LD:-}" == "1" ]]; then
  echo "LD_PRELOAD und LD_LIBRARY_PATH werden geleert (glibc-aapt2)."
  env -u LD_PRELOAD -u LD_LIBRARY_PATH ./gradlew assembleDebug
else
  ./gradlew assembleDebug
fi

APK="$ANDROID/app/build/outputs/apk/debug/app-debug.apk"
echo "Fertig: $APK"
if command -v termux-open >/dev/null 2>&1; then
  echo "Installieren mit: termux-open --view \"$APK\""
fi
