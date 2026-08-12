# Diario delle modifiche

Una voce per ogni modifica, aggiunta **prima** del commit, sotto
`## Non rilasciato`. In italiano, e dica il perché, non solo il cosa.
Categorie: `Aggiunto`, `Cambiato`, `Corretto`, `Rimosso`.

Quando questo file supera le 50 righe, sposta le voci più vecchie in
`docs/changelog/AAAA-MM.md` e lascia qui solo le recenti.

## Non rilasciato

### Aggiunto
- **Il giorno e la notte si vedono.** La luce segue l'ora di bordo:
  all'alba il mare si scalda d'arancio, a mezzogiorno la luce è piena, al
  tramonto vira al rosso e poi al viola del crepuscolo, di notte resta un
  blu profondo. Segue l'**orologio** e non la casella del meteo, perché il
  giorno e la notte ci sono comunque, anche col vento fermo — ed è la metà
  del ciclo che si chiedeva.
  Due scelte che non sono grafica. La velatura si stende **sopra il mare e
  sotto gli strumenti**: vela le terre, i tratteggi del vento e la barca,
  perché è l'aria che ci sta in mezzo, ma lascia gli strumenti a piena
  luce, che è come stanno in barca di notte e l'unico modo perché restino
  leggibili. E il nero pieno non arriva mai: al culmine della notte resta
  una velatura al 38 %, perché una schermata nera non è un gioco.
- **La previsione delle prossime dodici ore**, in fondo alla carta
  nautica: una freccia per ogni ora che verrà, con direzione e forza, e le
  ore ventose in evidenza. **Non è una stima** — è la stessa formula del
  vento valutata più avanti nel tempo, quindi quello che mostra è
  esattamente quello che si troverà. Un collaudo lo verifica nel modo più
  diretto che ci sia: legge la previsione, poi lascia scorrere il tempo
  fino a quell'ora e controlla che il vento sia identico, non «vicino».
  È il regalo nascosto dell'aver preteso che il meteo fosse una funzione
  pura del cronometro invece di qualcosa che si integra: la previsione non
  è costata una riga di motore, solo il disegno. Serve dove si decide
  davvero — sulla carta, guardando se conviene partire adesso o aspettare:
  all'alba si vede già arrivare il rinforzo del pomeriggio, e una tratta di
  bolina conviene farla prima che il vento giri.
- `test/meteo.test.js` guadagna tre prove: la previsione confrontata con
  quello che poi succede, ora per ora; la giornata che si vede arrivare
  dalla previsione dell'alba; e il cielo che segue l'ora senza scatti fra
  una mezz'ora e l'altra e senza mai spegnere del tutto la luce.

### Aggiunto
- **Il vento vive con le ore — «Meteo vivo» nel menù.** Si alza col sole,
  culmina nel primo pomeriggio, cala la sera e resta leggero di notte, e
  intanto ruota: la brezza col sole nell'arco della giornata, il regime più
  lentamente di giorno in giorno. Con 7 m/s impostati si va dagli 8,6 nodi
  dell'alba ai 20 del pomeriggio, con una media di giornata a 12,9 — il
  95 % del cursore, che quindi continua a dire più o meno quello che
  promette, ma da adesso come **riferimento della giornata** e non come il
  vento di quel momento. È il motivo per cui conviene guardare l'ora prima
  di partire: la stessa traversata alle sei del mattino e alle tre del
  pomeriggio non è la stessa traversata.
  **Nasce spento**, e il valore predefinito è scritto nel codice invece che
  letto dalla casella apposta: il DOM finto del collaudo risponde
  `checked = true` a qualunque elemento, e un default preso di lì tornerebbe
  acceso in tutti i test. Spento, la catena è l'identità — verificato
  confrontando direzione e velocità con la formula di sempre scritta a mano
  nel collaudo, cifra per cifra — e infatti **la golden test non ha dovuto
  cambiare una riga**.
  Non è un tiro di dadi: niente `Math.random`, tutto è funzione del
  cronometro e del seme, quindi la stessa parola rifà la stessa giornata e
  un collaudo può verificarla. Il costo per campione è zero, perché si
  calcola dentro la cache del vento di fondo, una volta per fotogramma:
  misurato, 200 000 campioni costano quanto prima.
