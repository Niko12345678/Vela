# Build e deploy

`vite.config.js` ricava la `base` da `GITHUB_REPOSITORY` in build e la
lascia a `/` in sviluppo: è quello che evita la pagina bianca su GitHub
Pages sotto `/nome-repo/`. **Non scriverla a mano.**

Controllo veloce dopo una build: in `dist/index.html` i riferimenti agli
asset devono cominciare col nome del repository (`/vela/assets/…`) e non
con `/`.

## Workflow

`.github/workflows/deploy.yml` incatena `test → build → deploy`. La golden
test gira su ogni push e su ogni pull request; build e deploy sono limitati
a `main`. Se i test sono rossi il sito non viene pubblicato.

Da abilitare una volta sola nel repository:
**Settings → Pages → Source: GitHub Actions.** Non è una formalità: se la
sorgente resta *Deploy from a branch*, GitHub aggiunge un suo workflow
`pages build and deployment` che a ogni push pubblica la **radice del
repository** invece di `dist/`. I due deploy corrono insieme e vince
l'ultimo che finisce — di solito il suo, di pochi secondi — quindi il
workflow qui sotto diventa verde mentre il sito serve i sorgenti.

## Se il sito mostra il menù ma non il gioco

Sintomo preciso: la barra in alto c'è, ma le tendine **Barca** e
**Partenza** sono vuote e il canvas resta nero. Quelle due tendine le
riempie il JavaScript, mentre *Mappa* e *Seme* sono scritte a mano
nell'HTML: se vedi le seconde e non le prime, il bundle non è mai partito.

Guarda la rete (F12): se c'è un **404 su `/src/main.js`** — percorso senza
il nome del repository — allora la pagina servita è `index.html` **non
compilato**, cioè la radice del repository. Non è la cache e non è la
`base`: è la sorgente di Pages ancora impostata sul ramo. Sistemala come
sopra e rilancia da **Actions → Run workflow**.

`/src/main.js` esiste solo per `npm run dev`; nella build Vite riscrive
quella riga in `/nome-repo/assets/index-<hash>.js`. Vederla intatta in
produzione significa sempre che è stato pubblicato il sorgente.

## Se il sito esce bianco

Quasi sempre è il percorso base, e succede solo se il repository è stato
rinominato dopo il primo deploy: rilancia il workflow da
**Actions → Run workflow**.
