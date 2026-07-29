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
**Settings → Pages → Source: GitHub Actions.**

## Se il sito esce bianco

Quasi sempre è il percorso base, e succede solo se il repository è stato
rinominato dopo il primo deploy: rilancia il workflow da
**Actions → Run workflow**.