- `test/meteo.test.js`: spento identico alla formula di sempre cifra per
  cifra, la brezza col verso e il culmine giusti, la media della giornata
  vicina al cursore, la direzione che gira quanto basta a farsi notare ma
  non tanto da rendere irriconoscibile la carta, stessa parola stessa
  giornata, il costo per campione, il giro salva-e-riprendi, e — il più
  utile di tutti — **il ritmo di gioco che non cambia il risultato col
  meteo acceso**, che è il modo di accorgersi se un giorno il meteo
  smettesse di essere una funzione del tempo per diventare qualcosa che si
  integra passo per passo.

### Corretto
- **Le fasi del regime entrano nella sessione invece di essere ridedotte
  dal seme.** Sono due numeri, e ricavarli dal seme era un filo teso fra
  due cose che possono divergere: la carta è costruita con una parola, il
  campo di testo ne mostra un'altra, e la giornata ripresa non era più
  quella di prima. L'ha trovato il collaudo del ricaricamento, non il
  ragionamento.

### Aggiunto
- **L'ora di bordo.** Nel riquadro di velocità e vento compare che ora è e
  in che fase sta il cielo — alba, giorno, tramonto, notte — e dal secondo
  giorno anche quale. Non è un orologio a parte e non introduce una seconda
  scala del tempo, che sarebbe il modo migliore di farle litigare: è la
  stessa di `nm` e di `realT`, cioè quella che il gioco ha già. La carta è
  ridotta 1:6, quindi **un secondo di cronometro vale sei secondi di
  orologio**, ed è lo stesso conto per cui il giornale di bordo dice «5 h»
  di una traversata durata cinquanta minuti al cronometro. Se avessi scelto
  una durata del giorno a occhio, una traversata di trenta miglia avrebbe
  attraversato tre albe mentre il giornale ne dichiarava cinque ore.
  Ne viene un giorno da quattro ore di gioco a ritmo 1×, due a 2×, un
  quarto d'ora a 16×: una traversata copre qualche ora della giornata, e si
  può partire col fresco del mattino e arrivare che il sole cala. Si salpa
  alle 08:00.
  È una **funzione pura del cronometro**: niente da integrare, niente che
  possa scivolare, e a parità di cronometro sempre la stessa ora comunque
  ci si sia arrivati. Serve così perché è la base su cui poggeranno la
  brezza che gira con le ore e le correnti di marea, che devono restare
  ripetibili.
- `test/orologio.test.js`: la scala verificata sui suoi numeri (14 400 s di
  cronometro per giorno, dieci minuti per ogni ora di bordo), l'ora che non
  dipende da come ci si è arrivati, il ritmo di gioco che accelera
  l'orologio senza sfasarlo, il giro completo salva-e-riprendi, e una
  sessione ostile che non deve mandare l'orologio fuori giri.

### Corretto
- **La sessione salva anche il vento.** Non l'aveva mai fatto: finché la
  direzione era una costante scritta nel file non si notava, ma ricaricare
  la pagina significava comunque ritrovarsi la bolina da rifare. Ora forza
  e direzione stanno nella fotografia della partita insieme al cronometro,
  e come tutto quello che si rilegge da fuori passano da un filtro in
  entrata — il vento dentro la scala del cursore, l'ora di partenza dentro
  le ventiquattr'ore, il cronometro mai negativo — perché quel testo lo può
  aver scritto chiunque.

### Cambiato
- **Il vento di fondo si calcola una volta per fotogramma, non a ogni
  campione.** Le due sinusoidi lente sulla direzione e quella sulla
  velocità non dipendono da dove sei: dipendono solo dal tempo. Stavano
  però dentro `windAt`, che fra fisica e tratteggi viene chiamata
  centinaia di migliaia di volte per fotogramma, e quindi ricalcolavano
  tre seni identici a ogni campione per ottenere sempre lo stesso numero.
  Ora si tengono da parte finché il tempo o le manopole del vento non si
  muovono: tre confronti al posto di tre `Math.sin`. Con le raffiche
  accese il campo di vento passa da 160 a 136 ms per 200 000 campioni.
  I valori non cambiano di un bit — verificato campionando direzione e
  velocità a quattro tempi e tre posizioni, e confrontando le cifre a una
  a una.
  La cache sta accanto a `windAt` e non dentro `updateWind` apposta:
  `windAt` la chiama anche chi il ciclo non lo fa girare — il consiglio di
  rotta, il collaudo — e deve dare la risposta giusta lo stesso, senza che
  nessuno debba ricordarsi di aggiornare prima qualcos'altro. È anche il
  posto dove andrà il vento che cambia con le ore, che è il motivo per cui
  quel gradino si fa adesso.

