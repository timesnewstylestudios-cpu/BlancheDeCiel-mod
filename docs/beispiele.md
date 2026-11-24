# Kurze Beispiele

Dieselben Beispiele stehen in der Hilfe.

Bewegung:

```
script 48 48
  when flag
  repeat 4
    move 40
    turn 90
  end
end
```

Eigenes Ergebnis (Fakultät 4 ist 24):

```
define fact n
  if (lt $n 2)
    return 1
  end
  call fact (sub $n 1)
  return (mul $n (result))
end
```

Karte und Liste:

```
mapset farbe karte "blau"
setitem 1 band 3
```

Lokales Netz: Block `suggest`, dann „Übernehmen“. `learnseq move say` merkt sich diesen Übergang. „Reihenfolge merken“ liest die gelegten Blöcke.

Szene leeren: `clearscene` oder `szeneleeren`.

Gestapeltes Netz:

```
nnnew netz 4 4 2
nnlayer netz lstm 4 stack 2
nnlayer netz attention 4 heads 2
```

Dichtes Netz, ein Schritt:

```
nnnew netz 1 1 1
nnopt netz sgd 1
nntrain netz 0 1
```

Shell, nur in der Sandbox:

```
sh "cat /home/gast/notiz.txt"
sh "audit"
```

Gewichte teilen: `nnshare netz` schickt das Paket über das bestehende Netz. `nnfetch netz` holt es.
