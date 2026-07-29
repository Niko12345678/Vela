# Prompt di verifica per Claude Code

Apri il terminale nella cartella del repository e lancia `claude`.
Poi incolla questo:

---

Sei nel repository di "Vela", un simulatore di navigazione a vela.
Leggi `CLAUDE.md` e `README.md` prima di iniziare.

Il tuo compito adesso è **solo verificare che tutto sia a posto**. Non
refactorizzare, non riorganizzare, non "migliorare" niente di tua
iniziativa. Se trovi un problema, descrivilo e proponi la correzione, ma
applicala solo se te lo confermo.

Esegui questi controlli e riportami un esito per ciascuno:

**1. Il progetto si installa e i test passano**
- `npm install`
- `npm test` — devono passare 8 test su 8
- Se qualcuno fallisce, dimmi quale numero si è mosso e di quanto. Non
  toccare le tolleranze né le costanti fisiche per farlo passare.

**2. La build funziona ed è pronta per GitHub Pages**
- `npm run build`
- Controlla che in `dist/index.html` i riferimenti agli asset comincino con
  il percorso del repository (per esempio `/vela/assets/…`) e non con `/`.
  È l'errore che dà la pagina bianca su Pages.
- Verifica che `vite.config.js` ricavi la base da `GITHUB_REPOSITORY` e che
  in sviluppo resti `/`.

**3. Il workflow di deploy è corretto**
- `.github/workflows/deploy.yml` esiste ed è YAML valido
- I permessi includono `pages: write` e `id-token: write`
- Il job `build` dipende da `test`, e `deploy` da `build`: il sito non deve
  poter essere pubblicato se i test falliscono
- Non usa `npm ci` senza che ci sia `package-lock.json`

**4. La pipeline delle carte è riproducibile**
- `pip install -r tools/build-charts/requirements.txt`
- `npm run charts`
- `git diff --stat src/data/ionian.json` deve risultare **vuoto**: lo
  strumento deve rigenerare esattamente il file già committato. Se ci sono
  differenze, mostramele.

**5. Coerenza dei dati**
- Verifica quella che secondo `CLAUDE.md` è la principale incoerenza nota:
  `src/data/ionian.json` viene generato ma **non è letto da nessuno**, le
  coste sono ancora incorporate in `src/legacy/game.js` nel letterale
  `IONIO`. Confermami che è così e dimmi quanto pesa il letterale.
- Confronta i due: stesso numero di terre, porti e boe? Stessa
  georeferenziazione?

**6. Igiene del repository**
- `node_modules/` e `dist/` non devono essere tracciati da git
- Nessuna cartella vuota o file avanzato
- Nessuna chiave, credenziale o percorso assoluto della mia macchina nel
  codice

**7. Il gioco parte davvero**
- `npm run dev`, poi verifica che la pagina risponda e che non ci siano
  errori di caricamento dei moduli. Se hai modo di aprire un browser
  headless, controlla che la console sia pulita nei primi secondi.

Alla fine dammi un riepilogo secco: cosa è a posto, cosa no, e nell'ordine
in cui conviene sistemarlo. Se è tutto verde, dimmi solo quello.
