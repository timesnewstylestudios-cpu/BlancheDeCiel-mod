# Nächste Aufgaben

Jede Zeile sagt, was der Punkt tut und was er danach ermöglicht.

- [x] Pixelgenaue Kostümkollision für Farbberührung. Die Figur prüft ihre gezeichneten Pixel, nicht nur einen Punkt. Damit erkennen Programme Berührung von Farbe, Farbe-an-Farbe und einer anderen Figur.
- [x] WebGPU für Faltung. conv1d, conv2d und conv3d laufen als Shader, sonst auf der CPU. Damit kann ein Netz lokale Muster rechnen, nicht nur eine dichte Schicht.
- [ ] Gestapeltes LSTM und Attention mit mehreren Köpfen. Mehrere Zellen und Köpfe hintereinander. Damit merkt sich ein Netz längere Folgen und mehrere Bezüge gleichzeitig.
- [ ] Großes vortrainiertes Sprachmodell im Browser. Ein fertiges Modell statt des kleinen Block-Netzes. Damit werden freie Sätze zu Blöcken, ohne einen Server.
- [ ] TURN-Server mitliefern, statt nur Zugangsdaten. Ein eingebauter Vermittler für WebRTC. Damit finden sich Telefone hinter strengen Netzen ohne eigene Einrichtung.
- [ ] Globales Kontingent ohne extra KV-Binding. Ein Zähler, der ohne Extra-Speicher über alle Server-Kopien gilt. Damit bleibt das Limit auch ohne Cloudflare-KV ehrlich.

# Danach möglich

- [ ] WebGPU-Pooling. Nachbarschaft eines Feldes zu einem Wert zusammenfassen. Damit werden Faltungsnetze kleiner und robuster gegen kleine Verschiebungen.
- [ ] WebGPU-Normalisierung. Eine Schicht auf einen festen Wertebereich bringen. Damit bleibt das Lernen stabil, wenn viele Schichten hintereinander liegen.
- [ ] Training auf der GPU. Die Gewichte auf der Grafikkarte nachziehen, nicht nur vorwärts rechnen. Damit werden größere Netze im Unterricht in zumutbarer Zeit fertig.
- [ ] Kollision auf der GPU. Die Pixelmasken im Shader vergleichen. Damit bleiben viele Figuren gleichzeitig flüssig prüfbar.
- [ ] Blockly als Zeichenfläche. Die originale Scratch-Blockbibliothek einsetzen. Damit wären Einrastpunkte und Barrierefreiheit identisch mit Scratch, der jetzige Laufzeitkern müsste aber weichen. scratch-blocks braucht den alten Closure-Bau und passt nicht in diesen Vite-Build.

# Markdown-Dateien

- `README.md` — Überblick, Start und Android-Hinweis.
- `To-do.md` — Nächste Aufgaben und diese Liste.
- `android-wrapper/README.md` — Capacitor-Hülle und Bluetooth-Brücke.
- `docs/android-studio.md` — APK mit Android Studio.
- `docs/android-termux.md` — APK in Termux.
- `docs/bdl.md` — Grammatik der Blocksprache.
- `docs/beispiele.md` — Kurze BDL-Beispiele.
- `docs/CloudflareTutorial.md` — Treffpunkt auf dem kostenlosen Plan.
- `docs/funktionen.md` — Funktionsüberblick, auch in der Hilfe.
- `docs/gewichte.md` — Kompakte Gewichtspakete.
- `docs/sandbox.md` — Virtueller Rechner und seine Grenzen.
- `docs/turing.md` — Schleifen, Rückgaben und ein Band-Interpreter.
- `docs/vorschlaege.md` — Was noch nicht drin ist.
- `docs/x-login.md` — Hinweis, dass es keine Anmeldung mehr gibt.
- `vendor/UPSTREAM.md` — Herkunft der PenguinMod-Farben.
