# Diario delle modifiche

Una voce per ogni modifica, aggiunta **prima** del commit, sotto
`## Non rilasciato`. In italiano, e dica il perché, non solo il cosa.
Categorie: `Aggiunto`, `Cambiato`, `Corretto`, `Rimosso`.

Quando questo file supera le 50 righe, sposta le voci più vecchie in
`docs/changelog/AAAA-MM.md` e lascia qui solo le recenti.

## Non rilasciato

### Cambiato
- La carta del Ionio viene ora da `src/data/ionian.json` invece che dal
  letterale `IONIO` incorporato in `game.js` (~75 KB, il 40% del file):
  finché il gioco leggeva una copia congelata, rigenerare le carte non
  serviva a niente e aggiungere un'area era impossibile. `game.js` non può
  importarla da sé — la harness lo esegue in una `new Function`, dove
  `import` è errore di sintassi — quindi gliela mette su `globalThis`
  l'host: `src/data/carte.js` nel browser, la harness nei test.
  **Il gioco cambia**: la partenza si sposta da `{1544,-4125}` a
  `{670,-3873}` (porto più vicino Spartochori invece di Vathy Meganisi) e
  i porti passano da 16 a 17, perché il JSON è una generazione più recente
  del letterale. Le soglie della golden test reggono senza ritocchi.
- Le istruzioni per Claude Code sono ora un albero: `CLAUDE.md` in radice
  tiene solo comandi e regole non negoziabili, il resto sta in
  `.claude/rules/` con `paths:` e in `src/legacy/CLAUDE.md`, che si
  caricano solo quando si lavora sui file a cui si riferiscono. Gli
  `@import` sono stati evitati di proposito: espandono il file in contesto
  all'avvio, quindi non risparmiano token.
- Il repository è un albero di lavoro normale: i file erano dentro
  `vela-repo.tar.gz` e in radice non c'era nemmeno un `package.json`,
  quindi niente `npm test`, niente diff leggibili, niente CI sul codice
  vero.

### Aggiunto
- Questo diario, e la regola di tenerlo aggiornato a ogni modifica.
- `docs/refactoring.md` con i numeri della deriva fra il letterale `IONIO`
  e `src/data/ionian.json`: decide come va fatto il primo passo del
  refactoring, perché sposta il punto di partenza e tocca la golden test.

### Rimosso
- `vela-repo.tar.gz`, che duplicava ogni file versionato e sarebbe andato
  subito alla deriva. Recuperabile da `05c5ff7`.
- Il `deploy.yml` di radice, copia esatta di
  `.github/workflows/deploy.yml`, tenuta lì solo perché il trascinamento
  nel browser salta le cartelle nascoste.
- `ISTRUZIONI-github.md` e `PROMPT-claude-code.md`: descrivevano il
  caricamento a mano dell'archivio dall'interfaccia web, flusso che non
  esiste più.
