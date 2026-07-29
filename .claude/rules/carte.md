---
paths:
  - "tools/build-charts/**"
  - "src/data/**"
---

# Pipeline delle carte

`npm run charts` esegue `tools/build-charts/build.py` sulla configurazione
`ionian.yaml`: riquadro geografico, scala, porti, nomi delle terre. Scarica
Natural Earth 10m (serve rete la prima volta, poi resta in
`tools/build-charts/.cache/`), ritaglia le coste, le ammorbidisce con
spline Catmull-Rom, garantisce i porti in acqua navigabile connessa e
scrive `src/data/ionian.json`.

L'output **va committato** e deve rigenerarsi identico: dopo `npm run
charts`, `git diff src/data/ionian.json` deve risultare vuoto. Se non lo è,
fermati e mostra la differenza invece di committarla.

Non modificare `src/data/*.json` a mano.

Per aggiungere un'area di navigazione: copia lo YAML, cambia riquadro e
porti, rilancia.

Il gioco legge questo JSON, ma non lo importa da sé: `game.js` non può
avere `import` propri (la harness lo esegue in una `new Function`), quindi
la carta gliela mette su `globalThis` l'host — `src/data/carte.js` nel
browser, la harness nei test. Chi carica `game.js` deve caricare prima le
carte, o il gioco si ferma con "carta del Ionio non caricata".

Il punto di partenza generato ha poco margine rispetto a quanto pretende
la golden test: vedi la fragilità nota in `docs/refactoring.md` prima di
rigenerare.
