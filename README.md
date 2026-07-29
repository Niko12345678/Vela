# Vela

Simulatore di navigazione a vela nel Mar Ionio. Fisica del vento apparente,
angolo d'attacco delle vele, bilanciamento randa/fiocco, ombra di vento
sottovento alle terre. Coste reali (Natural Earth), distanze ridotte 1:6.

## Comandi

```bash
npm install
npm run dev        # sviluppo su http://localhost:5173
npm test           # golden test della simulazione (headless, senza browser)
npm run build      # build statica in dist/
npm run charts     # rigenera le carte dai dati geografici (serve Python)
```

## Struttura

```
index.html                 markup e stile
src/main.js                punto d'ingresso
src/legacy/game.js         il gioco, ancora tutto in un pezzo
src/data/                  carte generate (committate)
test/harness.js            fa girare il gioco vero in Node, con canvas finto
test/golden.test.js        i numeri che definiscono "questa barca"
tools/build-charts/        da configurazione YAML a carta di gioco
```

## Il piano di refactoring

`src/legacy/game.js` va smontato un pezzo alla volta, non riscritto. Il
gioco deve restare eseguibile a ogni commit e la golden test deve restare
verde. Ordine previsto:

1. **`src/sim/`** — la simulazione, pura: `step(state, input, dt) -> state`.
   Niente DOM, niente `Date`, niente `Math.random`. È il passo che vale
   più di tutti gli altri messi insieme: da lì discendono test esatti,
   replay, esecuzione in un worker e verifica lato server dei tempi.
2. **Passo fisso e PRNG seminato** — accumulatore a 60 Hz logici. Un replay
   diventa *seme + log degli input*, poche centinaia di byte, e il fantasma
   diventa una rigiocata vera invece di un'interpolazione di posizioni.
3. **HUD in DOM** — gli strumenti disegnati a mano su canvas sono la parte
   più sgradevole da modificare. Sul canvas resta solo ciò che è grafica.
4. **Contenuto come dati** — le costanti in `K` sono i parametri di *una*
   barca: in `boats/*.json` diventano una flotta.
5. **Renderer dietro un'interfaccia** — così WebGL resta una scelta, non un
   obbligo. Canvas 2D oggi sta sotto il millisecondo a fotogramma.

Regola di dipendenza da far rispettare al linter appena esiste `src/sim/`:
**`sim/` non importa nulla da `render/` né da `ui/`.** È l'unica regola
architetturale che serve davvero.

## Perché la golden test è la prima cosa

Non è cerimonia. Durante lo sviluppo ha trovato tre bug che a leggere il
codice non si vedevano:

- lo smorzamento dell'incaglio moltiplicava per `0.90` **a sottopasso**:
  cambiato il numero di sottopassi, azzerava la velocità e la barca non si
  liberava più;
- `dt` non era protetto dai valori negativi, e un timestamp anomalo del
  browser mandava tutta la fisica in NaN in silenzio;
- un ascoltatore registrato su una `const` prima della sua dichiarazione:
  il gioco non partiva affatto.

Gira senza browser, contro un canvas finto, sul file di gioco vero: quindi
esercita anche disegno e interfaccia, non solo la fisica.

## Deploy

Push su `main` → GitHub Actions esegue i test, costruisce e pubblica su
GitHub Pages. La `base` di Vite si ricava da `GITHUB_REPOSITORY`, quindi il
sito funziona sotto `/nome-repo/` senza doverla scrivere a mano.

Da abilitare una volta sola: **Settings → Pages → Source: GitHub Actions**.

## Dati geografici

Coste da [Natural Earth](https://www.naturalearthdata.com/) (dominio
pubblico), risoluzione 10m, interpolate con spline Catmull-Rom. Skorpios è
sotto la risoluzione del dato ed è ricostruita alla sua posizione reale:
è l'unica costa non autentica della carta.

Per aggiungere un'area di navigazione: copia `tools/build-charts/ionian.yaml`,
cambia riquadro e porti, lancia `npm run charts`. L'output va committato.
