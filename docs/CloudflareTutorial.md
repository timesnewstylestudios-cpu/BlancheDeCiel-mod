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

Wenn der kostenlose Plan Durable Objects ablehnt, bricht der Befehl ab. Dann bleiben Angebot/Antwort und ein optionaler Tracker der Weg. Ein Ersatz ohne Durable Objects steht unter den Vorschlägen für später.

## 3. Was der Treffpunkt tut

Zwei Geräte öffnen einmal `/meet?room=…` als WebSocket, tauschen Angebot und Antwort, und schließen die Verbindung. Danach spricht WebRTC direkt, mit STUN `stun.l.google.com:19302`.

Aufgabenstücke: `POST /queue?room=name` mit `{ "id", "seq", "total", "data" }`. Ein Stück hat höchstens 16000 Zeichen, höchstens 64 Stücke. `GET /queue?room=name&id=` holt sie. `POST /gossip?room=name` mit `{ "key", "hash" }` sagt den verbundenen Geräten, dass ein Gewichtspaket unter diesem Namen im Netz liegt. Die Pakete selbst laufen über `nnshare`.

## 4. Eigene Domain

Im Dashboard die Worker-Route auf eine Subdomain legen, die bei Cloudflare liegt, zum Beispiel `api.example.com`. Dieselbe Adresse kommt in `serverUrl`. Das ist optional.

## 5. TURN

Der kostenlose Plan hat keinen TURN-Dienst. Hinter einem strengen NAT kommt die direkte Verbindung nicht zustande. Ein eigener TURN-Server und wo die Zugangsdaten hingehören, steht bei den Vorschlägen für später. Zugangsdaten nicht ins Repository legen.
