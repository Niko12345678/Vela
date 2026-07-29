---
paths:
  - "src/**/*.js"
---

# Convenzioni della simulazione

- Angoli in **convenzione bussola**: 0 = Nord = su, 90 = Est = destra.
  `dv(a)` dà il versore, `angOf(x,y)` l'inverso, `norm(a)` normalizza in
  ±π. Un errore di segno in `norm` è già costato mezza giornata.
- `beta` è l'angolo del **vento apparente rispetto alla prua**, positivo se
  il vento viene da dritta.
- L'angolo d'attacco ottimo **non è costante**: ~27° di bolina, sale a 90°
  in poppa. La fascia verde degli strumenti è calcolata da `bestTrim()`,
  che massimizza la spinta in avanti sul modello vero. Non reintrodurre
  finestre a incidenza fissa.
- `game.pilot`: 0 barra libera, 1 richiamo al centro, 2 rotta bussola,
  3 angolo del vento. È già cambiata una volta e ha rotto due test.
- Scala geografica **1:6** (`SCALE_GEO`): le miglia mostrate sono quelle
  vere, il tempo reale sarebbe sei volte il cronometro, la velocità in nodi
  è invece quella effettiva della barca. Mescolare le unità ha già prodotto
  una media di 21 nodi.
- `world` ha sempre `{islands, marks, ports, shade, size, start, name}`,
  più `geo` sulle carte georeferenziate. Se aggiungi un campo, i mondi
  finti dei test vanno aggiornati o falliscono con `undefined`.
