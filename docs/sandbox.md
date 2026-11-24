# Virtueller Rechner

Der Rechner ist eine Sandbox in einem Web Worker. Er hat kein echtes Dateisystem, kein Netzwerk und keine fremden Prozesse. Jede Zeile ist in der Länge, der Zahl der Befehle, der Ausgabe und der Laufzeit begrenzt. Die Dateien bleiben im Speicher. `practice` legt die Übungsdateien neu an.

Befehle: `ls`, `cd`, `pwd`, `cat`, `echo`, `grep` (nur Teilzeichenkette), `env`, `ps`, Pipes `|`, Umleitungen `>` `>>` `<`.

Die Übung sucht absichtlich schwache Dateien in dieser Sandbox. `audit` meldet eine für alle schreibbare Konfiguration und eine Zeile mit `password=`. Die Marke `bdc{nur-sandbox}` liegt in `/home/gast/geheim/marke.txt`. Das ist eine Aufgabe nur für diesen virtuellen Rechner.

`owncheck ich-bin-berechtigt` bestätigt, dass du die Übung verstehst, und prüft danach trotzdem nur die Sandbox. Ein Portscan, ein Login-Angriff oder ein Exploit gegen einen anderen Rechner ist nicht eingebaut und wird nicht eingebaut.

Blöcke: `sh`, `shout`, `practice`.
