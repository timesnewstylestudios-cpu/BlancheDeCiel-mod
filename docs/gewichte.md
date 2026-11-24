# Gewichtspakete

Eine Matrix wird klein, indem ein Rang-k-Keim und wenige Korrekturen sie ersetzen.

Der Keim ist ein äußeres Produkt: die Spalte und die Zeile um den größten Eintrag, geteilt durch diesen Eintrag. Rang k wiederholt das auf dem Rest. Statt der Faktoren kann ein PRNG-Saatwert eine Startmatrix erzeugen. Was der Keim verfehlt, aber noch gebraucht wird, liegt als die k größten Reste in 16-Bit-Ganzzahlen (`int16`) mit einem gemeinsamen Maßstab. Die Faktoren selbst sind `float16`.

`encodeMatrix` und `decodeMatrix` in `src/weights.js` bauen das Paket. `errorMetrics` nennt den mittleren quadratischen Fehler, den größten Abstand und den relativen Fehler.

Eine echte Rang-1-Matrix aus kleinen ganzen Zahlen kommt ohne Restfehler zurück. Eine vollere Matrix bleibt ungenau, bis genug Reste mitgeschickt werden. Der PRNG-Saatwert allein liegt daneben. Er spart nur Platz, wenn die Matrix nahe an dieser Startverteilung liegt. Nach dem Lernen sind die Faktoren mit Resten der richtige Weg.

Die Pakete gehen über die vorhandene Tabelle im Netz (`nnshare` / `nnfetch`), über den Treffpunkt als Stücke von höchstens 16000 Zeichen, und als Datei aus der KI-Leiste. Das lokale Vorschlagsnetz speichert sein Paket in IndexedDB.
