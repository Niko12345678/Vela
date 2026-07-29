# Stato e prossimi passi

Il gioco è quasi tutto in `src/legacy/game.js`. In ordine di convenienza:

## 1. `src/sim/`

Cominciare dalle funzioni già pure — `aeroC`, `bestTrim`, `polarSpeed`,
`sailAero`, `trimState` — poi `physics()`, che è il pezzo difficile perché
legge `world`, `game.t` e `windAt`.

Vincolo da tenere presente: **`game.js` non può avere `import` propri**,
perché la harness lo esegue dentro una `new Function` e lì una
dichiarazione `import` è un errore di sintassi. Finché il gioco resta un
file solo, quello che gli serve da fuori glielo passa l'host — è così che
arriva la carta, vedi `src/data/carte.js`. Il primo modulo estratto dovrà
sciogliere questo nodo: o la harness impara a caricare moduli veri, o
`game.js` smette di essere eseguito come sorgente concatenata.

## 2. Passo fisso e PRNG seminato

Accumulatore a 60 Hz logici. `game.js` ha già `mulberry32` e `hashStr`, ma
il mondo procedurale usa ancora `Math.random()` in `newGust` e
`spawnStreak`. Un replay diventa seme + log degli input, e il fantasma una
rigiocata vera invece di un'interpolazione di posizioni.

## 3. HUD in DOM

Gli strumenti disegnati con `fillText` a coordinate calcolate a mano sono
la parte più sgradevole da modificare. Sul canvas resta solo la grafica.

## 4. Barca come dati

Le costanti in `K` sono i parametri di *una* barca: in `boats/*.json`
diventano una flotta.

## Fragilità nota: la partenza è al pelo

Da quando la carta viene dal JSON, il punto di partenza ha **170 unità**
di acqua libera attorno contro le 921 del vecchio letterale, perché
`build.py` garantisce solo il `min_clearance: 170` dello YAML. La golden
test pretende `< -150`: il margine è sceso da 6× a 1,13×, quindi una
rigenerazione delle carte che sposti di poco la partenza può far diventare
rosso quel test. Se succede, la correzione è alzare il franco richiesto
alla partenza in `build.py`, **non** allargare la tolleranza del test.
