# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Vela — contesto per Claude Code

Simulatore di navigazione a vela. Fisica del vento apparente, angolo
d'attacco delle vele, bilanciamento randa/fiocco, ombra di vento sottovento
alle terre. Coste reali del Mar Ionio, distanze ridotte 1:6.

Codice, commenti, test e documentazione sono **in italiano**. Continua così.

## Dov'è il codice — leggere prima di qualsiasi comando

La radice del repository **non è un albero di lavoro**: contiene solo
`vela-repo.tar.gz` (il progetto intero), `CLAUDE.md`, `deploy.yml` e due
guide. Non c'è `package.json` in radice, quindi `npm test` lanciato qui
fallisce con ENOENT — non è un progetto rotto, è un archivio di consegna.

L'archivio si scompatta in `vela-repo/` con dentro:

```
index.html                 markup, stile e tutte le variabili CSS del tema
src/main.js                punto d'ingresso: per ora importa solo legacy/game.js
src/legacy/game.js         il gioco, ~1900 righe, ancora tutto in un pezzo
src/data/ionian.json       carta generata (committata, ma NON ancora letta dal gioco)
test/harness.js            fa girare il gioco vero in Node, con canvas e DOM finti
test/golden.test.js        gli 8 test che definiscono "questa barca"
tools/build-charts/        da YAML + Natural Earth a carta di gioco
.github/workflows/deploy.yml
```

`ISTRUZIONI-github.md` spiega perché: il progetto è pensato per essere
caricato dall'interfaccia web di GitHub, e `deploy.yml` sta anche in radice
perché il trascinamento nel browser salta le cartelle che cominciano per
punto.

Se ti viene chiesto di lavorare sul codice, scompatta l'archivio e lavora
lì. Se il lavoro va committato, chiedi prima se il repository deve diventare
un albero di lavoro normale (file scompattati e versionati) invece che un
tarball: sono due modi incompatibili di tenere il progetto, e la scelta non
è tua.

## Comandi

Da dentro `vela-repo/`:

```bash
npm test         # 8 test, headless, ~6 s — NON serve npm install
npm install      # solo per dev e build: l'unica dipendenza è vite
npm run dev      # http://localhost:5173
npm run build    # dist/
npm run charts   # rigenera le carte (serve Python + shapely + pyyaml)
```

I test non hanno dipendenze: `node --test test/*.test.js` gira su un
checkout pulito, senza `node_modules`. Per un singolo test:

```bash
npm run test:golden
node --test --test-name-pattern "spinnaker" test/golden.test.js
```

## Regole non negoziabili

**1. La golden test è il contratto della simulazione.**
`test/golden.test.js` fissa i numeri che definiscono questa barca: polare a
cinque andature, spinnaker che paga solo in portante, terzaroli che con
vento forte fanno andare più forte, virata sotto i 20 s, panne senza uscita
se non col fiocco a collo, ombra di vento sotto Lefkada, scala temporale
ininfluente, un giro completo di interfaccia senza NaN.

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

Il meccanismo: `runInGame(codice)` concatena stub del DOM + `game.js` +
driver + il tuo codice dentro una `new Function`, quindi la sonda vede
**tutte le variabili di modulo del gioco** (`boat`, `game`, `world`,
`windBase`, `physics`, `windAt`, …) come se fosse scritta in fondo al file.
Si chiude chiamando `report({...})`.

Tre modi di far avanzare il tempo, e vanno tenuti distinti:

- `tick(n)` / `seconds(s)` — fotogrammi veri via `requestAnimationFrame`
  finto: passa dal ciclo `frame()`, quindi risente di `timeScale`, pause e
  pannelli aperti. È l'unico che esercita anche il disegno.
- `steady(twaDeg, {...})` (dalla stringa `STEADY`) — porta la barca a regime
  a rotta bloccata chiamando `physics(0.02)` in un ciclo, e restituisce i
  nodi. È la base dei test sul polare.
- chiamate diretta a `physics(1/120)` in coppia, con `trimWindows()`,
  `autopilot(1/60)` e `game.t += 1/60` a mano: replica il sottopasso del
  ciclo reale quando serve controllo fine.