### Aggiunto
- **`O`: la manovra assistita, e l'indicatore che dice se si passa.**
  Virare era la cosa più difficile da azzeccare, e il motivo è che non
  c'era modo di *sapere* se sarebbe riuscita: si provava, e se l'abbrivio
  non bastava ci si ritrovava in panne senza aver capito cosa si era
  sbagliato. Ora un tasto solo porta la barca dall'altro bordo — vira se si
  sta stringendo il vento, stramba se si sta scendendo — e accanto alla
  rosa dei venti c'è una spia che dice, **prima** di provarci, se con
  questo abbrivio il vento si passa.
  Non è un aiuto magico e non è un secondo autotimoniere: scrive soltanto
  su barra e scotte, cioè esattamente quello che ha sotto mano chi governa,
  e la fisica non sa nemmeno che esiste. Chi vuole virare a mano fa come
  prima; questo è il timoniere esperto che ti fa vedere come.
  Tre cose la tengono onesta. **Rifiuta quando non si passa**, perché un
  aiuto che ti porta in panne è peggio di nessun aiuto: la soglia è il 60 %
  della velocità di bolina che il polare dà con quel vento e quella barca,
  ed è una frazione e non un numero fisso perché il caso vero lo chiede —
  misurato sullo sloop, con 7 m/s si passa perfino a un nodo (in 36
  secondi), mentre con 14 m/s a tutto ferro sotto i tre nodi **non si passa
  affatto**. **Sa rimediare**: se la prua si pianta nel vento mette il
  fiocco a collo da sola e lo libera quando è caduta, che è la manovra che
  il messaggio della panne suggeriva a parole. E **molla appena tocchi
  qualcosa** — barra, scotte, autotimoniere, o `O` di nuovo — perché chi
  tocca comanda, anche a metà virata.
  Misurata su tutta la flotta: la virata riesce fra gli 8,8 e i 25 secondi
  dal gozzo al cutter, con 5, 7 e 12 m/s, e la barca esce sempre con
  l'abbrivio addosso. Il tasto è anche nella pulsantiera a dito, come
  *Vira*.
  La spia non costa niente di nuovo: la soglia la sapeva già il polare, e
  finora non la diceva a nessuno.
- `test/virata.test.js`: la manovra su quattro barche e tre venti, la
  strambata che non è una virata, il rifiuto con la barca ferma e con 27
  nodi a tutto ferro, i quattro modi di annullarla, e l'indicatore che deve
  dire sempre la stessa cosa che poi farà la manovra.

### Corretto
- **Lenti e stretti al vento, ora la barra serve a qualcosa.** C'era una
  sproporzione nascosta fra il timone e le vele. Rallentando, la pala
  perdeva presa in fretta — è giusto, è l'acqua che le scorre sopra — ma le
  vele no: il loro momento d'imbardata aveva un pavimento, e il conto era
  fatto in modo da renderlo *relativamente più forte* man mano che la barca
  si fermava. Dimezzando l'andatura il timone perdeva un fattore sei e le
  vele uno e mezzo. Sotto i due decimi di metro al secondo la barra a tutta
  banda non pareggiava più nemmeno l'orza delle vele: da lì non si tornava,
  e non perché si fosse sbagliata la manovra, ma perché non ce n'era una
  giusta. Ora anche le vele mollano la presa quando la barca si ferma.
  Misurato sullo sloop, partendo lenti col timone tutto a poggiare: da 0,6
  nodi a 30° dal vento si torna a 2 nodi in 10,9 s invece di 17,0; da 0,4
  nodi a 25° in 17,7 s invece di 37,9; con vento fresco in 4,1 s invece di
  10,6. E da 0,2 nodi a 20°, dove **prima non si recuperava affatto**, ora
  si recupera in 36,6 s.
  Il fattore vale esattamente 1 sopra i 0,9 m/s, e lì sta tutto quello che
  il collaudo misura: il minimo in ogni scenario della golden test è 1,007,
  quindi non si è mosso un decimale di nessun valore atteso. Quello che
  resta invariato è anche il punto: con la prua nel vento e **la barra al
  centro** non se ne esce lo stesso, perché non c'è nessuna barra che
  vinca. La panne continua a chiedere una manovra, solo non è più una buca
  in cui si cade senza aver sbagliato niente.
