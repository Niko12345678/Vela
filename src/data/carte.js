/* Mette le carte generate su globalThis, dove il gioco le trova.

   Serve perché src/legacy/game.js non può avere import propri: la harness
   dei test lo esegue dentro una `new Function`, e lì una dichiarazione
   import è un errore di sintassi. Finché il gioco è un unico file, la
   carta gliela passa l'host — questo modulo nel browser, la harness nei
   test.

   Va importato PRIMA di game.js: gli import statici vengono valutati in
   ordine, quindi questo corpo gira per intero prima di quello del gioco. */
import ionio from "./ionian.json" with { type: "json" };

globalThis.VELA_CARTE = { ionio };
