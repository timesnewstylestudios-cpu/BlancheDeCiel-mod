# Vorschläge für später

Bewusst nicht in diesem Stand, weil es hier nicht ehrlich fertig wäre:

- WebGPU- oder WebGL-Kerne für große Netze. Gerechnet wird auf der CPU, Vektoren sind kurz (höchstens 32 Einheiten).
- Volle Faltung mit Stapel und Padding, mehrschrittige LSTM-Sequenzen und Attention über viele Köpfe. Conv, RNN, LSTM-light und Attention-light laufen vorwärts. Nur dichte Schichten lernen per Backprop. Die anderen Schichten machen bei `nntrain` finite Differenzen auf wenigen Gewichten.
- Ein großes vortrainiertes Sprachmodell im Browser. Das lokale Netz ist ein Bigramm plus ein kleines MLP über elf Blocknamen und lernt nur aus diesem Projekt.
- Lernen bei jedem einzelnen Ziehen eines Blocks. Das Signal ist „Übernehmen“ (auch nach Korrektur) und „Reihenfolge merken“.
- Ein globales Kontingent über alle Worker-Isolates hinweg. Das Limit sitzt im Speicher eines Isolates.
- Ein TURN-Server. Der kostenlose Cloudflare-Plan stellt keinen. Hinter symmetrischem NAT bleibt die direkte Verbindung aus. Angebot und Antwort oder ein eigener TURN-Dienst sind dann der Weg.
- Durable Objects, falls der kostenlose Plan sie ablehnt. Der KI-Proxy in `wrangler.toml` braucht sie nicht. Der Treffpunkt liegt in `wrangler.meet.toml`.
- Portscans, Login-Angriffe und Exploits gegen echte Rechner. Der Übungsrechner bleibt in der Sandbox. Siehe `docs/sandbox.md`.
