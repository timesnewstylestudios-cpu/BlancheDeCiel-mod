# BDL — BlancheDeCiel-Beschreibungssprache

BDL ist das kompakte Textformat, mit dem der Editor ein Projekt beschreibt und mit dem die KI Blöcke setzt. Es ist kein JavaScript. Der Editor wertet nur diese Grammatik aus.

Koordinaten: Ursprung in der Bühnenmitte, x nach rechts, y nach oben. Die Bühne ist 480×360, also x von −240 bis 240 und y von −180 bis 180. Richtung 0 zeigt nach oben, 90 nach rechts; Rechtsdrehung erhöht die Richtung.

Einrückung ist erlaubt und wird ignoriert. Jede geöffnete Struktur braucht ein `end`. Namen mit Leerzeichen oder reservierten Wörtern stehen in doppelten Anführungszeichen. Variablen in Ausdrücken heißen `$name` oder `(var name)`.

## Datei und Figur

```bdl
title "Mein Projekt"
tempo 120
shader none
cam 0 0 280
rot3d 30 20
clear3d
box3d 0 40 0 70
tables-reset
cleartable mess
table mess 10
table mess 20 1
sprite Figur
pos 0 0
dir 90
scale 100
shown 1
pen #0FBD8C 2
var punkte 0
list namen "Ada" "Ben"
clear-scripts
```

`tables-reset`, `clear3d` und `clear-scripts` ersetzen vorhandenen Zustand. Wer nur etwas ergänzen will, lässt sie weg.

`table` hängt eine Zeile an. Zahlen bleiben Zahlen, Wörter werden Text. In einem Skript heißt derselbe Vorgang `row`.

## Skripte

```bdl
script 48 48
  when flag
  pendown
  repeat 4
    move 80
    turn 90
  end
  if (gt (x) 200)
    say "Rand" 1
  else
    move 10
  end
  forever
    change punkte 1
  end
end
```

Hüte:

- `when flag`
- `when key space`
- `when click`
- `when receive Nachricht`

`define tanz` … `end` legt einen eigenen Block an. Parameter folgen dem Namen, `warp` lässt den Block ohne Bildschirmaktualisierung laufen:

```bdl
define warp tanz steps
  move $steps
end
call tanz 20
```

Klone: `clone myself`, Hut `when clone`, `deleteclone`. `stop all` stoppt alle Skripte, `stop this` nur dieses, `stop other` die anderen Skripte derselben Figur.

`edit` ändert das n-te ausführbare Skript der Figur, Zählung bei 1. Die Zeilen gelten nacheinander für den jeweils neuen Stand:

```bdl
edit 1
  replace 2 move 30
  insert 2 wait 0.5
  delete 4
end
delscript 2
```

`replace` und `insert` nehmen genau einen flachen Befehl. Verschachtelte Körper schreibt man als ganzes `script`.

## Ausdrücke

Präfix in Klammern. Ein nacktes Wort ist Text, eine Zahl ist eine Zahl, `$name` liest eine Variable.

```bdl
set punkte (add $punkte 1)
say (join "x=" (x)) 2
if (and (gt (timer) 1) (not (mousedown)))
  broadcast Start
end
```

Listen folgen der Scratch-Reihenfolge: `push` Gegenstand dann Liste, `remove` Index dann Liste, `(item Index Liste)`. Tabellen nennen zuerst den Namen: `setcell mess 1 1 5`, `(cell mess 1 1)`. Zeilen und Spalten zählen ab 1.

`(jobresult sum mess 1)` liest das Ergebnis von `job sum mess 1`.

## KI-Aufruf

Das lokale Netz schlägt BDL aus den letzten Blöcken vor. Es sieht keine Modellschnittstelle und keinen Schlüssel. Die Grammatik bleibt dieselbe.

Blöcke `aiprompt` geben erst Geld aus, wenn in den Einstellungen „KI-Blöcke im Skript“ an ist.

## Token

`sprite` `pos` `dir` `shown` `scale` `pen` `var` `list` `script` `end` `else` `define` `clear-scripts` `cleartable` `table` `tables-reset` `edit` `replace` `insert` `delete` `delscript` `title` `tempo` `when` `flag` `key` `click` `receive` `move` `turn` `turnl` `goto` `setx` `changex` `sety` `changey` `point` `say` `think` `show` `hide` `setsize` `changesize` `broadcast` `wait` `repeat` `forever` `if` `repeatuntil` `call` `ask` `resettimer` `set` `change` `push` `remove` `clearlist` `pendown` `penup` `penclear` `pencolor` `pensize` `stamp` `tone` `note` `wave` `filter` `adsr` `recstart` `recstop` `recplay` `playsnd` `rect` `oval` `line` `gfxclear` `layer` `shader` `box3d` `cam` `rot3d` `clear3d` `row` `setcell` `share` `fetch` `job` `btping` `aiprompt` `comment` `log` `decomp` `ext` `x` `y` `size` `answer` `timer` `mousex` `mousey` `mousedown` `keydown` `add` `sub` `mul` `div` `mod` `round` `rand` `join` `strlen` `letter` `gt` `lt` `eq` `and` `or` `not` `item` `len` `has` `volume` `fft` `cell` `jobresult` `peers` `bt`

Erweiterungen, die du lädst, rufst du mit `ext <id> <opcode> <argumente…>` auf.

`warp` `clone` `deleteclone` `waituntil` `stop` `bounce` `pointtowards` `glide` `switchcostume` `nextcostume` `ghost` `sphere3d` `costume` `touching` `distance` `current` `contains` `front` `back` `changelayer` `switchbackdrop` `nextbackdrop` `backdrop` `broadcastwait` `touchcolor` `colortouch` `days2000` `username` `cloneof` `changepen` `sethue` `changehue` `setitem` `mapset` `mapget` `return` `result` `suggest` `learnseq` `nnnew` `nnlayer` `nnopt` `nntrain` `nnpredict` `nnsave` `nnload` `nnshare` `nnfetch` `sh` `shout` `practice`

## English

BDL is the compact text format shared by the editor and the model. Indentation is optional; `end` is required. Origin is the stage center, x right, y up, direction 0 up and 90 right. Reporters are prefix calls in parentheses (`(add $punkte 1)`). `clear-scripts`, `tables-reset` and `clear3d` replace that state; omit them to append. List blocks keep Scratch's argument order. New table blocks name the table first, and row/column indexes start at 1. The token list above is the complete surface vocabulary.