- `test/panne.test.js` guadagna il recupero col timone da quattro
  situazioni di quasi-stallo, con i tempi di prima scritti accanto a quelli
  di adesso.
- **Con poco vento la bolina non si poteva fare, e la colpa era
  dell'autotimoniere.** Chi partiva da un porto con aria leggera e provava a
  risalire il vento si ritrovava, dopo un minuto, a mezzo nodo e quaranta
  gradi fuori rotta, senza aver sbagliato niente: bastava questo a far
  sembrare che di bolina si andasse in panne per un nonnulla. Il meccanismo
  era una trappola che si chiudeva da sola. `boat.stuck` — il cronometro
  della panne — cresceva ogni volta che la barca stava sotto i 0,35 m/s con
  la prua entro 52° dal vento, e una barca che *parte da ferma* di bolina ci
  sta dentro per qualche secondo mentre accelera, senza essere in panne per
  niente. A due secondi il pilota si disinseriva **e azzerava la barra**;
  da lì la barca orzava piano fino a spegnersi, e più era pesante peggio
  finiva. Misurato sullo sloop: a 4 m/s si finiva a 0,04 nodi, a 5 m/s a
  0,34, a 6 m/s a 0,59 — contro l'1,10, l'1,42 e l'1,75 che il polare le dà.
  Ora sono 2,00, 2,54 e 3,13 nodi, in rotta entro cinque gradi.
  Tre strette, tutte allo stesso principio — «lento» non è «in panne»: il
  cronometro parte solo dentro i 40° dal vento e solo se la barca **non sta
  accelerando**; il pilota molla dopo otto secondi invece di due, e solo con
  la prua davvero dentro il vento; e quando molla **lascia la barra dov'è**,
  perché a riprenderla è l'uomo. La panne resta severa: con la prua nel
  vento e le mani ferme non se ne esce, e ci vuole ancora il fiocco a collo.
- `test/panne.test.js`: la partenza di bolina a 4, 5 e 6 m/s che deve
  arrivare a quello che promette il polare tenendo la rotta; la panne che
  resta un vicolo cieco anche dopo due minuti e mezzo, e che col fiocco a
  collo si apre; e il cronometro della panne che non parte mentre la barca
  accelera ma corre quando la panne è vera. I primi due erano rossi prima
  della correzione.

### Cambiato
- **Il collaudo del cutter non misura più un difetto.** `barche.test.js`
  pretendeva che il cutter virasse di 90° in più del triplo del tempo dello
  sloop, e ci riusciva: 52,7 s contro 9,2. Ma quei 52,7 secondi non erano
  l'inerzia del cutter, erano l'autotimoniere che lo abbandonava — essendo
  lento a prendere lo spunto, il cutter non arrivava mai a velocità e
  cominciava la manovra a un nodo e trentaquattro gradi fuori rotta.
  Riparata la trappola, a parità di abbrivio vira in 9,55 s: il triplo non
  c'è mai stato, era il tempo che il cutter passava a non navigare.
  Al suo posto un'asserzione che dice la stessa cosa di `barche.json` — sul
  cutter «tutto succede trenta secondi dopo che l'hai deciso» — ma la
  misura dove non c'entra quanta velocità si perde passando il vento: la
  **prontezza alla barra** a rotta libera, cioè la punta di velocità di
  rotazione e i secondi per arrivare a metà di quella punta. Lì il cutter
  risponde con un quarto di ritardo in più dello sloop e gira più piano,
  mentre il gozzo vira su una moneta (il 41 % di punta in più, e prima).
  Con in più il fatto che il gozzo, pur essendo il più pronto di tutti,
  **ci mette di più a virare di 90°**, perché passando il vento perde due
  terzi della velocità: sono due qualità diverse e ora il collaudo le tiene
  distinte.

