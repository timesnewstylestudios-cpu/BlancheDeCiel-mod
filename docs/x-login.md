# Anmeldung mit X und der eigene Schlüssel

Ein X-Zugangstoken (OAuth 2.0) darf die xAI-API nicht aufrufen. Eine statische Website kann keinen geheimen xAI-Schlüssel sicher aufbewahren. Deshalb gibt es zwei getrennte Wege.

## Eigener Schlüssel

Standard. Der Schlüssel gilt nur für den offenen Tab (`sessionStorage`). Das Kästchen „Schlüssel in diesem Browser merken“ schreibt ihn zusätzlich in `localStorage`. Dann bleibt er nach dem Schließen des Tabs auf diesem Gerät lesbar. Die App schreibt den Schlüssel nicht ins Protokoll und nicht in die Projekt-Datei. Die Anfrage geht vom Browser direkt an `https://api.x.ai/v1/chat/completions`.

## Anmeldung mit X

Nur wenn du einen Proxy betreibst. Der Browser holt mit PKCE ein X-Token, ohne ein Client-Geheimnis zu enthalten. Der Proxy prüft das Token bei X (`/2/users/me`) und ruft xAI mit einem Schlüssel auf, der nur auf dem Server liegt. Jede X-Kennung darf in einem Worker-Isolate standardmäßig 20 Anfragen pro Stunde. Das Limit sitzt im Speicher des Isolates und ist nach einem Neustart leer. Es ist kein globales Kontingent.

Die App nutzt den Proxy nur, wenn Proxy-URL und X-Client-ID gesetzt sind, und nur solange ein X-Token der Sitzung vorliegt. Sonst bleibt der eigene Schlüssel der Weg.

### Was du einrichtest

1. Unter https://developer.x.com eine App mit OAuth 2.0 anlegen. Typ „Public client“ mit PKCE, ohne Geheimnis, ist der passende Weg. Berechtigungen: `users.read`, `tweet.read`, `offline.access`.
2. Callback-URL exakt die Adresse der Website, ohne Query. Für GitHub Pages zum Beispiel `https://<name>.github.io/BlancheDeCiel-mod/`. Dieselbe URL muss `location.origin + location.pathname` der geladenen Seite sein.
3. Im Ordner `proxy/` den Worker veröffentlichen:

```bash
cd proxy
npx wrangler secret put XAI_API_KEY
npx wrangler deploy
```

Wenn die X-App entgegen der Empfehlung ein Geheimnis verlangt, zusätzlich `npx wrangler secret put X_CLIENT_SECRET`. Für eine öffentliche PKCE-App das Geheimnis weglassen. `X_CLIENT_ID` kann als Variable in `wrangler.toml` stehen oder leer bleiben. Die Website schickt die Client-ID beim Tausch mit.

`ALLOWED_ORIGIN` in `wrangler.toml` auf die Website setzen, nicht auf `*`, sobald die Adresse feststeht. `RATE_LIMIT` ist die Zahl der Chat-Anfragen pro X-Konto und Stunde in diesem Isolate.

4. In der App unter Einstellungen die Proxy-URL (die `workers.dev`- oder eigene Adresse, ohne Pfad am Ende) und die X-Client-ID eintragen. „Mit X anmelden“ schickt dich zu X und zurück. Der Chat läuft danach über `POST /v1/chat` des Proxys.

`public/config.json` darf `proxyUrl` und `xClientId` enthalten, damit eine veröffentlichte Seite sie schon kennt. Keine Schlüssel in diese Datei schreiben. Sie liegt im statischen Build.

Ohne diese Schritte ändert sich für GitHub Pages nichts: der Proxy wird nicht gerufen, und der eigene Schlüssel funktioniert wie bisher.
