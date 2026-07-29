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

## 4. Barca come dati — fatto

`K` non è più un letterale: la flotta sta in `src/data/barche.json`,
`setBarca(id)` scambia lo scafo e il menù ha il selettore. Quattro barche
(gozzo, sloop 11 m, dodici da regata, cutter 15 m).

Tre costanti che erano scritte a mano dentro `physics()` sono diventate
parametri della barca, tutte a comportamento identico per lo sloop: la
rigidezza `STIFF` (il `9000` che compariva sia in `physics` sia in
`polarSpeed`), il `PESCAGGIO` (la soglia di incaglio, prima `-2` fissa) e
il numero di mani di terzaroli, che ora è `K.REEF.length` invece di `3`.

Resta da fare: il pescaggio distingue le barche solo all'incaglio, ma la
carta non lo mostra da nessuna parte — chi governa il cutter scopre di non
poter entrare in una cala solo toccando il fondo. Servirebbe un accenno di
batimetrica sulla carta nautica.

## Fragilità nota: la partenza è al pelo

Da quando la carta viene dal JSON, il punto di partenza ha **170 unità**
di acqua libera attorno contro le 921 del vecchio letterale, perché
`build.py` garantisce solo il `min_clearance: 170` dello YAML. La golden
test pretende `< -150`: il margine è sceso da 6× a 1,13×, quindi una
rigenerazione delle carte che sposti di poco la partenza può far diventare
rosso quel test. Se succede, la correzione è alzare il franco richiesto
alla partenza in `build.py`, **non** allargare la tolleranza del test.
