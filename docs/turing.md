# Turing-Vollständigkeit

BDL und die Blöcke haben die nötigen Mittel:

- unbegrenzte Schleifen (`forever`, `repeatuntil`), die über viele Bilder laufen
- Verzweigungen (`if` / `else`)
- dynamische Listen und Schlüsselkarten (`push`, `setitem`, `mapset`, `mapget`)
- Rekursion mit Rückgabewert (`define`, `call`, `return`, `result`)

Der Interpreter bricht eine Kette bei 200 gestapelten Aufrufen ab und arbeitet pro Bild eine begrenzte Zahl Schritte. Das ist eine Sicherheitsgrenze der Ausführung, keine Grenze der Sprache. Eine `forever`-Schleife läuft weiter, solange die Flagge läuft.

Ein Brainfuck-Interpreter in BDL zeigt es an einem kurzen Programm. Die Befehle sind Zahlen: 1 ist `+`. Drei Einsen auf dem Band heben die Zelle auf 3. Das vollständige Programm steht als Test in `test/round4.test.js` und lässt sich in den Editor einfügen:

```
sprite Rechner
var ip 1
var dp 1
var op 0
list code 1 1 1
list tape 0
clear-scripts
script 10 10
  when flag
  repeat 3
    set op (item $ip code)
    if (eq $op 1)
      setitem $dp tape (add (item $dp tape) 1)
    end
    change ip 1
  end
end
```

Damit sind bedingte Sprünge, ein veränderliches Band und eine Schleife in der Blocksprache ausgedrückt. Zusammen mit Rekursion und Karten reicht das für jede berechenbare Funktion, soweit Zeit und Speicher des Browsers tragen.
