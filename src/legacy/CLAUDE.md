# `game.js` — il gioco ancora in un pezzo solo

~2100 righe, sezioni separate da righe `══════`, nell'ordine: utilità →
costanti `K` → mondo (`mkIsland`, `landDepth`, `buildShade`, `genWorld`) →
stato (`boat`, `game`, vento) → fisica
(`sailAero`, `aeroC`, `bestTrim`, `polarSpeed`, `trimWindows`, `physics`,
`autopilot`) → tratteggi del vento → input → disegno → strumenti →
interfaccia → rotta pianificata → carta nautica → giornale di bordo →
carriera → salvataggio portatile → interfaccia della carriera →
tutorial → ciclo.

Quattro cose da sapere prima di toccarlo:

- **`frame(now)`**, in fondo al file, è l'unico punto in cui il tempo
  avanza. `dt` è ritagliato in `[0, 0.05]` (il commento sul negativo è la
  cicatrice di un bug vero), moltiplicato per `timeScale`, e la fisica gira
  a sottopassi: `n = max(2, ceil(sdt/0.02))`. Ogni smorzamento scritto
  dentro `physics` va quindi espresso **per unità di tempo**, mai per
  sottopasso: è l'errore che ha bloccato la barca sugli scogli.
- **Il ciclo si ferma da solo** quando c'è un pannello aperto (aiuto,
  carta, giornale, conferma) o `game.paused`.
- **`windAt(x,y)`** è chiamata centinaia di migliaia di volte per
  fotogramma fra fisica e tratteggi, e un test ne misura il costo (< 900 ms
  per 200 k campioni). Non metterci dentro allocazioni.
- **Il salvataggio è a strati** (`store`): archivio degli artefatti se
  esiste, altrimenti `localStorage`, altrimenti memoria di sessione.
  Nessuno dei tre è garantito: non dare per scontato che `LOG` o `CARRIERA`
  sopravvivano. Nessuno dei tre attraversa i dispositivi, ed è il motivo
  per cui esiste il codice di salvataggio portatile (`codificaStato` /
  `decodificaStato`): tutto quello che aggiungi allo stato persistente deve
  essere serializzabile in JSON e passare da `carrieraSana()` in entrata,
  perché quel testo lo può aver scritto chiunque.

**Niente `import` qui dentro.** La harness esegue questo file dentro una
`new Function`, dove una dichiarazione `import` è un errore di sintassi:
tutti e 8 i test diventerebbero rossi in un colpo. Quello che serve da
fuori lo passa l'host su `globalThis` — è così che arriva la carta
(`IONIO`, da `src/data/carte.js` o dalla harness). Vedi
`docs/refactoring.md`: sciogliere questo nodo è il primo passo verso
`src/sim/`.