Molti test si costruiscono un `world` finto invece di caricare la carta:
serve l'oggetto completo — `{islands, marks, ports, shade, size, start,
name}` — con una boa a `1e9` per tenerla fuori dai piedi. Se aggiungi un
campo a `world`, i test finti vanno aggiornati o falliscono con `undefined`.

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
- La scala geografica è **1:6** (`SCALE_GEO`): le miglia mostrate sono
  quelle vere, il tempo reale sarebbe sei volte il cronometro, la velocità
  in nodi è invece quella effettiva della barca. Attenzione a non mescolare
  le unità: una media di 21 nodi è stata un bug proprio così.

## Com'è fatto `game.js`

Un solo file, sezioni separate da righe `══════`, nell'ordine: utilità →
costanti `K` → mondo (letterale `IONIO`, `mkIsland`, `landDepth`,
`buildShade`, `genWorld`) → stato (`boat`, `game`, vento) → fisica
(`sailAero`, `aeroC`, `bestTrim`, `polarSpeed`, `trimWindows`, `physics`,
`autopilot`) → tratteggi del vento → input → disegno → strumenti →
interfaccia → carta nautica → giornale di bordo → tutorial → ciclo.

Quattro cose che conviene sapere prima di toccarlo:

- **Il ciclo `frame(now)`** in fondo al file è l'unico punto in cui il tempo
  avanza. `dt` è ritagliato in `[0, 0.05]` (il commento sul negativo è la
  cicatrice di un bug vero), moltiplicato per `timeScale`, e la fisica gira
  a sottopassi: `n = max(2, ceil(sdt/0.02))`. Ogni smorzamento scritto
  dentro `physics` va quindi espresso **per unità di tempo**, mai per
  sottopasso — è l'errore che ha bloccato la barca sugli scogli.
- **Il ciclo si ferma da solo** quando c'è un pannello aperto (aiuto, carta,
  giornale, conferma) o `game.paused`. Nei test che usano `tick()` bisogna
  chiuderli a mano: `helpEl.classList.remove("on"); tut.on = false;`.
- **`windAt(x,y)`** è chiamata centinaia di migliaia di volte per
  fotogramma fra fisica e tratteggi: un test le misura il costo (< 900 ms
  per 200 k campioni). Non metterci dentro allocazioni.
- **Il salvataggio è a strati** (`store`): archivio degli artefatti se
  esiste, altrimenti `localStorage`, altrimenti memoria di sessione. Nessuno
  dei tre è garantito — non dare per scontato che `LOG` sopravviva.

## Build e deploy

`vite.config.js` ricava la `base` da `GITHUB_REPOSITORY` in build e la
lascia a `/` in sviluppo: è quello che evita la pagina bianca su GitHub
Pages sotto `/nome-repo/`. Non scriverla a mano.

Il workflow incatena `test → build → deploy`, con build e deploy limitati a
`main`: se la golden test è rossa il sito non viene pubblicato. Va abilitato
una volta sola **Settings → Pages → Source: GitHub Actions**.

## Pipeline delle carte

`npm run charts` esegue `tools/build-charts/build.py` sulla configurazione
`ionian.yaml`: riquadro geografico, scala, porti, nomi delle terre. Scarica
Natural Earth 10m (serve rete la prima volta, poi resta in
`tools/build-charts/.cache/`), ritaglia le coste, le ammorbidisce con
spline Catmull-Rom, garantisce i porti in acqua navigabile connessa e
scrive `src/data/ionian.json`. L'output va committato; deve rigenerarsi
identico, quindi `git diff src/data/ionian.json` dopo un `npm run charts`
deve risultare vuoto.

Per aggiungere un'area: copia lo YAML, cambia riquadro e porti, rilancia.

## Stato attuale e prossimi passi

Il gioco è ancora tutto in `src/legacy/game.js`. In ordine:

1. **La carta generata non è collegata.** `build.py` produce
   `src/data/ionian.json` (18 KB), ma `ionianWorld()` legge ancora il
   letterale `IONIO` incorporato in `game.js` (~75 KB, il 40% del file). I
   due sono già andati alla deriva: stessa `size` (25632) e stesse 16 terre
   e 6 boe, ma il JSON ha 17 porti contro 16, partenza in
   `{x:670, y:-3873}` invece di `{x:1544, y:-4125}`, e `geo.lat0` diverso
   dalla quinta cifra decimale. Passare al JSON **sposta il punto di
   partenza**, quindi tocca il test "la carta del Ionio è navigabile": va
   fatto in un commit dedicato. È l'estrazione più semplice e sblocca
   l'aggiunta di nuove aree.
2. **`src/sim/`**: cominciare dalle funzioni già pure — `aeroC`,
   `bestTrim`, `polarSpeed`, `sailAero`, `trimState` — poi `physics()`, che
   è il pezzo difficile perché legge `world`, `game.t` e `windAt`.
3. **Passo fisso e PRNG seminato**: accumulatore a 60 Hz logici. `game.js`
   ha già `mulberry32` e `hashStr`, ma il mondo procedurale usa ancora
   `Math.random()` in `newGust` e `spawnStreak`. Un replay diventa seme +
   log degli input, e il fantasma una rigiocata vera.
4. **HUD in DOM**: gli strumenti disegnati con `fillText` a coordinate
   calcolate a mano sono la parte più sgradevole da modificare.
5. **Barca come dati**: le costanti in `K` sono i parametri di *una* barca.
