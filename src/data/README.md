Due cose diverse, nella stessa cartella.

`ionian.json` e le carte che verranno sono **generate** da
`tools/build-charts/build.py`: non si modificano a mano, si rigenerano con
`npm run charts` a partire dalla configurazione YAML.

`barche.json` è invece **scritto a mano** ed è la fonte di verità della
flotta: nessuno lo rigenera. I parametri di ogni scafo sono spiegati in
`barche.js`, e il carattere che devono produrre è collaudato da
`test/barche.test.js`.

`carte.js` e `barche.js` mettono gli uni e l'altro su `globalThis`, perché
`src/legacy/game.js` non può importarli da sé.