### Aggiunto
- **Ricaricare la pagina non costa più la navigazione.** Il giornale e la
  carriera sopravvivevano già all'F5; la barca no. Chi ricaricava — o chi
  si limitava a rispondere a un messaggio, col telefono che intanto
  scartava la scheda — si ritrovava al porto, sullo scafo di partenza, con
  la traversata in corso buttata via e il carico che nel frattempo aveva
  continuato a fare tardi: la carriera si ricordava della scadenza, il mare
  no. Ora accanto alle altre due c'è una terza chiave nell'archivio,
  `vela:sessione`, che tiene la fotografia della partita in corso: quale
  carta e con quale seme, quale barca, dove stava e com'era regolata
  (scotte, terzaroli, spinnaker, cavallino), a che punto era la traversata
  col suo cronometro e la sua traccia, la regata, la rotta tracciata a mano
  e il porto d'arrivo scelto. Si riscrive ogni tre secondi e quando la
  pagina se ne va; alla riapertura la guida non torna davanti, perché chi
  riprende una navigazione l'ha già letta. Per ripartire da capo restano
  *Riporta al via* e i porti di partenza, che è dove uno li cerca.
  Non entra nel codice di salvataggio portatile: una posizione in mare non
  vuol dire niente su un altro dispositivo, dove la carta può essere
  un'altra. E come tutto quello che si rilegge da fuori passa da un filtro
  in entrata — versione, coordinate dentro la carta, barca che esiste
  ancora ed è tua se la carriera è aperta — perché una sessione storta è
  peggio di una sessione persa: se non torna si riparte dal porto, e basta.
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
- **La carta ridotta si ingrandisce con la rotella.** In basso a destra ci
  stavano 168 px per venticinque chilometri di Ionio: si vedeva la forma
  dell'arcipelago e non si vedeva niente di quello che serve mentre si
  naviga — da che parte è l'imboccatura, quanta acqua c'è fra la punta e la
  secca. Tenendoci sopra il cursore la rotella la ingrandisce fino a dodici
  volte, e da lì in poi l'inquadratura si stringe attorno alla barca e la
  segue, senza mai scavallare i bordi del mondo (un pezzo di vista fuori
  carta sarebbe mare bianco al posto delle terre). Boe e barchetta
  rimpiccioliscono con lo zoom, perché sono segni e non oggetti, e dal
  ×2,5 in su compaiono i porti, che a carta intera sarebbero venti puntini
  appiccicati alle coste. Il fattore è scritto nell'angolo: una rotella che
  fa qualcosa solo lì sopra, senza niente che lo dica, è un comando che si
  scopre per sbaglio.
- **Il ritmo di gioco da tastiera, e il 16×.** `+` e `−` salgono e scendono
  di un gradino sulla stessa scaletta della tendina del menù, `0` riporta al
  tempo reale. Era la cosa che si cambia più spesso — realtime per entrare
  in porto, tutto il ritmo che c'è per attraversare un canale vuoto — ed era
  l'unica che obbligava ad aprire il menù e cercare una tendina. La scaletta
  arriva ora a **16×**: la fisica non se ne accorge perché `frame` sotto-passa
  sul tempo *simulato* e non sul fotogramma, e la golden test lo verifica
  confrontando la velocità a regime a 16× con quella a 1×.
- **Ogni strumento si spegne per conto suo.** Nel menù, sotto *Strumenti a
  schermo*, c'è una casella per riquadro: velocità e vento, rosa dei venti,
  scotte e timone, carta ridotta, regata, traversata, incarico, rotta.
  Servono due cose opposte e nessuna delle due si poteva fare: allenarsi a
  leggere il colore delle vele senza i numeri sotto gli occhi, e tenere solo
  cronometro e cartina in una traversata lunga. Spegnendone uno la colonna
  di sinistra si **ricompatta** invece di lasciare il buco — un riquadro
  spento che lascia il suo spazio vuoto è peggio del riquadro — e spenti gli
  strumenti in alto la colonna comincia da sopra.
