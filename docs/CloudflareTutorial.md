# Cloudflare, kostenloser Plan

Der Proxy und der Treffpunkt laufen bei Cloudflare. Die Website selbst bleibt statisch. Ein X-Token ist kein xAI-Schlüssel. Der Schlüssel für xAI liegt nur als Geheimnis auf dem Worker.

## 1. Konto

1. Unter https://dash.cloudflare.com ein kostenloses Konto anlegen.
2. Auf dem Rechner Node 20 oder neuer. Im Ordner `proxy/`: `npx wrangler login`.
3. Der kostenlose Plan begrenzt Anfragen pro Tag, CPU-Zeit pro Aufruf und die Größe eines Workers. Die genauen Zahlen stehen im Dashboard unter Workers und ändern sich. Dieser Proxy macht pro Chat einen Aufruf an X und einen an xAI. Das passt für wenige Personen, nicht für eine offene Menge.

## 2. Geheimnisse

Im Ordner `proxy/`:

```bash
npx wrangler secret put XAI_API_KEY
```

Nur wenn die X-App ein Geheimnis erzwingt:

```bash
npx wrangler secret put X_CLIENT_SECRET
```

Für eine öffentliche PKCE-App das Geheimnis weglassen. `XAI_API_KEY` nie in `wrangler.toml`, `public/config.json` oder Git schreiben.

In `wrangler.toml` `ALLOWED_ORIGIN` auf die Adresse der Website setzen, sobald sie feststeht. `RATE_LIMIT` ist die Zahl der Chats pro X-Kennung und Stunde in einem Isolate. Nach einem Neustart des Isolates ist der Zähler leer. Ein gemeinsamer Zähler über alle Isolate ist ein Vorschlag für später.

## 3. X-App

1. https://developer.x.com, App als öffentlicher Client mit PKCE.
2. Rechte: `users.read`, `tweet.read`, `offline.access`.
3. Callback-URL exakt die Website, ohne Query, zum Beispiel `https://<name>.github.io/BlancheDeCiel-mod/`.
4. Die Client-ID kommt in die Einstellungen der App oder in `public/config.json` unter `xClientId`. Kein Geheimnis in diese Datei.

## 4. Proxy veröffentlichen

```bash
cd proxy
npx wrangler deploy
```

Die ausgegebene Adresse ist die Server-URL. In der App unter Einstellungen eintragen, oder in `public/config.json`:

```json
{
  "serverUrl": "https://blanche-de-ciel-proxy.<konto>.workers.dev",
  "proxyUrl": "",
  "coordinatorUrl": "",
  "xClientId": "die-client-id"
}
```

Leeres `proxyUrl` bedeutet: die App nimmt `serverUrl`. Danach die statische Seite neu bauen und veröffentlichen, wenn die Datei im Build liegen soll. Eintragen in den Einstellungen wirkt ohne neuen Build.

„Mit X anmelden“ schickt dich zu X und zurück. Der Chat geht an `POST /v1/chat`. Der Worker prüft das Token bei `https://api.x.com/2/users/me` und ruft xAI mit dem Geheimnis auf.

## 5. Treffpunkt

Der Treffpunkt ist ein Durable Object. Zwei Geräte öffnen einmal eine WebSocket-Verbindung auf `/meet?room=…`, tauschen Angebot und Antwort, und schließen die Verbindung. Danach spricht WebRTC direkt, mit STUN `stun.l.google.com:19302`.

Veröffentlichen:

```bash
npx wrangler deploy -c wrangler.meet.toml
```

Wenn der kostenlose Plan Durable Objects ablehnt, bricht dieser Befehl ab. Der Proxy aus Schritt 4 bleibt nutzbar, solange du nicht dieselbe Version mit der fehlgeschlagenen Migration überschreibst. Ohne Treffpunkt verbinden sich Geräte weiter über Angebot/Antwort oder einen Tracker.

Aufgabenstücke: `POST /queue?room=name` mit `{ "id", "seq", "total", "data" }`. Ein Stück hat höchstens 16000 Zeichen, höchstens 64 Stücke. `GET /queue?room=name&id=` holt sie. `POST /gossip?room=name` mit `{ "key", "hash" }` sagt den verbundenen Geräten, dass ein Gewichtspaket unter diesem Namen im Netz liegt. Die Pakete selbst laufen über die bestehende Tabelle (`nnshare`), nicht durch den Worker.

## 6. Eigene Domain

Im Dashboard die Worker-Route auf eine Subdomain legen, die bei Cloudflare liegt, zum Beispiel `api.example.com`. Dieselbe Adresse kommt in `serverUrl`. Das ist optional.

## 7. TURN

Der kostenlose Plan hat keinen TURN-Dienst. Wenn beide Telefone hinter einem strengen NAT sitzen, kommt die direkte Verbindung nicht zustande. Dann einen eigenen TURN-Server betreiben und die ICE-Server in `src/webrtc.js` ergänzen. Zugangsdaten nicht ins Repository legen.

## 8. Was die App sehen darf

`serverUrl`, `coordinatorUrl` und `xClientId` sind öffentlich. Der xAI-Schlüssel und ein eventuelles X-Geheimnis bleiben in `wrangler secret`.
