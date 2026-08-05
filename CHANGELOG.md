# Diario delle modifiche

Una voce per ogni modifica, aggiunta **prima** del commit, sotto
`## Non rilasciato`. In italiano, e dica il perché, non solo il cosa.
Categorie: `Aggiunto`, `Cambiato`, `Corretto`, `Rimosso`.

Quando questo file supera le 50 righe, sposta le voci più vecchie in
`docs/changelog/AAAA-MM.md` e lascia qui solo le recenti.

## Non rilasciato

### Aggiunto
- **La rotta consigliata: da che parte si va, col vento che c'è.** I bordi
  rispondono per *una* tratta e a mare libero, ma la domanda di chi impara
  a pianificare è più grande — «sono a Nydri, voglio andare a Fiskardo, il
  vento viene da nordovest: da che parte ci vado?» — e finora la risposta
  era guardare la carta e tirare a indovinare. Ora si sceglie il porto in
  **Arrivo**, nel menù, e `U` traccia una rotta a punti che prende il posto
  della spezzata a matita: da lì si comporta come lei, si corregge punto
  per punto, e `V` continua a dire dove virare sulla tratta in corso. Sono
  due domande diverse e restano due comandi: *da che parte passo* e *dove
  viro*.
  Il conto è un Dijkstra su una griglia di nodi in mare dove il costo di un
  lato non è la lunghezza ma il **tempo**: la stessa distanza costa il
  doppio presa di bolina e costa moltissimo dentro l'ombra di vento di
  un'isola. È da lì che escono le rotte che un marinaio riconosce — passare
  al vento della terra e non sottovento, allargare per andare a prendere il
  vento vero — senza che nessuna di quelle regole sia scritta nel codice.
  Il tempo di una tratta è lo stesso che calcolano i bordi: sotto l'angolo
  di bolina è la VMG diviso il coseno, cioè lo stesso parallelogramma, e un
  collaudo lo verifica angolo per angolo. Per questo a mare libero, anche
  controvento, il consiglio resta **una linea sola**: gli zigzag non sono
  punti di rotta, e chiederli è il mestiere di `V`.
  Tre scelte che non sono grafica. Si pianifica sul **vento medio**, con le
  raffiche spente per la durata del conto: una rotta pensata sulle raffiche
  di questo secondo sarebbe sbagliata il secondo dopo, mentre le ombre
  stanno ferme finché sta ferma la direzione del vento — se il vento gira,
  il consiglio si richiede. I punti che restano sono **pochi**: si uniscono
  due tratte in una ogni volta che la linea dritta è libera e non costa di
  più, quindi un punto che sopravvive ha una ragione, o una terra da girare
  o del vento da andare a prendere. E il vento si arrotonda al metro al
  secondo, perché ogni valore nuovo costa una ricerca di VMG, cioè settanta
  equilibri velici: il primo consiglio riempie quelle tabelle e ci mette
  mezzo secondo a carta ferma, i successivi sono immediati.
  Senza un porto scelto il bersaglio è, in ordine, quello dell'incarico che
  si ha a bordo, l'ultimo punto della rotta già tracciata, il cursore sulla
  carta. Come tutto il resto del tavolo da carteggio, non governa niente.
- `test/consiglio.test.js`: il tempo della griglia confrontato con quello
  dei bordi su tre venti e otto angoli, il mare libero che non produce
  punti inutili nemmeno in bolina, l'isola che si gira restando al largo
  della costa e la rotta che torna dritta quando la si toglie, il buco di
  vento senza terra attorno che fa deviare la rotta e le fa guadagnare
  tempo, l'ordine dei bersagli, la rotta che finisce in `piano` senza
  muovere la barca e smette di essere "consigliata" appena la si tocca, e
  cinque traversate vere del Ionio che passano in acqua e si calcolano in
  fretta.
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
- **La rotta consigliata adesso bordeggia, invece di puntare dentro il
  vento.** Era una scelta di progetto sbagliata, non un caso limite: avevo
  deciso che il consiglio rispondesse solo alla domanda *da che parte passo*
  e che i bordi li chiedesse `V`, così una tratta sopravvento restava una
  linea dritta. Ma la rotta tracciata è quella che poi si segue: seguirne
  una che passa sotto l'angolo di bolina vuol dire fileggiare e fermarsi in
  panne. Una rotta che non si può navigare non è un consiglio.
  Ora le tratte che la barca non può tenere si aprono in bordi veri, con i
  punti di virata dentro la spezzata, e il messaggio dice quante virate e
  quante strambate sono. Gli angoli sono quelli di massima VMG di `V`, ma i
  bordi non escono dal parallelogramma: quello dà una virata sola col
  vertice a miglia di lato, che al largo va bene e in un canale è terra. Si
  bordeggia come si bordeggia davvero, un bordo per volta, tenendo la mura
  finché si arriva alla **layline** dell'altra o finché c'è acqua — e da lì
  vengono da soli i bordi lunghi al largo, quelli corti dentro un canale (un
  canale da 600 m si risale a sedici virate) e le mure sbilanciate quando la
  terra è da una parte sola. Un bordo si chiude un po' prima della costa e
  non contro: tirare fino allo scoglio vuol dire ritrovarsi in fondo a una
  baia senza spazio per virare da nessuna delle due parti.
  Dove nemmeno così si passa — un canale cieco col vento in faccia — la
  tratta resta dritta ed è **dichiarata**: "attenzione: una tratta è troppo
  stretta al vento". Su 153 traversate del Ionio con tre venti diversi
  càpita a tre, ed è il posto dove in mare vero si accende il motore. Le
  uscite dai porti non contano: sotto i 400 m è una manovra, non una rotta.
- **La rotta consigliata non taglia più le penisole.** La griglia del
  consiglio guarda i nodi nei loro punti, e una lingua di terra più stretta
  della maglia — che su una traversata lunga arriva ai trecento metri —
  passava fra una fila di nodi e l'altra senza farsi vedere: dodici coppie
  di porti su 272 uscivano con una tratta sopra la terra. Ora ogni salto
  della griglia si verifica per intero. Il controllo che serve quasi sempre
  è gratis: di ogni nodo si tiene la distanza dalla costa, e se quella dei
  due capi copre la lunghezza del salto in mezzo non ci può essere niente.
  Solo dove non basta — vicino a una costa, cioè dove la domanda è vera —
  la terra si va a guardare campionando la congiungente. Le 272 traversate
  ora passano tutte in acqua, con almeno 109 m di distanza dalla costa, e
  costano complessivamente il 25% in più di conto.
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
