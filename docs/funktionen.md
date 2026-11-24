# Funktionen

BlancheDeCiel ist ein statischer Blockeditor. Dieselbe Beschreibung steht in der Hilfe der App.

- Menü: Datei, Bearbeiten, Ansicht, Erweiterungen, Hilfe. Ansicht wählt Layout und Blockform. Netz, Rechner und KI liegen unter Erweiterungen.
- Blöcke aus der Palette in die Skriptfläche ziehen. Sie rasten untereinander und in C-Blöcke ein. Zurück auf die Palette löscht den Stapel. Die Fläche hat beide Bildlaufleisten. Aufräumen legt die Skripte untereinander. scratch-blocks bleibt draußen: es braucht den alten Closure-Bau und würde diese Laufzeit ersetzen.
- Klone, eigene Blöcke mit Parametern und `warp`, Kostüme, Töne, Rucksack.
- Import von `.sb3`, `.pmp`, HTML mit Projekt und einer JavaScript-Teilmenge. JavaScript wird nicht ausgeführt.
- KI: nur das lokale Netz im Browser, ohne Schlüssel. „Übernehmen“ lernt aus dem Vorschlag. Der optionale Server ist der Treffpunkt, siehe `docs/CloudflareTutorial.md`.
- Netz mit Tabs, Angebot/Antwort, QR-Raum und optionalem Tracker.
- Audio, Grafik, Shader, 3D-Quader und Kugeln.
- Bühne klein, normal oder Vollbild. Codefläche mit +/−, Strg+Mausrad und Zwei-Finger-Zoom.
- Trennlinien zwischen Palette, Skripten und Bühne lassen sich ziehen. Die Breiten bleiben gespeichert.
- Darstellungen: Hell, Dunkel, Kontrast, Meer, Dämmerung. Einstellung unter Einstellungen.
- Bluetooth über Brücke, Capacitor, Web Bluetooth, Web Serial oder Web USB. Android-Bau: `docs/android-studio.md` und `docs/android-termux.md`.

Die Blocksprache BDL steht in `docs/bdl.md`. Kurze Beispiele: `docs/beispiele.md`. Turing-Vollständigkeit: `docs/turing.md`. Gewichte: `docs/gewichte.md`. Sandbox: `docs/sandbox.md`. Was noch fehlt: `docs/vorschlaege.md`. Unbekannte Opcodes aus einer SB3-Datei werden Kommentare. Farbberührung prüft die Bühnenpixel um die Figur, nicht jede Kostümkante.
