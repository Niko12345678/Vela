# Diario delle modifiche

Una voce per ogni modifica, aggiunta **prima** del commit, sotto
`## Non rilasciato`. In italiano, e dica il perché, non solo il cosa.
Categorie: `Aggiunto`, `Cambiato`, `Corretto`, `Rimosso`.

Quando questo file supera le 50 righe, sposta le voci più vecchie in
`docs/changelog/AAAA-MM.md` e lascia qui solo le recenti.

## Non rilasciato

### Aggiunto
- **Selettore della barca nel menù**: quattro scafi invece di uno. Finché
  `K` è stato un letterale dentro `game.js`, "la barca" e "la simulazione"
  erano la stessa cosa e ogni idea di progressione — o anche solo di
  provare un altro scafo — era impossibile senza toccare la fisica. Ora la
  flotta sta in `src/data/barche.json`, `setBarca()` la scambia e il gioco
  resta identico a prima finché non cambi barca.
  - **Gozzo a vela latina** (6,5 m): scarroccia il 21,7° di bolina contro
    i 12,7° dello sloop, prende lo spunto in 2,2 s invece di 2,9, vira in
    14 s. Una sola mano di terzaroli, niente spinnaker, pesca 90 cm.
  - **Sloop 11 m**: la barca di sempre, numeri **invariati**. Resta il
    riferimento della golden test.
  - **Dodici da regata**: punta a 5,0 nodi contro 3,4, accelera in 1,2 s,
    ma è tenera — con 31 nodi si corica al punto di perdere contro il
    cutter (10,1 contro 10,4 nodi).
  - **Cutter 15 m**: con 6 nodi di vento non batte lo sloop, con 31 lo
    stacca del 20%. Una virata di 90° gli costa 52 s contro i 9 dello
    sloop. Pesca 3,8 m.
  I numeri non sono stati indovinati: sono usciti da quattro giri di
  misura con `steady()` sulla harness. Il primo tentativo aveva un cutter
  che **non riusciva a virare** — orzava nel vento prima di prendere
  abbrivio e restava in panne a 0,27 nodi — risolto spostando il centro
  velico a proravia, che per un cutter è anche la cosa fisicamente giusta.
- `test/barche.test.js`: collauda il **carattere** di ogni scafo sempre in
  rapporto allo sloop (chi scarroccia di più, chi accelera prima, chi non
  vira), mai in numeri assoluti, così la taratura resta libera finché la
  storia della barca resta quella dichiarata. Più un controllo che ogni
  barca abbia tutte le costanti che la fisica legge: una che manca non
  esplode, si propaga come NaN e la barca sparisce dallo schermo in
  silenzio.

### Cambiato
- Tre valori scritti a mano dentro `physics()` sono diventati parametri
  della barca, **a comportamento identico** per lo sloop (golden test
  verde prima e dopo): la rigidezza `K.STIFF` — il `9000` che era ripetuto
  sia in `physics` sia in `polarSpeed` — il `K.PESCAGGIO` al posto della
  soglia di incaglio fissa a `-2`, e le mani di terzaroli, che ora sono
  `K.REEF.length` invece del `3` cablato nel tasto **X**.
- `askConfirm()` accetta una richiamata anche per l'annullamento: senza,
  annullando il cambio barca il menù restava a indicare uno scafo che non
  era quello al timone.
- Il tutorial riporta sulla barca base prima di cominciare: apre dicendo
  "undici metri, randa e fiocco" e ha un passo che chiede di issare lo
  spinnaker, quindi sul gozzo mentiva alla prima riga e diventava
  impossibile all'undicesima.

---

Le voci precedenti sono in [`docs/changelog/2026-07.md`](docs/changelog/2026-07.md).
