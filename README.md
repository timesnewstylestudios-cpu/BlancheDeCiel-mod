# BlancheDeCiel-mod

Blockeditor für eigene Programme. Die Oberfläche spricht Deutsch und Englisch und läuft als statische Website ohne Server, auch als PWA. Dieselbe Ausgabe lässt sich auf GitHub Pages legen oder mit Capacitor als Android-App bauen.

BlancheDeCiel ist an Scratch und [PenguinMod](https://github.com/PenguinMod) angelehnt: gleiche Grundfarben, gleiche Blocktypen (Hut, Befehl, C-Block, Reporter, Boolean) und eine Teilmenge der Projektdateien `.sb3` und `.pmp`. Der Webpack-Baukasten von PenguinMod-Gui und PenguinMod-Vm bleibt draußen. Er braucht Node.js 16 und Webpack 4 und baut auf aktuellen Node-Versionen nicht verlässlich. Diese Fassung ist der lauffähige Editor. Herkunft und Lizenzen stehen in `NOTICE` und `vendor/UPSTREAM.md`.

Lizenz: GNU GPL 3.0 oder jede spätere Version. Siehe `LICENSE`.

## Was du damit machen kannst

- Blöcke antippen oder aus der Palette ziehen, Skripte starten, Figuren auf der Bühne schieben.
- **KI:** Zuerst „Mit X anmelden“ über einen eigenen Server ([docs/x-login.md](docs/x-login.md), [docs/CloudflareTutorial.md](docs/CloudflareTutorial.md)) oder das lokale Netz ohne Schlüssel. Das lokale Netz schlägt BDL vor. „Übernehmen“ setzt es ein und lernt daraus. Ein eigener xAI-Schlüssel liegt unter Erweitert und gilt nur für den Tab, bis du „merken“ ankreuzt. Die Cloud-Anfrage schickt eine kurze BDL-Zusammenfassung, nicht das ganze Projekt-JSON.
- **Blöcke:** Klone (`clone`, `when clone`, `deleteclone`), eigene Blöcke mit Parametern und `warp` (ohne Bildschirmaktualisierung), Kostüme aus einer kleinen Bibliothek oder der Zeichenfläche, Töne als WAV, Rucksack in `localStorage`.
- **Import:** `.sb3`, `.pmp`, ZIP, eingebettetes Projekt in HTML, `.bdc.json` und JavaScript. Neben den Grundblöcken kommen Klone, Warten-bis, Stopp, Gleiten, Rand, Kostümwechsel, Ghost, eigene Blöcke mit Parametern und `warp` an. JavaScript versteht zusätzlich Parameter, `else if`, Arrays, einfache Objekte, `for…of` und Indexzugriff. Es wird nicht ausgeführt. Nur für eigenen Code oder Code, dessen Lizenz das erlaubt.
- **Netz:** Tabellen und Aufträge zwischen Gegenstellen, Kademlia-artig über die bestehenden Verbindungen. Tabs desselben Browsers finden sich von selbst. Andere Geräte: Angebot und Antwort wie bisher, oder ein Raumname als QR-Code. Optional eine Signal-URL (WebTorrent-Tracker, zum Beispiel `wss://tracker.openwebtorrent.com`). Leer lassen heißt: kein Server.
- **Audio:** Tonhöhe, Wellenform, Filter, Hüllkurve, FFT, Aufnahme, Bibliothekston und Dateien, die `decodeAudioData` versteht.
- **Grafik:** Stift, Formen, Schichten, Shader `none`, `invert`, `pixel`, `vignette`, `wave`, `gray`, `sepia`, `edge` (WebGL, sonst 2D), Quader, Kugeln und ein Bodenraster.
- **Erweiterungen:** Eine Teilmenge des unsandboxed PenguinMod-Formats (`Scratch.extensions.register`, `getInfo`, Befehle und Reporter). Geladener Code läuft mit den Rechten der Seite. Die Beispiel-Erweiterung „Echo“ liegt unter „Meine Blöcke“.

Die Bühnenmitte ist der Ursprung, x zeigt nach rechts, y nach oben. Richtung 0 ist oben, 90 ist rechts.

## BDL

Die Beschreibungssprache steht in [docs/bdl.md](docs/bdl.md). Alle Funktionen, einschließlich Zoom, Flächen und Darstellung, stehen in [docs/funktionen.md](docs/funktionen.md) und in der Hilfe der App. Kurz:

```bdl
sprite Figur
clear-scripts
script 48 48
  when flag
  repeat 4
    move 80
    turn 90
  end
  say "Quadrat" 2
end
```

Ausdrücke stehen in Klammern: `set punkte (add $punkte 1)`. `end` schließt Skripte und C-Blöcke. `clear-scripts`, `tables-reset` und `clear3d` ersetzen vorhandenen Zustand.

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm ci
npm test
npm run dev
```

Der Dev-Server hört auf Port 5173. Produktionsbuild:

```bash
npm run build
npm run preview
```

Das Ergebnis liegt in `dist/`. Alle URLs sind relativ, damit dieselbe Ausgabe auf GitHub Pages, einem Unterordner oder als gebündelte Website funktioniert.

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` testet, baut und veröffentlicht den `main`-Branch. Die Veröffentlichung schlägt fehl, bis im Repository unter Settings → Pages die Quelle auf „GitHub Actions“ steht. Danach liegt die Seite unter

`https://timesnewstylestudios-cpu.github.io/BlancheDeCiel-mod/`

Pull Requests bauen und testen nur, sie veröffentlichen nicht.

## Android bauen (Build for Android)

Die Android-App ist die Capacitor-Hülle in `android-wrapper/`. Sie packt `dist/` und spricht Bluetooth über eine native Brücke. Die Website selbst bleibt ohne diese Hülle lauffähig.

Zwei Wege, Schritt für Schritt:

- [Android Studio auf dem Rechner](docs/android-studio.md): Node-LTS, JDK 17, Android SDK, Debug-APK, signierte Release-APK und AAB, Installation, Bluetooth-Rechte.
- [Termux auf dem Telefon](docs/android-termux.md): Pakete, SDK, arm64-`aapt2`, `./gradlew assembleDebug`, bekannte Abbrüche. Das Skript `scripts/build-android-termux.sh` führt den Bau aus, nachdem SDK und `aapt2` stehen.

Kurzfassung für einen Rechner, der die Voraussetzungen aus der Studio-Anleitung schon erfüllt:

```bash
npm ci
npm run build
cd android-wrapper
npm install
npm run prepare
npx cap add android
npx cap sync
npx cap open android
```

`npx cap add android` nur beim ersten Mal.

## Bluetooth: welcher Weg wo

| Weg | Eingebettetes WebView | Chrome (Android/Desktop) | Android-App aus `android-wrapper/` |
| --- | --- | --- | --- |
| Web Bluetooth | oft nein | ja, nach Nutzerauswahl | nur wenn das WebView es lässt |
| Web Serial / Web USB | nein | Desktop-Chrome, teils Android-Chrome | nein |
| `window.BlancheBridge` oder `window.Android` | nur wenn die Hülle die Brücke setzt | nein | ja |
| Capacitor + BLE | nein | nein | ja |
| „In Chrome öffnen“ | öffnet Chrome | bleibt in Chrome | öffnet Chrome |

## Bekannte Grenzen

Farbberührung tastet Bühnenpixel um die Figur ab, nicht jede Kostümkante. Senden-und-warten wartet, bis die gestarteten Empfängerskripte stehen. Weiterhin Kommentar-Blöcke für unbekannte Opcodes. HTML-Import sucht ein ZIP (`UEsDB…`) oder `targets`. Der Tracker ist aus, bis eine URL eingetragen ist. Die X-Anmeldung tut nichts, bis Proxy und Client-ID stehen. Aufnahme, Mikrofon und WebRTC hängen am Gerät.

## English

BlancheDeCiel-mod is a static, offline-friendly block editor with German and English UI. It follows Scratch and PenguinMod block colours, block types, and a subset of `.sb3` / `.pmp` files. The PenguinMod GUI and VM webpack apps are not what this repository builds: they target Node 16 and webpack 4. See `NOTICE` and `vendor/UPSTREAM.md`.

The license is GPL-3.0-or-later.

Run `npm ci`, `npm test`, `npm run dev`. `npm run build` writes `dist/`. GitHub Actions deploys `main` to GitHub Pages only after the repository Pages source is set to GitHub Actions; until then that deploy job fails. Android builds are documented in `docs/android-studio.md` and `docs/android-termux.md`.

The AI panel prefers Log in with X through a server you deploy (`docs/x-login.md`, `docs/CloudflareTutorial.md`) or a local net that needs no key. Your own xAI key stays under Advanced, for the tab unless you tick remember. An X token is not an xAI key. The cloud model sees a compact BDL summary (`docs/bdl.md`). Short examples, the sandbox, weight packages and later ideas are in `docs/`. Peers can meet through the optional coordinator or a tracker. Bluetooth tries a native bridge, Capacitor BLE, Web Bluetooth, Web Serial and Web USB.

Still absent: a pixel-perfect costume collision, and a guaranteed public tracker. Unknown imported opcodes become comments.