- `test/strumenti.test.js`: la cartina che a zoom 1 inquadra esattamente
  quello di sempre e ingrandita non esce dalla carta, la rotella che lì
  sopra non tocca le scotte e sul mare continua a toccarle, i riquadri che
  si spengono e la colonna che si ricompatta, i gradini del ritmo con i loro
  fondo scala, e la scaletta `RITMI` confrontata con le opzioni del menù.

### Corretto
- **Le boline consigliate erano più strette di quelle che la barca sa
  percorrere.** Chi seguiva una rotta consigliata se ne accorgeva subito:
  la linea sulla carta non si teneva: per starci sopra bisognava stringere
  oltre l'angolo di bolina, le vele smettevano di tirare, e ci si trovava a
  fare la strada a lato del tratteggio senza capire perché. Il conto era
  giusto e il disegno sbagliato — o meglio, i due parlavano di due cose
  diverse. Il polare della barca risolve l'equilibrio velico e sa
  benissimo che la deriva regge la forza laterale delle vele solo
  scivolando un po': lo **scarroccio**, che di bolina stretta vale una
  decina di gradi e sul gozzo arriva a venti. Quel numero c'era già dentro
  `polarSpeed`, e veniva buttato via: si teneva solo il modulo della
  velocità. Poi la pianificazione prendeva l'angolo di *prua* di massima
  VMG e ci disegnava sopra la *strada*, come se la barca andasse dove
  punta. Ogni bordo nasceva così dieci gradi più stretto del vero, e la
  rotta che ne usciva era una rotta di carta.
  Ora `polarSolve` restituisce anche lo scarroccio, e le due cose stanno
  separate dappertutto: `andature()` dà per ogni andatura la `prua` da
  tenere alla barra e la `twa` della **scia**, cioè della strada che si fa.
  Il massimo di VMG si cerca sulla scia (è lì che si guadagna al vento, non
  sulla prua), la geometria dei bordi e i punti del consiglio si costruiscono
  sulla scia, e la prua compare solo dove si scrive un numero di bussola a
  chi sta al timone — dove prima, sulla tratta diretta, si scriveva
  addirittura il rilevamento, che è la strada e non la prua. Un collaudo
  nuovo chiude il cerchio dalla parte che conta: mette la barca sulla prua
  consigliata, la lascia navigare col pilota, e verifica che la scia che ha
  fatto davvero sia quella disegnata sulla carta.
  Ne discendono due cose, ed è giusto che si vedano. Le andature restano
  quelle di *quel* polare, ma il confronto fra gli scafi ora si legge sulla
  scia: a 8 m/s il gozzo e la barca da regata tengono la stessa prua e
  arrivano in due posti diversi (66° contro 55° dal vento), che è poi
  l'unica differenza che conti fra rimontare il vento e farsi portare
  sottovento mentre ci si prova. E bordeggiare in un canale ora chiede più
  virate, perché ogni bordo guadagna meno: il tetto per tratta è salito da
  16 a 32, perché quando lo si toccava l'ultimo pezzo restava in mano come
  una tratta dritta dentro il vento.
- **Una rotta consigliata poteva ancora passare sopra uno scoglio.** Il
  controllo dei salti sulla griglia ha una scorciatoia che vale oro: se la
  distanza dalla costa dei due capi copre la lunghezza del salto, in mezzo
  non ci può essere niente, e non serve andare a campionare. Il guaio è che
  `landDepth` non guarda nemmeno le isole a più di 400 m dal proprio
  riquadro — per velocità — quindi al largo restituisce la distanza
  dell'isola che ha visto, non della più vicina in assoluto. Un nodo a
  «tre chilometri dalla costa» faceva passare la scorciatoia sempre, e il
  controllo vero non veniva mai fatto: proprio sui salti lunghi, che sono
  quelli capaci di mangiarsi un promontorio. Ora quella distanza si ferma a
  400 m, che è il punto oltre il quale non è più un numero di cui fidarsi.
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
- **`+` e `−` non sono più lo zoom della vista: sono il ritmo di gioco.** Lo
  zoom si sistema una volta e resta lì; il ritmo si cambia in continuazione,
  ed è quello che merita i due tasti che tutti trovano al buio. Lo zoom della
  vista è passato su `Pag↑` `Pag↓` — che, a differenza del segno più, non
  cambiano di posto con la disposizione della tastiera — e resta dov'era su
  `Ctrl`+rotella.
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
