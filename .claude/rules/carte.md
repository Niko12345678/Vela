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

Attenzione: la carta generata **non è ancora collegata al gioco**, che
legge il letterale `IONIO` incorporato in `game.js`. Prima di toccare quel
collegamento leggi `docs/refactoring.md`: sposta il punto di partenza e
quindi tocca la golden test.
