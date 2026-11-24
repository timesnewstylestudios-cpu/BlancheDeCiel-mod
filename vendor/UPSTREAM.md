# Upstream-Quellen / Upstream sources

BlancheDeCiel-mod spricht eine Teilmenge der Scratch-3- und PenguinMod-Projektdateien
und lädt Erweiterungen im unsandboxed PenguinMod-Stil (`Scratch.extensions.register`).
Die lauffähige Anwendung ist dieser statische Editor. Der Webpack-Baukasten von
PenguinMod-Gui und PenguinMod-Vm wird hier nicht mitgebaut: er ist auf Node.js 16
und Webpack 4 ausgerichtet (siehe die Workflow-Datei von `penguinmod.github.io`)
und lässt sich auf aktuellen Node-Versionen nicht verlässlich reproduzieren.
Für GitHub Pages und die Capacitor-Hülle zählt ein kleiner statischer Build.

Geprüft am 2026-11-23:

| Projekt | URL | Revision |
| --- | --- | --- |
| PenguinMod-Gui (`penguinmod.github.io`) | https://github.com/PenguinMod/penguinmod.github.io | `develop` @ `230827c6c8a698d0dbc2f624199d7373668817a8` |
| PenguinMod-Blocks | https://github.com/PenguinMod/PenguinMod-Blocks | `develop` @ `de35ce5758aeda5aab0a9ad59736e1920205804b` |
| PenguinMod-Vm | https://github.com/PenguinMod/PenguinMod-Vm | Standardbranch, `package.json` gelesen; Lizenzdatei MPL-2.0 |

Wörtlich übernommen ist nur die Farbpalette:

`vendor/penguinmod-blocks/core/colours.js` (Apache-2.0, Copyright 2016 MIT).

Neue Kategorien (Audio, Grafik, Netz, KI, Analyse) nutzen eigene Farben aus
`src/palette.js` und dieselben Blocktypen (Hut, Befehl, C-Block, Reporter, Boolean).

PenguinMod-Erweiterungsform, die dieser Editor versteht (Teilmenge):

- `getInfo()` mit `id`, `name`, `color1`, `blocks`
- `blockType`: `command`, `reporter`, `Boolean`, `hat`, `loop`, `conditional`
  (oder die Felder `Scratch.BlockType.*`)
- Argumente `number`, `string`, `Boolean`, `color`, `angle`
- Text mit Platzhaltern `[NAME]`
- Aufruf `methode(args, util)` wobei `util.target` die Figur ist

Nicht nachgebaut: der JIT-Compiler der PenguinMod-Vm, die Scratch-Renderer-Pipeline,
Rucksack, TurboWarp-Packager-Sonderfälle, die über eingebettetes ZIP/`project.json`
hinausgehen. Bluetooth in der Website ist optional; die Android-Hülle spricht BLE über eine native Brücke.
