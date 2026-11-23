# BlancheDeCiel-mod

Blockeditor für eigene Programme. Die Oberfläche spricht Deutsch und Englisch, läuft als statische Website ohne Server und lässt sich auf GitHub Pages legen oder mit AppGeyser in eine Android-App packen.

BlancheDeCiel ist an Scratch und [PenguinMod](https://github.com/PenguinMod) angelehnt: gleiche Grundfarben, gleiche Blocktypen (Hut, Befehl, C-Block, Reporter, Boolean) und eine Teilmenge der Projektdateien `.sb3` und `.pmp`. Der Webpack-Baukasten von PenguinMod-Gui und PenguinMod-Vm bleibt draußen. Er braucht Node.js 16 und Webpack 4 und baut auf aktuellen Node-Versionen nicht verlässlich. Diese Fassung ist der lauffähige Editor. Herkunft und Lizenzen stehen in `NOTICE` und `vendor/UPSTREAM.md`.

Lizenz: GNU GPL 3.0 oder jede spätere Version. Siehe `LICENSE`.

## Was du damit machen kannst

- Blöcke antippen oder aus der Palette ziehen, Skripte starten, Figuren auf der Bühne schieben.
- **KI:** In der Leiste „KI“ einen Satz schreiben. Mit eigenem Schlüssel von [xAI](https://console.x.ai) geht die Anfrage an `https://api.x.ai/v1/chat/completions` (OpenAI-kompatibel, Modell standardmäßig `grok-4.7`). Der Schlüssel liegt nur in `localStorage` dieses Browsers. Die Anfrage schickt eine kurze BDL-Zusammenfassung und die Opcode-Liste, nicht das ganze Projekt-JSON. Die Antwort ist BDL und wird zu Blöcken. Ohne Schlüssel kannst du BDL von Hand einfügen und auf „BDL anwenden“ drücken. Blöcke, die im Skript die KI rufen, sind aus, bis du sie in den Einstellungen einschaltest.
- **Import:** `.sb3`, `.pmp`, ZIP, eingebettetes Projekt in HTML (PenguinMod- oder TurboWarp-Paket, wenn ein ZIP oder `project.json` darin steckt), `.bdc.json` und eine Teilmenge von JavaScript. JavaScript wird nicht ausgeführt. Es entsteht Pseudocode und, wo die Struktur erkennbar ist, Blöcke. Nur für eigenen Code oder Code, dessen Lizenz das erlaubt. Derselbe Hinweis steht im Import-Fenster.
- **Netz:** Tabellen und Aufträge (`sum`, `min`, `max`, `count`) zwischen Gegenstellen. Tabs desselben Browsers verbinden sich über `BroadcastChannel`. Andere Geräte verbinden sich per WebRTC, indem eine Seite ein Angebot erzeugt und die andere die Antwort zurückschickt. Darüber liegt eine kleine Kademlia-artige Weiterleitung (k-Buckets, XOR-Abstand, STORE/FIND). Bluetooth ist ein optionaler Block und Knopf; im Android-WebView von AppGeyser gibt es kein Web Bluetooth, der Block meldet dann „nicht verfügbar“.
- **Audio:** Tonhöhe, Wellenform, Filter, Hüllkurve, FFT, Aufnahme und Wiedergabe über die Web Audio API, soweit der WebView das Mikrofon erlaubt. Dateien, die `decodeAudioData` versteht (je nach Gerät wav, mp3, ogg, webm).
- **Grafik:** Stift, Rechteck, Oval, Linie, Schichten, Shader-Voreinstellungen (WebGL, sonst dieselbe Wirkung auf der 2D-Leinwand), einfache 3D-Quader.
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

- Web Bluetooth fehlt. Der Bluetooth-Block und der Knopf sagen das und brechen nicht ab.
- Ein Service Worker speichert die Seite nach dem ersten Besuch im Browser. Manche WebViews ignorieren ihn. Dann ist die App nur online da.
- WebRTC kann am WebView scheitern. Dieselbe Logik läuft zwischen zwei Tabs auch ohne WebRTC.
- Der API-Schlüssel liegt im Speicher des WebView. Wer die App auf dem Gerät untersucht, kann ihn lesen. Trag keinen Schlüssel ein, den andere ausgeben dürfen.

## Bekannte Grenzen

Diese erste Fassung ist ein benutzbarer Editor, nicht die ganze PenguinMod-VM.

- Kein Klonen, keine Prozedur-Parameter, kein Rucksack, keine Kostümbibliothek.
- Von Scratch werden die üblichen Bewegungs-, Aussehens-, Ereignis-, Steuerungs-, Fühl-, Operator-, Variablen-, Listen- und Stift-Blöcke importiert und ausgeführt. Unbekannte Opcodes werden zu Kommentar-Blöcken.
- JavaScript-Import erkennt Funktionen, `if`, einfache `for`-Zählschleifen, `while`, Zuweisungen und `console.log`. Anderes bleibt Zeilentext.
- HTML-Import sucht ein eingebettetes ZIP (`UEsDB…`) oder ein JSON mit `targets`.
- 3D zeichnet farbige Quader. Shader sind die Voreinstellungen `none`, `invert`, `pixel`, `vignette`, `wave`.
- Verteilte Aufträge rechnen lokal sofort richtig. Verbundene Gegenstellen bekommen dieselben Zeilen und rechnen mit. Es gibt keinen öffentlichen Bootstrap-Server; ohne kopiertes Angebot finden sich nur Tabs desselben Browsers.
- Aufnahme, Mikrofon und WebRTC hängen am Gerät.

## English

BlancheDeCiel-mod is a static, offline-friendly block editor with German and English UI. It follows Scratch and PenguinMod block colours, block types, and a subset of `.sb3` / `.pmp` files. The PenguinMod GUI and VM webpack apps are not what this repository builds: they target Node 16 and webpack 4. See `NOTICE` and `vendor/UPSTREAM.md`.

The license is GPL-3.0-or-later.

Run `npm ci`, `npm test`, `npm run dev`. `npm run build` writes `dist/`. GitHub Actions deploys `main` to GitHub Pages after you set Pages to GitHub Actions. Point AppGeyser at that URL, or upload the `dist` files if your plan accepts a static bundle. Web Bluetooth is optional and absent in the AppGeyser WebView.

The AI panel calls `https://api.x.ai/v1/chat/completions` with your own key, stored only in `localStorage`. The model sees a compact BDL summary, documented in `docs/bdl.md`, and returns BDL that the editor turns into blocks. Import reads your own projects or other code you are allowed to translate; it does not execute imported JavaScript. Grid sharing uses a Kademlia-style relay over BroadcastChannel and manual WebRTC. Audio and graphics blocks use Web Audio and canvas/WebGL.

Not in this pass: clones, procedure parameters, the full Scratch opcode set, a public DHT bootstrap, phone-to-phone Bluetooth, and arbitrary shaders or meshes.
