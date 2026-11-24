# Funktionen

BlancheDeCiel ist ein statischer Blockeditor. Dieselbe Beschreibung steht in der Hilfe der App.

- Blöcke antippen oder ziehen. Kategorien und Farben folgen der PenguinMod-Palette.
- Klone, eigene Blöcke mit Parametern und `warp`, Kostüme, Töne, Rucksack.
- Import von `.sb3`, `.pmp`, HTML mit Projekt und einer JavaScript-Teilmenge. JavaScript wird nicht ausgeführt.
- KI über einen eigenen xAI-Schlüssel oder, wenn eingerichtet, Anmeldung mit X über einen Proxy. Siehe `docs/x-login.md`.
- Netz mit Tabs, Angebot/Antwort, QR-Raum und optionalem Tracker.
- Audio, Grafik, Shader, 3D-Quader und Kugeln.
- Bühne klein, normal oder Vollbild. Codefläche mit +/−, Strg+Mausrad und Zwei-Finger-Zoom.
- Trennlinien zwischen Palette, Skripten und Bühne lassen sich ziehen. Die Breiten bleiben gespeichert.
- Darstellungen: Hell, Dunkel, Kontrast, Meer, Dämmerung. Einstellung unter Einstellungen.
- Bluetooth über Brücke, Capacitor, Web Bluetooth, Web Serial oder Web USB. Android-Bau: `docs/android-studio.md` und `docs/android-termux.md`.

Die Blocksprache BDL steht in `docs/bdl.md`. Unbekannte Opcodes aus einer SB3-Datei werden Kommentare. Farbberührung prüft die Bühnenpixel um die Figur, nicht jede Kostümkante.
