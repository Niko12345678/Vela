# Pubblicare il gioco da interfaccia web di GitHub

Non serve installare né Git né Node: si fa tutto dal browser.

## 1. Scompatta l'archivio

Scompatta `vela-repo.tar.gz` sul tuo computer. Ti serve solo per avere i
file da caricare. Dentro trovi la cartella `vela-repo`.

## 2. Crea il repository

Su github.com: **New repository**.

- Nome: `vela` (o quello che preferisci, la configurazione si adatta da sola)
- **Public** — obbligatorio se hai un piano gratuito, altrimenti Pages non funziona
- **Non** spuntare "Add a README file": il repository deve nascere vuoto

## 3. Carica i file

Nella pagina del repository appena creato: **uploading an existing file**,
oppure **Add file → Upload files**.

Apri la cartella `vela-repo` e **trascina nel browser tutto il suo
contenuto** — non la cartella stessa, ma i file e le sottocartelle che
contiene. GitHub conserva la struttura delle sottocartelle.

Scrivi un messaggio di commit e premi **Commit changes**.

## 4. Aggiungi il workflow a mano

⚠️ **Questo è il passaggio che salta quasi sempre.** La cartella
`.github` comincia con un punto, quindi è nascosta: il sistema operativo
spesso non la mostra e il trascinamento la ignora. Va creata a mano.

**Add file → Create new file**. Nel campo del nome scrivi esattamente:

```
.github/workflows/deploy.yml
```

Man mano che digiti le barre, GitHub crea le cartelle da solo. Poi incolla
dentro il contenuto del file `deploy.yml` che trovi fra gli allegati, e
premi **Commit changes**.

Se non vedi `.gitignore` fra i file caricati, ricrealo allo stesso modo:
non è indispensabile, ma evita che ti finiscano dentro `node_modules` e
`dist` se un domani lavorerai in locale.

## 5. Accendi Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions**.

Non scegliere "Deploy from a branch": è l'altra modalità, e con questo
progetto non funziona.

## 6. Guarda partire il deploy

Vai nella scheda **Actions**. Vedrai il workflow in esecuzione con tre
passaggi in fila:

1. **test** — la golden test della simulazione. Se il polare della barca è
   cambiato, qui si ferma tutto e il sito non viene pubblicato.
2. **build** — la build di Vite
3. **deploy** — la pubblicazione

Due o tre minuti in tutto. Poi il sito è su:

```
https://TUO-UTENTE.github.io/vela/
```

## Se qualcosa non va

**Pagina bianca, console piena di 404** — è quasi sempre il percorso base.
La configurazione lo ricava dal nome del repository, quindi succede solo se
hai rinominato il repository dopo il primo deploy: rilancia il workflow da
**Actions → Run workflow**.

**Il workflow non parte proprio** — il file non è nel posto giusto. Deve
stare esattamente in `.github/workflows/deploy.yml`. Controlla dalla scheda
Code che la cartella `.github` esista.

**Actions dice "Pages is not enabled"** — manca il passaggio 5.

**Il job `test` fallisce** — apri il log: la golden test dice quale numero
si è mosso e di quanto. Se il file è quello che ti ho dato, non deve
succedere.

## Poi, per lavorare al codice

Dall'interfaccia web puoi modificare qualsiasi file (matita in alto a
destra) e ogni salvataggio rilancia test e deploy. Va benissimo per
ritoccare una costante o un testo.

Per il refactoring vero — smontare `src/legacy/game.js` verso `src/sim/` —
serve poter lanciare `npm test` a ogni passo, quindi conviene clonare il
repository in locale.
