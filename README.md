# Vela

Simulatore di navigazione a vela nel Mar Ionio. Fisica del vento apparente,
angolo d'attacco delle vele, bilanciamento randa/fiocco, ombra di vento
sottovento alle terre. Coste reali (Natural Earth), distanze ridotte 1:6.

## Comandi

```bash
npm test           # golden test headless: gira senza browser e senza install
npm install        # solo per dev e build: l'unica dipendenza è vite
npm run dev        # sviluppo su http://localhost:5173
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

Il piano di smontaggio di `src/legacy/game.js` sta in
[`docs/refactoring.md`](docs/refactoring.md), build e pubblicazione in
[`docs/deploy.md`](docs/deploy.md). Le istruzioni per Claude Code sono in
[`CLAUDE.md`](CLAUDE.md) e nei file che richiama.

## Perché la golden test è la prima cosa

Non è cerimonia. Durante lo sviluppo ha trovato tre bug che a leggere il
codice non si vedevano: uno smorzamento applicato per sottopasso invece che
per unità di tempo, un `dt` negativo che mandava la fisica in NaN in
silenzio, un ascoltatore registrato su una `const` prima della sua
dichiarazione.

Gira senza browser, contro un canvas finto, sul file di gioco vero: quindi
esercita anche disegno e interfaccia, non solo la fisica.

## Dati geografici

Coste da [Natural Earth](https://www.naturalearthdata.com/) (dominio
pubblico), risoluzione 10m, interpolate con spline Catmull-Rom. Skorpios è
sotto la risoluzione del dato ed è ricostruita alla sua posizione reale: è
l'unica costa non autentica della carta.
