# Vorschläge für später

Erledigt in diesem Stand, mit den genannten Grenzen:

- Dichte Matrizen können über WebGPU laufen, sonst über WebGL2 mit Float-Puffer, sonst auf der CPU. WebGL nimmt höchstens 32 mal 32. Größere dichte Schichten fallen auf die CPU zurück. `nnrun` schreibt das Ergebnis in eine Variable. `nnpredict` bleibt die nachvollziehbare CPU-Rechnung.
- Vektoren dürfen bis 128 Einträge lang sein.
- LSTM ist eine echte Zelle mit Eingabe-, Merken-, Ausgabe-Tor und Kandidat, über mehrere Schritte. Es ist kein gestapeltes oder bidirektionales LSTM.
- Attention ist ein Kopf über eine kurze Folge. Die Gewichte sind eine Softmax und summieren sich auf 1.
- Nach dem Ziehen eines Blocks lernt das lokale Netz höchstens alle 500 ms.
- `POST /queue`, `/gossip` und `/poll` zählen ein Stundenkontingent. Mit einem KV-Binding `BOARD` gilt es über Isolate hinweg. Ohne KV gilt es nur in dem Isolat, das die Anfrage bekam.
- TURN-URL, Nutzer und Geheimnis stehen in den Einstellungen und gehen in die WebRTC-Verbindung. Der kostenlose Plan liefert den Server nicht mit.
- Fehlt das Durable Object, antwortet `/meet` mit einem Hinweis auf `/poll`. Das Postfach liegt in KV oder, ohne KV, im Speicher des Isolats.

Weiterhin nicht drin:

- Ein großes vortrainiertes Sprachmodell. Das lokale Netz kennt elf Blocknamen aus diesem Projekt.
- Portscans, Login-Angriffe und Exploits gegen echte Rechner. Der Übungsrechner bleibt in der Sandbox. Siehe `docs/sandbox.md`.
- Ein mitgelieferter TURN-Dienst. Du betreibst coturn oder trägst die Zugangsdaten aus Cloudflare Realtime (im Dashboard auch Calls genannt) selbst ein. Die genaue Beschriftung im Dashboard kann sich ändern.
