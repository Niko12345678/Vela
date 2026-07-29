# `game.js` — il gioco ancora in un pezzo solo

~1900 righe, sezioni separate da righe `══════`, nell'ordine: utilità →
costanti `K` → mondo (letterale `IONIO`, `mkIsland`, `landDepth`,
`buildShade`, `genWorld`) → stato (`boat`, `game`, vento) → fisica
(`sailAero`, `aeroC`, `bestTrim`, `polarSpeed`, `trimWindows`, `physics`,
`autopilot`) → tratteggi del vento → input → disegno → strumenti →
interfaccia → carta nautica → giornale di bordo → tutorial → ciclo.

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
  Nessuno dei tre è garantito: non dare per scontato che `LOG` sopravviva.

Il letterale `IONIO` pesa ~75 KB, il 40% del file, ed è il primo candidato
all'estrazione: vedi `docs/refactoring.md`.
