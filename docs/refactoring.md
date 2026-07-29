# Stato e prossimi passi

Il gioco è ancora tutto in `src/legacy/game.js`. In ordine di convenienza:

## 1. Collegare la carta generata

`build.py` produce `src/data/ionian.json` (18 KB), ma `ionianWorld()` legge
ancora il letterale `IONIO` incorporato in `game.js` (~75 KB, il 40% del
file). I due sono già andati alla deriva:

| | letterale `IONIO` | `ionian.json` |
|---|---|---|
| `size` | 25632 | 25632 |
| terre / boe | 16 / 6 | 16 / 6 |
| porti | 16 | 17 |
| `start` | `{x:1544, y:-4125}` | `{x:670, y:-3873}` |
| `geo.lat0` | 38.489753 | 38.490028 |

Passare al JSON **sposta il punto di partenza**, quindi tocca il test "la
carta del Ionio è navigabile": va fatto in un commit dedicato che dichiara
il cambiamento. È l'estrazione più semplice e sblocca le nuove aree.

## 2. `src/sim/`

Cominciare dalle funzioni già pure — `aeroC`, `bestTrim`, `polarSpeed`,
`sailAero`, `trimState` — poi `physics()`, che è il pezzo difficile perché
legge `world`, `game.t` e `windAt`.

## 3. Passo fisso e PRNG seminato

Accumulatore a 60 Hz logici. `game.js` ha già `mulberry32` e `hashStr`, ma
il mondo procedurale usa ancora `Math.random()` in `newGust` e
`spawnStreak`. Un replay diventa seme + log degli input, e il fantasma una
rigiocata vera invece di un'interpolazione di posizioni.

## 4. HUD in DOM

Gli strumenti disegnati con `fillText` a coordinate calcolate a mano sono
la parte più sgradevole da modificare. Sul canvas resta solo la grafica.

## 5. Barca come dati

Le costanti in `K` sono i parametri di *una* barca: in `boats/*.json`
diventano una flotta.
