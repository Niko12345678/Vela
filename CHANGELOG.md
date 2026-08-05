# Diario delle modifiche

Una voce per ogni modifica, aggiunta **prima** del commit, sotto
`## Non rilasciato`. In italiano, e dica il perché, non solo il cosa.
Categorie: `Aggiunto`, `Cambiato`, `Corretto`, `Rimosso`.

Quando questo file supera le 50 righe, sposta le voci più vecchie in
`docs/changelog/AAAA-MM.md` e lascia qui solo le recenti.

## Non rilasciato

### Aggiunto
- **I bordi: dove virare per arrivare dove vuoi andare col vento che c'è.**
  La carta diceva già rilevamento e distanza di ogni tratta, ma erano i due
  numeri di una linea che spesso la barca *non può tenere*: se il punto sta
  sopravvento, "229° per 33 nm" è un'informazione che non si può usare, e
  restava tutto a occhio. `V`, sulla carta, accende la pianificazione dei
  **bordi**: la fetta in cui la diretta non conviene, la spezzata da fare
  davvero — un bordo per mure, con la croce dove si vira o si stramba —
  l'altra coppia possibile in sordina, e un riquadro con mure, rilevamento
  e miglia di ogni bordo, il totale, quanto si allunga e quanto ci vuole al
  cronometro. Il bersaglio è il punto di rotta attivo, o il cursore se non
  c'è una rotta: si passeggia sulla carta e il piano si rifà.
  Gli angoli non sono costanti scritte a mano: sono quelli di **massima
  VMG** sul polare teorico della barca, lo stesso `polarSpeed` del
  giornale, quindi cambiano con lo scafo e con il vento — la barca da
  regata stringe più del gozzo, e con poco vento tutte poggiano. Il polare
  costa troppo per rifarlo a ogni fotogramma, e sta in due memorie a chiave
  barca+vento.
  Due scelte che non sono grafica. Primo: sottovento la diretta *si tiene*,
  si va solo più piano, quindi il piano confronta i tempi e se strambare
  non guadagna almeno l'1% consiglia la diretta invece di disegnare uno
  zigzag inutile — con randa e fiocco in poppa piena è quasi sempre così.
  Secondo: un bordo che finisce sulla costa viene riconosciuto e, potendo,
  si sceglie l'altra coppia; se non si passa da nessuna parte l'avviso
  resta, che è il momento di segnare un punto in mezzo. A parità, si parte
  dal bordo lungo: costa uguale e tiene la barca vicino alla congiungente.
  Come la rotta a matita, i bordi non governano niente.
- `test/bordi.test.js`: la rotta che si tiene e resta una linea sola, la
  spezzata che chiude sul bersaglio al millimetro, le due opzioni che
  costano uguale, l'angolo che è davvero un massimo di VMG, le mure del
  piano confrontate col `beta` che sentirebbe la barca a quella prua, il
  bordo lungo per primo, l'isola che sposta la scelta e quella che chiude
  tutte e due le strade, la regola dello strambare che paga su tutta la
  flotta, e la carta che disegna tutto senza NaN e senza muovere la barca.

### Corretto
- **Nei campi del menù la tastiera scrive, non comanda.** Scrivere un seme
  era impossibile: ogni lettera era anche una scorciatoia, e "mantova"
  faceva sparire il menù sulla M, rigenerava la carta sulla N, apriva la
  carriera sulla I. Ora l'ascoltatore della tastiera si tira indietro
  quando il fuoco è su un campo da scrivere (testo, area di testo, elenco a
  tendina, contenuto modificabile), frecce comprese, che lì servono a
  muovere il cursore. Caselle, rotelle e cursori restano fuori dalla
  guardia: sopra di loro non si scrive, e i tasti del gioco devono
  continuare a rispondere.

### Cambiato
- **Il seme di partenza non è più "mantova".** Un valore fisso nel campo
  voleva dire che la prima carta casuale era sempre la stessa per tutti, e
  che chi non lo cambiava non capiva a cosa servisse quella parola. Adesso
  il campo parte vuoto (`placeholder` "a caso") e il gioco ci scrive dentro
  un seme pescato a caso al primo mondo che serve, così resta sotto gli
  occhi la parola da riusare per ritrovare quell'arcipelago. Le strade che
  portano a una carta nuova — avvio, tasto `N`, pulsante "Nuova mappa",
  cambio carta — passano ora da `semeCorrente()` / `semeNuovo()` invece di
  ripescare a mano il campo con un `||"vela"` di ripiego.

Le voci precedenti stanno in [`docs/changelog/2026-08.md`](docs/changelog/2026-08.md).
