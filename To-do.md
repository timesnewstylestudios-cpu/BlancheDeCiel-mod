# Nächste Aufgaben

Jede Zeile sagt, was der Punkt tut und was er danach ermöglicht.

- [x] Pixelgenaue Kostümkollision für Farbberührung. Die Figur prüft ihre gezeichneten Pixel, nicht nur einen Punkt. Damit erkennen Programme Berührung von Farbe, Farbe-an-Farbe und einer anderen Figur.
- [x] WebGPU für Faltung. conv1d, conv2d und conv3d laufen als Shader, sonst auf der CPU. Damit kann ein Netz lokale Muster rechnen, nicht nur eine dichte Schicht.
- [x] Gestapeltes LSTM und Attention mit mehreren Köpfen. `nnlayer … stack` und `heads` setzen mehrere Zellen oder Köpfe. Damit merkt sich ein Netz längere Folgen und mehrere Bezüge gleichzeitig.
- [ ] Großes vortrainiertes Sprachmodell im Browser. Ein fertiges Modell statt des kleinen Block-Netzes. Damit werden freie Sätze zu Blöcken, ohne einen Server.
- [x] TURN-Server mitliefern, statt nur Zugangsdaten. `turn/` startet coturn, der Worker gibt kurzlebige ICE-Daten aus. Damit finden sich Telefone hinter strengen Netzen, sobald ein Rechner UDP 3478 öffnet.
- [x] Globales Kontingent ohne extra KV-Binding. Ein Durable Object namens `quota` zählt für alle Isolate. Damit bleibt das Limit ehrlich, ohne ein zweites Speicher-Binding.

# Danach möglich

- [x] WebGPU-Pooling. `nnlayer … pool` nimmt das Maximum von Nachbarwerten. Damit werden Faltungsnetze kleiner und robuster gegen kleine Verschiebungen. Die Rechnung ist auf der CPU geprüft; der WebGPU-Pfad der Faltung bleibt der beschleunigte Nachbar.
- [x] WebGPU-Normalisierung. `nnlayer … norm` zieht den Mittelwert ab und teilt durch die Streuung. Damit bleibt das Lernen stabil, wenn viele Schichten hintereinander liegen.
- [ ] Training auf der GPU. Die Gewichte auf der Grafikkarte nachziehen, nicht nur vorwärts rechnen. Damit werden größere Netze im Unterricht in zumutbarer Zeit fertig. Der Rückwärtslauf bleibt auf der CPU.
- [ ] Kollision auf der GPU. Die Pixelmasken im Shader vergleichen. Damit bleiben viele Figuren gleichzeitig flüssig prüfbar. Die geprüfte Kollision rechnet noch auf der CPU.
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
