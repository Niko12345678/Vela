# Vela — contesto per Claude Code

Simulatore di navigazione a vela. Fisica del vento apparente, angolo
d'attacco delle vele, bilanciamento randa/fiocco, ombra di vento sottovento
alle terre. Coste reali del Mar Ionio, distanze ridotte 1:6.

## Comandi

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # golden test, headless, ~1 s
npm run build    # dist/
npm run charts   # rigenera le carte (serve Python + shapely + pyyaml)
```

## Regole non negoziabili

**1. La golden test è il contratto della simulazione.**
`test/golden.test.js` fissa i numeri che definiscono questa barca: polare a
cinque andature, spinnaker che paga solo in portante, terzaroli che con
vento forte fanno andare più forte, virata sotto i 20 s, panne senza uscita
se non col fiocco a collo, ombra di vento sotto Lefkada, scala temporale
ininfluente.

Se un test fallisce dopo una tua modifica: **hai rotto qualcosa**. Non
allargare la tolleranza e non ritoccare le costanti in `K` per far tornare
i conti. Segnala quale numero si è mosso e di quanto, e fermati.

I valori attesi si cambiano solo quando il gioco cambia di proposito, in un
commit dedicato che spiega perché.

**2. Non riscrivere `src/legacy/game.js`.**
Si smonta un pezzo alla volta, con `npm test` verde a ogni passo. Il gioco
deve restare eseguibile a ogni commit.

**3. Quando esisterà `src/sim/`: non importa nulla da `render/` né da `ui/`.**
La simulazione deve restare pura — niente DOM, niente `Date`, niente
`Math.random` — così restano possibili test esatti, replay, worker e
verifica dei tempi lato server.

## Come è fatto il collaudo

`test/harness.js` esegue il file di gioco **vero** dentro Node contro un
canvas e un DOM finti. Non è un mock della fisica: esercita anche disegno e
interfaccia. Tre bug che a leggere il codice non si vedevano sono usciti da
qui:

- smorzamento dell'incaglio moltiplicato per `0.90` **a sottopasso**:
  cambiando il numero di sottopassi azzerava la velocità e la barca non si
  liberava più;
- `dt` non protetto dai negativi: un timestamp anomalo del browser mandava
  tutto in NaN in silenzio;
- ascoltatore registrato su una `const` prima della sua dichiarazione: il
  gioco non partiva affatto.

Per un nuovo controllo si usa `runInGame(codice)` e si chiama `report({...})`.

## Convenzioni della simulazione

- Angoli in **convenzione bussola**: 0 = Nord = su, 90 = Est = destra.
  `dv(a)` dà il versore, `angOf(x,y)` l'inverso, `norm(a)` normalizza in
  ±π. Un errore di segno in `norm` è già costato mezza giornata.
- `beta` è l'angolo del **vento apparente rispetto alla prua**, positivo se
  il vento viene da dritta.
- L'angolo d'attacco ottimo **non è costante**: vale ~27° di bolina e sale
  a 90° in poppa. La fascia verde degli strumenti è calcolata da
  `bestTrim()`, che massimizza la spinta in avanti sul modello vero. Non
  reintrodurre finestre a incidenza fissa.
- `game.pilot`: 0 barra libera, 1 richiamo al centro, 2 rotta bussola,
  3 angolo del vento. È già cambiata una volta e ha rotto due test.
- La scala geografica è **1:6**: le miglia mostrate sono quelle vere, il
  tempo reale sarebbe sei volte il cronometro, la velocità in nodi è invece
  quella effettiva della barca. Attenzione a non mescolare le unità: una
  media di 21 nodi è stata un bug proprio così.

## Stato attuale e prossimi passi

Il gioco è ancora tutto in `src/legacy/game.js`. In ordine:

1. **La carta generata non è collegata.** `tools/build-charts/build.py`
   produce `src/data/ionian.json`, ma i dati delle coste sono tuttora
   incorporati in `game.js` come letterale `IONIO`. Vanno letti dal JSON.
   È l'estrazione più semplice e sblocca l'aggiunta di nuove aree.
2. **`src/sim/`**: cominciare dalle funzioni già pure — `aeroC`,
   `bestTrim`, `polarSpeed`, `sailAero`, `trimState` — poi `physics()`, che
   è il pezzo difficile perché legge `world`, `game.t` e `windAt`.
3. **Passo fisso e PRNG seminato**: accumulatore a 60 Hz logici. Un replay
   diventa seme + log degli input, e il fantasma una rigiocata vera.
4. **HUD in DOM**: gli strumenti disegnati con `fillText` a coordinate
   calcolate a mano sono la parte più sgradevole da modificare.
5. **Barca come dati**: le costanti in `K` sono i parametri di *una* barca.
