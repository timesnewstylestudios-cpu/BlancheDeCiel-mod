# Cloudflare, kostenloser Plan

Der Treffpunkt ist optional. Die Website bleibt statisch, und die KI rechnet im Browser. Dieser Worker speichert keinen Schlüssel und ruft keine Modellschnittstelle auf.

## 1. Konto

1. Unter https://dash.cloudflare.com ein kostenloses Konto anlegen.
2. Auf dem Rechner Node 20 oder neuer. Im Ordner `proxy/`: `npx wrangler login`.
3. Der kostenlose Plan begrenzt Anfragen pro Tag, CPU-Zeit und die Größe eines Workers. Die Zahlen stehen im Dashboard und ändern sich. Der Treffpunkt leitet nur Angebot, Antwort, Aufgabenstücke und kurze Hinweise weiter.

## 2. Veröffentlichen

Es gibt kein Geheimnis einzutragen.

```bash
cd proxy
npx wrangler deploy -c wrangler.meet.toml
```

`ALLOWED_ORIGIN` in der Toml-Datei auf die Adresse der Website setzen, sobald sie feststeht.

Die ausgegebene Adresse kommt in die Einstellungen als Server-URL, oder in `public/config.json`:

```json
{
  "serverUrl": "https://blanche-de-ciel-proxy.<konto>.workers.dev",
  "coordinatorUrl": ""
}
```

Leeres `coordinatorUrl` bedeutet: die App nimmt `serverUrl`. Keine Schlüssel in diese Datei. Sie liegt im statischen Build.

Wenn der kostenlose Plan Durable Objects ablehnt, bricht dieser Befehl ab. Die Geräte nutzen dann `POST` und `GET /poll`. Das Postfach und das Kontingent liegen dann nur im Speicher des Isolats, das die Anfrage bekam. Mit Durable Objects liegt der Zähler in einem Objekt namens `quota` und gilt für alle Isolate. `QUOTA` in `[vars]` ist die Zahl der Schreibaufrufe pro Raum und Stunde. Standard ist 60. Ein KV-Binding ist dafür nicht nötig.

## 3. Was der Treffpunkt tut

Zwei Geräte öffnen einmal `/meet?room=…` als WebSocket, tauschen Angebot und Antwort, und schließen die Verbindung. Danach spricht WebRTC direkt, mit STUN `stun.l.google.com:19302`.

Aufgabenstücke: `POST /queue?room=name` mit `{ "id", "seq", "total", "data" }`. Ein Stück hat höchstens 16000 Zeichen, höchstens 64 Stücke. `GET /queue?room=name&id=` holt sie. `POST /gossip?room=name` mit `{ "key", "hash" }` sagt den verbundenen Geräten, dass ein Gewichtspaket unter diesem Namen im Netz liegt. Die Pakete selbst laufen über `nnshare`.

## 4. Eigene Domain

Im Dashboard die Worker-Route auf eine Subdomain legen, die bei Cloudflare liegt, zum Beispiel `api.example.com`. Dieselbe Adresse kommt in `serverUrl`. Das ist optional.

## 5. TURN

Ein Worker kann kein UDP öffnen. Der Vermittler bleibt ein Rechner mit öffentlicher Adresse. Im Ordner `turn/` liegen `docker-compose.yml`, `turnserver.conf` und `install-coturn.sh` für Linux oder Termux. Setze `static-auth-secret` und `external-ip`, öffne UDP 3478, und starte coturn.

Dasselbe Geheimnis kommt nur auf den Worker, nicht ins Git:

```bash
npx wrangler secret put TURN_SECRET
```

In `wrangler.meet.toml` unter `[vars]` die öffentliche Adresse eintragen, zum Beispiel `TURN_URL = "turn:dein-host:3478"`. Der Worker antwortet auf `GET /ice` mit kurzlebigen Zugangsdaten (HMAC-SHA1, Nutzername ist der Ablaufzeitpunkt). Die App holt sie selbst, sobald eine Server-URL steht.

Statt coturn kannst du Cloudflare Realtime (im Dashboard teils Calls) nutzen. Dann `CF_TURN_KEY` und `CF_TURN_TOKEN` als Geheimnisse setzen. Der Worker fragt `rtc.live.cloudflare.com` nach `iceServers`. Auch das ist ein Dienst außerhalb der statischen Website. Ohne einen dieser beiden Wege bleibt nur STUN, und strenge Netze kommen nicht durch.
