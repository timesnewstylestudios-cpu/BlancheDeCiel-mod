# BlancheDeCiel-mod

Blockeditor für eigene Programme. Die Oberfläche spricht Deutsch und Englisch, läuft als statische Website ohne Server und lässt sich auf GitHub Pages legen oder mit AppGeyser in eine Android-App packen.

BlancheDeCiel ist an Scratch und [PenguinMod](https://github.com/PenguinMod) angelehnt: gleiche Grundfarben, gleiche Blocktypen (Hut, Befehl, C-Block, Reporter, Boolean) und eine Teilmenge der Projektdateien `.sb3` und `.pmp`. Der Webpack-Baukasten von PenguinMod-Gui und PenguinMod-Vm bleibt draußen. Er braucht Node.js 16 und Webpack 4 und baut auf aktuellen Node-Versionen nicht verlässlich. Diese Fassung ist der lauffähige Editor. Herkunft und Lizenzen stehen in `NOTICE` und `vendor/UPSTREAM.md`.

Lizenz: GNU GPL 3.0 oder jede spätere Version. Siehe `LICENSE`.

## Was du damit machen kannst

- Blöcke antippen oder aus der Palette ziehen, Skripte starten, Figuren auf der Bühne schieben.
- **KI:** In der Leiste „KI“ einen Satz schreiben. Mit eigenem Schlüssel von [xAI](https://console.x.ai) geht die Anfrage an `https://api.x.ai/v1/chat/completions` (OpenAI-kompatibel, Modell standardmäßig `grok-4.7`). Der Schlüssel liegt nur in `localStorage` dieses Browsers. Die Anfrage schickt eine kurze BDL-Zusammenfassung und die Opcode-Liste, nicht das ganze Projekt-JSON. Die Antwort ist BDL und wird zu Blöcken. Ohne Schlüssel kannst du BDL von Hand einfügen und auf „BDL anwenden“ drücken. Blöcke, die im Skript die KI rufen, sind aus, bis du sie in den Einstellungen einschaltest.
- **Blöcke:** Klone (`clone`, `when clone`, `deleteclone`), eigene Blöcke mit Parametern und `warp` (ohne Bildschirmaktualisierung), Kostüme aus einer kleinen Bibliothek oder der Zeichenfläche, Töne als WAV, Rucksack in `localStorage`.
- **Import:** `.sb3`, `.pmp`, ZIP, eingebettetes Projekt in HTML, `.bdc.json` und JavaScript. Neben den Grundblöcken kommen Klone, Warten-bis, Stopp, Gleiten, Rand, Kostümwechsel, Ghost, eigene Blöcke mit Parametern und `warp` an. JavaScript versteht zusätzlich Parameter, `else if`, Arrays, einfache Objekte, `for…of` und Indexzugriff. Es wird nicht ausgeführt. Nur für eigenen Code oder Code, dessen Lizenz das erlaubt.
- **Netz:** Tabellen und Aufträge zwischen Gegenstellen, Kademlia-artig über die bestehenden Verbindungen. Tabs desselben Browsers finden sich von selbst. Andere Geräte: Angebot und Antwort wie bisher, oder ein Raumname als QR-Code. Optional eine Signal-URL (WebTorrent-Tracker, zum Beispiel `wss://tracker.openwebtorrent.com`). Leer lassen heißt: kein Server.
- **Audio:** Tonhöhe, Wellenform, Filter, Hüllkurve, FFT, Aufnahme, Bibliothekston und Dateien, die `decodeAudioData` versteht.
- **Grafik:** Stift, Formen, Schichten, Shader `none`, `invert`, `pixel`, `vignette`, `wave`, `gray`, `sepia`, `edge` (WebGL, sonst 2D), Quader, Kugeln und ein Bodenraster.
- **Erweiterungen:** Eine Teilmenge des unsandboxed PenguinMod-Formats (`Scratch.extensions.register`, `getInfo`, Befehle und Reporter). Geladener Code läuft mit den Rechten der Seite. Die Beispiel-Erweiterung „Echo“ liegt unter „Meine Blöcke“.

Die Bühnenmitte ist der Ursprung, x zeigt nach rechts, y nach oben. Richtung 0 ist oben, 90 ist rechts.

## BDL

Die Beschreibungssprache steht vollständig in [docs/bdl.md](docs/bdl.md). Kurz:

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

Der Workflow `.github/workflows/pages.yml` testet, baut und veröffentlicht den `main`-Branch. Einmalig im Repository unter Settings → Pages die Quelle „GitHub Actions“ wählen. Die Seite liegt danach unter

`https://timesnewstylestudios-cpu.github.io/BlancheDeCiel-mod/`

Pull Requests bauen und testen nur, sie veröffentlichen nicht.

## AppGeyser

Die App ist eine Website. AppGeyser packt sie in ein Android-WebView. Ein eigener Server ist zur Laufzeit nicht nötig.

1. Diesen Workflow auf `main` laufen lassen und die Pages-URL abwarten.
2. In AppGeyser eine App anlegen und als Inhalt die Website-URL eintragen, zum Beispiel `https://timesnewstylestudios-cpu.github.io/BlancheDeCiel-mod/`.
3. JavaScript erlauben. Netzwerk braucht die KI und WebRTC zwischen Geräten. Das Mikrofon nur, wenn du aufnehmen willst.
4. Alternativ das Build-Artefakt `dist` als ZIP der statischen Dateien hochladen, falls dein AppGeyser-Tarif HTML-Dateien annimmt. Die relativen Pfade bleiben gültig.

Grenzen des WebView, die du einplanen solltest:

- Web Bluetooth fehlt in AppGeyser. Der Knopf probiert der Reihe nach eine native Brücke, Capacitor-BLE, Web Bluetooth, Web Serial und Web USB. Was fehlt, wird genannt, die App läuft weiter. „In Chrome öffnen“ startet dieselbe URL in Chrome, wo Web Bluetooth existiert.
- Ein Service Worker speichert die Seite nach dem ersten Besuch im Browser. Manche WebViews ignorieren ihn. Dann ist die App nur online da.
- WebRTC kann am WebView scheitern. Dieselbe Logik läuft zwischen zwei Tabs auch ohne WebRTC. Der optionale Tracker braucht Netz.
- Der API-Schlüssel liegt im Speicher des WebView. Wer die App auf dem Gerät untersucht, kann ihn lesen. Trag keinen Schlüssel ein, den andere ausgeben dürfen.

## Bluetooth: welcher Weg wo

| Weg | AppGeyser-WebView | Chrome (Android/Desktop) | Eigene Android-Hülle |
| --- | --- | --- | --- |
| Web Bluetooth | nein | ja, nach Nutzerauswahl | nur wenn das WebView es lässt |
| Web Serial / Web USB | nein | Desktop-Chrome, teils Android | nein |
| `window.BlancheBridge` oder `window.Android` | nein, solange die Hülle nichts einspeist | nein | ja, wenn die Hülle die Brücke setzt |
| Capacitor + BLE | nein | nein | ja, siehe `android-wrapper/` |
| Intent „In Chrome öffnen“ | öffnet Chrome | bleibt in Chrome | öffnet Chrome |

Die statische Website bleibt die App für AppGeyser. Bluetooth-fähig wird sie mit der optionalen Hülle:

```bash
cd android-wrapper
npm install
npm run prepare
npx cap add android
npx cap sync
npx cap open android
```

Dafür brauchst du Android Studio und ein Gerät. `npm run prepare` kopiert `../dist` nach `www` und hängt die Brücke an, die `@capacitor-community/bluetooth-le` als `window.BlancheBridge` anbietet. Die Website erkennt die Brücke von selbst. Ohne diese Hülle bleibt der Bluetooth-Knopf bei „nicht verfügbar“ und der Rest des Editors arbeitet normal.

## Bekannte Grenzen

Weiterhin nicht eingebaut: der volle Scratch-Befehlssatz (Berühren einer Farbe, Klon-Ursprung als eigene Variable, Nachrichten mit Wartezeit nur als Senden), ein Malprogramm mit Ebenen, und ein garantiert erreichbarer öffentlicher Tracker. Unbekannte Opcodes werden Kommentare. HTML-Import sucht ein ZIP (`UEsDB…`) oder `targets`. Verteilte Aufträge rechnen lokal sofort; Gegenstellen bekommen dieselben Zeilen. Der Tracker ist absichtlich aus, bis eine URL eingetragen ist. Aufnahme, Mikrofon und WebRTC hängen am Gerät.

## English

BlancheDeCiel-mod is a static, offline-friendly block editor with German and English UI. It follows Scratch and PenguinMod block colours, block types, and a subset of `.sb3` / `.pmp` files. The PenguinMod GUI and VM webpack apps are not what this repository builds: they target Node 16 and webpack 4. See `NOTICE` and `vendor/UPSTREAM.md`.

The license is GPL-3.0-or-later.

Run `npm ci`, `npm test`, `npm run dev`. `npm run build` writes `dist/`. GitHub Actions deploys `main` to GitHub Pages after you set Pages to GitHub Actions. Point AppGeyser at that URL, or upload the `dist` files if your plan accepts a static bundle. Web Bluetooth is optional and absent in the AppGeyser WebView.

The AI panel calls `https://api.x.ai/v1/chat/completions` with your own key, stored only in `localStorage`. The model sees a compact BDL summary, documented in `docs/bdl.md`. Clones, procedures with parameters and warp, a small costume and sound library, a drawing costume editor, and a localStorage backpack are in the editor. Import covers more Scratch opcodes, including procedures and clones, and more JavaScript syntax. Peers can join a room by QR code when an optional WebTorrent tracker URL is set. Bluetooth tries a native bridge, Capacitor BLE, Web Bluetooth, Web Serial and Web USB, and can hand the page to Chrome. The Android build is `android-wrapper/`; the AppGeyser path stays the static site.

Still absent: the full Scratch opcode set, a guaranteed public tracker, and phone-to-phone Bluetooth inside the AppGeyser WebView.
