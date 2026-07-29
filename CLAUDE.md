# CLAUDE.md — Vela

Guidance for Claude Code (claude.ai/code) when working in this repository.

Simulatore di navigazione a vela. Vento apparente, angolo d'attacco delle
vele, ombra di vento sottovento alle terre. Coste reali del Mar Ionio,
distanze ridotte 1:6. Codice, commenti, test e documentazione **in
italiano**: continua così.

## Comandi

```bash
npm test         # 11 test, headless, ~6 s — NON serve npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
npm run charts   # rigenera le carte (serve Python + shapely + pyyaml)
```

Un test solo: `node --test --test-name-pattern "spinnaker" test/golden.test.js`

## Regole non negoziabili

1. **La golden test è il contratto della simulazione.** Se `npm test`
   diventa rosso dopo una tua modifica, hai rotto qualcosa: di' quale
   numero si è mosso e di quanto, e fermati. Non allargare le tolleranze e
   non ritoccare le costanti della barca per far tornare i conti. I valori
   attesi si cambiano solo quando il gioco cambia di proposito, in un
   commit dedicato che spiega perché. La golden test parla di **una** barca
   sola, `crociera11`: gli altri scafi di `src/data/barche.json` hanno il
   loro collaudo in `test/barche.test.js`, che ne fissa il carattere in
   rapporto a quella e non in numeri assoluti.
2. **Non riscrivere `src/legacy/game.js`.** Si smonta un pezzo alla volta,
   con `npm test` verde a ogni passo: deve restare eseguibile a ogni commit.
3. **`src/sim/`, quando esisterà, non importa nulla da `render/` né da
   `ui/`** e resta puro: niente DOM, niente `Date`, niente `Math.random`.
4. **Ogni modifica va registrata in `CHANGELOG.md`** prima del commit: una
   voce sotto `## Non rilasciato`, in italiano, che dica il perché e non
   solo il cosa. Il formato è in testa a quel file.

## Dove sta il resto

Si carica da sé quando serve — non aprirli in anticipo "per sicurezza":

| Argomento | File |
|---|---|
| convenzioni di fisica, angoli, `world` | `.claude/rules/simulazione.md` |
| harness e golden test | `.claude/rules/collaudo.md` |
| pipeline delle carte | `.claude/rules/carte.md` |
| architettura di `game.js` | `src/legacy/CLAUDE.md` |

Da aprire a mano solo se il compito lo chiede: `docs/refactoring.md` (stato
e prossimi passi), `docs/deploy.md` (build e GitHub Pages).
