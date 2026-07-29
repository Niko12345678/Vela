---
paths:
  - "test/**/*.js"
---

# Collaudo

`test/harness.js` esegue il file di gioco **vero** dentro Node contro un
canvas e un DOM finti: esercita anche disegno e interfaccia, non solo la
fisica. Da qui sono usciti tre bug che a leggere il codice non si vedevano
— lo smorzamento dell'incaglio applicato per sottopasso invece che per
unità di tempo, il `dt` negativo che mandava tutto in NaN in silenzio, un
ascoltatore registrato su una `const` prima della sua dichiarazione.

`runInGame(codice)` concatena stub del DOM + carte + `game.js` + driver +
il tuo codice dentro una `new Function`: la sonda vede **tutte le variabili
di modulo del gioco** (`boat`, `game`, `world`, `windBase`, `physics`,
`windAt`, …) come se fosse scritta in fondo al file. Si chiude chiamando
`report({...})`.

Da qui discende un vincolo: **`game.js` non può contenere `import`**, che
in una `new Function` è errore di sintassi. Le carte gliele passa la
harness su `globalThis.VELA_CARTE`, come fa `src/data/carte.js` nel
browser.

Tre modi di far avanzare il tempo, da tenere distinti:

- `tick(n)` / `seconds(s)` — fotogrammi veri via `requestAnimationFrame`
  finto: passa dal ciclo `frame()`, quindi risente di `timeScale`, pause e
  pannelli aperti. È l'unico che esercita anche il disegno, e va sbloccato
  a mano: `helpEl.classList.remove("on"); tut.on = false;`.
- `steady(twaDeg, {...})` (dalla stringa `STEADY`) — porta la barca a
  regime a rotta bloccata con `physics(0.02)` in un ciclo e restituisce i
  nodi. È la base dei test sul polare.
- `physics(1/120)` chiamata in coppia, con `trimWindows()`,
  `autopilot(1/60)` e `game.t += 1/60` a mano: replica il sottopasso del
  ciclo reale quando serve controllo fine.

Quasi tutti i test si costruiscono un `world` finto invece di caricare la
carta, con una boa a `1e9` per tenerla fuori dai piedi.
