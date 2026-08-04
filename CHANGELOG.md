# Diario delle modifiche

Una voce per ogni modifica, aggiunta **prima** del commit, sotto
`## Non rilasciato`. In italiano, e dica il perché, non solo il cosa.
Categorie: `Aggiunto`, `Cambiato`, `Corretto`, `Rimosso`.

Quando questo file supera le 50 righe, sposta le voci più vecchie in
`docs/changelog/AAAA-MM.md` e lascia qui solo le recenti.

## Non rilasciato

### Aggiunto
- **Modalità carriera: i porti pagano per portare roba da un'altra parte.**
  Il giornale di bordo registrava già ogni traversata fra due porti veri,
  ma non c'era nessun motivo per fare *quella* traversata invece di
  un'altra: si navigava per navigare, e la scelta della barca era una prova
  a vuoto, perché nessuno scafo serviva a niente più degli altri. La
  carriera (`I`) mette un motivo sotto ogni rotta. Si comincia con
  **1.500 € e un gozzo**; ogni porto offre **tre carichi** per tre
  destinazioni diverse — una vicina, una di mezzo, una lontana — con merce,
  tonnellaggio, scadenza e paga; si viene pagati **a miglio e a
  tonnellata**, e l'urgente vale una volta e mezza il comodo.
  La regola che tiene in piedi tutto è la **stiva**: la prima delle tre
  offerte ci sta sempre in quella del gozzo, le altre no. Così il cantiere
  non è un negozio di skin — lo sloop porta 3,5 t, il cutter nove, e sono
  quelle le consegne che pagano — e in carriera si naviga soltanto su
  quello che ci si è comprati. Prezzo e stiva stanno in `barche.json`
  accanto a ogni scafo, non nel gioco: sono roba della barca. La fisica non
  li guarda, e la golden test non si accorge che esistono.
  Il **ritardo** scala la paga in proporzione ma non sotto un terzo — il
  carico è arrivato lo stesso, è una multa e non una beffa — mentre
  **toccare il fondo** bagna la merce, 18% per incaglio, contato una volta
  per incaglio e non per secondo passato sugli scogli. Le offerte di un
  porto sono una *funzione* del porto e del seme, non un tiro di dadi:
  chiudendo e riaprendo il pannello si ritrovano le stesse tre, e il
  collaudo può verificarle senza rincorrere `Math.random`.
  Due porte chiuse apposta: col carico a bordo non si cambia barca e non si
  sceglie il porto di partenza dal menù, se no la consegna sarebbe un
  teletrasporto. Cambiando carta, invece, l'incarico decade **senza**
  penale: quel porto non esiste più, e non è colpa del marinaio.
- **Salvataggio portatile, per portare la carriera su un altro
  dispositivo.** L'archivio del browser non attraversa i dispositivi:
  quello del telefono e quello del computer sono due mondi separati, e
  senza server non c'è modo di farli parlare da soli — svuotare la
  cronologia bastava a cancellare tutto. Ora il pannello della carriera
  genera un **codice di testo** che contiene giornale e carriera, da
  copiare e incollare dove si vuole, e lo rilegge dalla stessa casella;
  in alternativa scarica e riapre un file `.vela`. Nessun account, nessuna
  rete, funziona ovunque giri il gioco.
  Il codice è `VELA1.<base64url>.<firma>`: la firma è lo stesso `hashStr`
  dei semi e serve solo a dire "questo testo è arrivato storto", non a
  impedire di modificarlo — chi vuole barare coi propri record è
  liberissimo. Il codice da incollare **lascia indietro le tracce dei
  fantasmi**, che da sole sono il grosso del peso: coi tracciati sarebbe
  lungo decine di migliaia di caratteri e non lo incollerebbe nessuno.
  Caricandolo i record restano, la scia in acqua no; il file, che nessuno
  legge a occhio, se la porta dietro tutta. Quello che arriva da fuori
  passa sempre da `carrieraSana()`, che butta barche inesistenti, numeri
  che non sono numeri e casse negative: un salvataggio è testo che chiunque
  può aver scritto.
- `test/carriera.test.js`: le offerte deterministiche, la paga che cresce
  con distanza e carico, il carico più grosso della stiva, la consegna in
  orario e quella in ritardo (col pavimento a un terzo), l'incaglio contato
  una volta sola, il cantiere che non vende a chi non ha soldi, la barca
  non tua che non si imbarca, il codice di salvataggio che va e torna
  identico — accenti compresi — e che si riconosce storpiato, lo stato
  sporco che viene ripulito, la carriera che si ritrova nell'archivio, e
  l'arrivo in porto che chiude la consegna da sé.

### Cambiato
- **Le scadenze della carriera stimavano una barca che non esiste.** Il
  noleggiatore calcolava il tempo concesso su **4,2 nodi in linea d'aria**
  fino al porto d'arrivo, e l'urgente concedeva appena il 2% in più. Ma 4,2
  nodi non sono la velocità che si tiene *verso la destinazione*: il gozzo
  con cui si comincia tocca i 4,8 nodi al traverso, però di bolina ne
  guadagna **2,1** verso il vento, e in mezzo ci sono i bordi, le terre da
  girare e l'ombra di vento sottovento alle isole. Chiedere 4,2 voleva dire
  chiedere il doppio di quello che la barca può fare su una tratta contro
  vento: le consegne scadevano quasi tutte, e la paga a scalare le rendeva
  una tassa invece di una scelta. Ora la stima parte da **2,8 nodi fatti
  buoni** — la media onesta di una traversata mista — e i coefficienti di
  fretta aprono da lì: `comoda` 2,00, `normale` 1,50, `urgente` 1,25, cioè
  1,4 / 1,9 / 2,2 nodi da tenere in linea d'aria. La comoda si porta a casa
  anche bolinando tutto il tempo, l'urgente chiede una tratta portante o
  una barca vera — e continua a pagare una volta e mezza. Le paghe non
  cambiano: cambia solo il tempo concesso, che era il numero sbagliato.
- **Il ritmo di gioco arriva a 12×.** Le traversate lunghe del Ionio, che
  in carriera sono quelle che pagano, a 6× restavano mezz'ora di orologio
  vero con poco da fare in mezzo. Aggiunti **8× e 12×**: la fisica gira già
  a sottopassi da 20 ms ricavati dal tempo simulato, quindi accelerare non
  la destabilizza — a 12× la barca tiene la rotta con lo stesso scarto che
  a 1×, verificato a timone automatico in mare aperto.
- **Il passo delle rotelle parte da 1/5.** Era 1×, cioè ~6° di scotta per
  scatto: la fascia verde dell'ottimo è larga pochi gradi e con lo scatto
  pieno la si scavalca a ogni tentativo, e il tutorial stesso doveva dire
  "se ti sembra troppo grosso, abbassalo nel menù" — un predefinito che va
  spiegato è un predefinito sbagliato. Ora il menù apre già su **1/5**, che
  è il passo con cui la fascia si centra davvero; chi vuole lo scatto pieno
  ce l'ha sempre lì. I collaudi dei versi e degli accoppiamenti rimettono
  `wheelStep` a 1 apposta, così continuano a parlare di gradi veri, e un
  collaudo nuovo verifica che `game.js` e il menù di `index.html` dicano lo
  stesso numero: sono due file, e se divergono il marinaio legge 1/5 e gira
  una rotella che va a scatto pieno.
- **Anche il timone è a posizione, e un doppio tocco lo rimette dritto.**
  Restava l'ultimo comando a velocità: si spingeva il pomo e la barra
  cominciava a scorrere, così per metterla a metà bisognava spingere,
  guardare l'indicatore e mollare al momento giusto, e per un colpo di
  barra improvviso — quello che serve quando la prua è già partita —
  toccava tenere il dito premuto e aspettare. Ora **il pomo è la barra**:
  dove lo metti sta la pala, tutta a dritta in un gesto solo, e il pomo è
  lo stesso segno chiaro dell'indicatore TIMONE. La corrispondenza è
  **lineare** apposta: una risposta quadratica, buona per una velocità,
  qui vorrebbe dire un pomo che non sta dove sta la barra. Vicino al
  centro c'è un piccolo scatto sul dritto (±0,05 di corsa), perché a mano
  libera lo zero esatto non si trova ed è la posizione che serve più
  spesso. Mollando il dito la barra resta dov'è, come prima: la frizione
  inserita non è cambiata, è cambiato cosa vuol dire spostare il dito.
  Il **doppio tocco sul pad** rimette la barra dritta, cioè al cavallino
  se ce n'è uno e disinserendo l'autotimoniere: è `centraBarra`, lo stesso
  di Spazio e del doppio click destro sul mare, gemello col dito di un
  gesto che col mouse c'era già. I due tocchi si contano a mano con la
  finestra di sistema (350 ms) e il tempo lo dà l'evento, come là: il
  browser `dblclick` col dito non lo manda. Il secondo tocco raddrizza e
  basta, senza muovere anche la barra, se no il gesto la rimetterebbe
  storta dove è capitato il dito.
  Il pomo ora **segue la barra anche quando non lo tocchi**: tasti,
  rotella, cavallino e autotimoniere la muovono per conto loro, e un pomo
  fermo mentre la barra si sposta sarebbe una bugia. Unica eccezione, il
  pad col **pilota inserito su rotta o vento**: lì la barra non è in mano
  tua, il pad torna a essere un joystick che gira la rotta impostata a
  26°/s e si ricentra mollando il dito — i gradi di bussola non hanno un
  fine corsa su cui appoggiare una posizione, e dal telefono è l'unico
  modo di correggere la rotta. È rimasto l'unico pezzo di input che ha
  ancora bisogno di girare dentro `input()`.
- `test/joystick.test.js`: il pad del timone a posizione (metà pad = metà
  barra, lo scatto al centro, venti passi di tempo che non la spostano di
  un grado, mollata resta dov'era), il doppio tocco (uno solo no, il terzo
  non fa coppia, due tocchi lontani nemmeno, col cavallino torna al
  cavallino, col pilota lo disinserisce, spento non fa niente) e il pad col
  pilota inserito, che alimenta l'asse e non la barra.
- **Le scotte si regolano con due manopole, non più col pad a due assi.**
  Il pad destro chiedeva di tenere a mente due assi contemporaneamente —
  verticale la randa, orizzontale il fiocco — e dava *velocità*: per
  arrivare a un certo punto della corsa bisognava spingere, guardare la
  barra degli strumenti e mollare al momento giusto, che con la fascia
  verde dell'ottimo larga pochi gradi voleva dire scavalcarla a ogni
  tentativo. Non era il gesto di una barca: a bordo non si spinge una
  cloche, si gira un verricello. Ora ci sono **due manopole**, una per
  scotta, e sono comandi di **posizione**: dove sta la manopola sta la
  vela. Ci vogliono **due giri interi** per l'intera corsa — 720° di dita
  per 90° di randa, otto gradi di manopola per uno di vela — e sono i due
  giri a dare il dosaggio fine che prima si cercava a colpi di velocità.
  In senso **orario si cazza**, come si avvolge una cima sul tamburo. Il
  dito gira davvero attorno al perno e i giri si contano: l'angolo fra un
  evento e il successivo viene «srotolato» a ±180°, se no passando davanti
  al fondo scala un grado diventerebbe un giro al contrario. Attorno al
  perno c'è un raggio morto di 13 px, dove il pollice appoggiato produce
  solo angoli a caso.
  Attorno a ogni manopola l'anello esterno è **la corsa della scotta
  srotolata su 270°**, con le stesse fasce della barra degli strumenti —
  troppo cazzata, finestra buona, troppo lascata — e il segno chiaro dove
  la vela sta adesso: la regolazione si trova guardando la manopola, senza
  spostare gli occhi in basso a sinistra. Le manopole non hanno uno stato
  proprio, leggono e scrivono `boat.trim` e `boat.jib`, quindi girano da
  sole quando comanda la regolazione automatica (T), quando si prende una
  mano di terzaroli o quando si issa lo spinnaker — che porta anche il
  fine corsa del fiocco da 80° a 90°, e il rapporto della manopola cambia
  con lui.
  **Il timone resta il pad di prima**, com'è giusto: la barra è un comando
  di velocità con la frizione inserita, e mollando il dito deve restare
  dov'è. Essendo rimasto a un asse solo, `joyVettore` ora restituisce un
  numero invece di un vettore e il ritorno al centro sul pad tondo è
  sparito con l'asse che lo usava.
  Di conseguenza il menù dice *Comandi a dito* invece di *Joystick*, e la
  schermata dei comandi spiega la differenza fra il pad (velocità) e le
  manopole (posizione). In `game.js` la sigla `joy` resta nei nomi interni
  — è la fascia in fondo allo schermo, pad e pulsantiera compresi — e
  `JOY_ALTA`/`JOY_BASSA` continuano a essere il contratto d'altezza con gli
  strumenti, che non è cambiato.
- `test/joystick.test.js`: al posto dei versi dei quattro assi e della
  cloche, le manopole — un quarto di giro vale un ottavo della corsa, due
  giri interi la coprono tutta, il fiocco ha una corsa più corta e con lo
  spi si allunga, una manopola non tocca l'altra vela, il fine corsa non si
  sfonda — e il conteggio dei giri: il salto a ±180° non conta come mezzo
  giro, e un giro fatto in otto passi vale mezza corsa. Del pad resta il
  collaudo di quello del timone.

### Aggiunto
- **Due joystick per governare col dito — o col mouse, senza rotella
  orizzontale.** Sul telefono i comandi erano sei pulsanti tutto-o-niente:
  o la scotta stava ferma o correva a 50°/s, e la fascia verde dell'ottimo è
  larga pochi gradi, quindi la si scavalcava a ogni tentativo. Ora in fondo
  allo schermo ci sono due pad: a sinistra il **timone**, a destra le due
  **scotte** — asse verticale la randa, asse orizzontale il fiocco, in
  diagonale tutte e due insieme, che è una cosa che dalla tastiera si può
  fare solo con Maiusc e alla stessa velocità. I versi sono quelli che il
  gioco usa già: in su cazza come la rotella verticale, a sinistra cazza
  come l'orizzontale, a destra la barra accosta a dritta come la ruota.
  Sono comandi di **velocità e non di posizione**, come i tasti: mollando il
  pad la scotta resta dov'è e la barra non torna dritta da sola — un
  joystick che si ricentra riporterebbe la barra al centro a ogni dito
  alzato, cioè il contrario della frizione inserita che questa barca ha di
  serie. La risposta è **quadratica**: a metà corsa vale un quarto, quindi
  il primo terzo del pad regola fine come la rotella a 1/5 e il fondo corsa
  va quanto una freccia tenuta premuta. Sul pad tondo il vettore si accorcia
  invece di squadrarsi, come una cloche vera.
  Si accendono da soli dove non c'è una tastiera (`ontouchstart` o puntatore
  grossolano) e si accendono a mano da *Joystick* nel menù: senza rotella
  orizzontale il fiocco si regolava solo con Q ed E.
  Sopra i pad c'è la fila di pulsanti che sul telefono sostituisce la
  tastiera — carta, pilota, vele automatiche, barra dritta, fiocco a collo,
  terzaroli, fiocco, spi. Per averla, i comandi a colpo singolo sono usciti
  dall'ascoltatore della tastiera e stanno in `comando(k, shift)`, che ora
  ha due chiamanti e un collaudo.
- **Pizzico a due dita per ingrandire la carta nautica.** La carta si
  ingrandiva solo con la rotella, quindi su un telefono restava
  all'inquadratura in cui la si trovava: si vedeva l'arcipelago intero e
  non si poteva entrare in una cala per guardare i fondali. Ora due dita
  che si allargano ingrandiscono attorno al loro punto di mezzo, che nel
  frattempo trascina — è lo stesso gesto di qualunque mappa. Finché ci sono
  due dita giù non si trascina con una sola e non si segna niente: il punto
  di rotta lo segnerebbe il dito che si alza per primo, dove capita. Gli
  ascoltatori del canvas sono diventati `cartaGiu/Muovi/Su`, funzioni con
  un nome che il collaudo può chiamare come già fa con `rotella(e)`.
  Sulla carta, su schermo stretto, le due righe di istruzioni sono in
  versione corta (per esteso uscivano dallo schermo), la rosa scende sotto
  il pulsante ☰, le latitudini non finiscono più dentro l'intestazione e la
  scala grafica sta sopra la pulsantiera. I pad si nascondono — lì non
  governano niente — ma i pulsanti restano, perché *Carta* è anche il modo
  di richiudere la carta col dito.
- `test/joystick.test.js`: il fondo corsa vale una freccia tenuta premuta
  (barra, rotta impostata e scotte), a metà corsa si muove molto meno della
  metà, la zona morta non governa, i versi dei quattro assi, il pad tondo si
  accorcia in diagonale invece di squadrarsi, il timone ignora il verticale,
  con l'autotimoniere si sposta la rotta e non la barra, a vele automatiche
  le scotte non si toccano ma si governa, spento non comanda niente, e i
  pulsanti danno gli stessi comandi dei tasti. Più il pizzico sulla carta:
  ingrandisce in proporzione a quanto le dita si allontanano, il punto di
  mezzo trascina, alzando le dita non si segna un punto di rotta, e con un
  dito solo tocco e trascinamento continuano a fare quello che facevano.
- `test/impaginazione.test.js`: scala e ingombri degli strumenti da 320 px
  al monitor, in verticale e in orizzontale — la rosa non entra mai negli
  strumenti, i pannelli non escono dallo schermo, non si accavallano fra
  loro e nessuno finisce sotto i joystick.
- **Rotta pianificata: si traccia sulla carta e resta tratteggiata in mare.**
  La carta nautica serviva solo a guardare: si leggeva rilevamento e
  distanza col cursore, si mandava a memoria "175° per due miglia e mezzo",
  si chiudeva la carta e da lì in poi si navigava a naso, perché in mare
  non c'era più niente che dicesse dove si voleva passare. Ora ogni click
  sul mare segna un **punto di rotta**: i punti fanno una spezzata
  numerata, ogni tratta porta scritti accanto **rilevamento e miglia** — i
  due numeri che si scrivono a matita sulla carta vera — e chiudendo la
  carta la linea **resta tratteggiata sull'acqua**, con la tratta in corso
  piena, quelle già fatte spente e il cerchio di passaggio attorno al punto
  attivo. Un punto conta per girato quando ci si passa entro 70 m e
  l'indice avanza da sé.
  In plancia il pannello **ROTTA** dà punto corrente, rilevamento e
  distanza del prossimo, e soprattutto lo **scarto**: quanti metri veri si
  è fuori dalla congiungente, e da che parte. È il numero che distingue il
  seguire la linea dal puntare al punto — con lo scarroccio si arriva lo
  stesso, ma passando dove non si erano guardati i fondali. Per averlo
  anche sulla prima tratta, quella in cui si esce dal porto, la tratta
  ricorda da dove è cominciata (`piano.da`) invece di pretendere un punto
  precedente.
  Non governa niente: nessun autotimoniere, nessuna forza, `physics()` non
  sa che esista, quindi la golden test è intatta. Il piano di rotta si
  chiama `piano` e non `rotta` perché in tutto il resto del file *rotta* è
  la direzione della prua, e due cose diverse con lo stesso nome nello
  stesso ambito sono un errore che aspetta — se ne è avuta la prova
  subito: una sonda di collaudo aveva già una variabile `rotta`.
  Sulla carta il click deve convivere col trascinamento, quindi vale come
  click solo se il tasto si lascia entro 5 px da dove è stato premuto; la
  tolleranza per riconoscere "hai cliccato *quel* punto" è di 12 px sullo
  schermo a qualunque ingrandimento, perché in metri di mare sarebbe
  irraggiungibile da lontano e grande come mezzo golfo da vicino.
  La rotta sopravvive al ritorno al via — è un disegno del marinaio, non
  uno stato della barca — ma riparte dal primo punto; cambiare carta la
  cancella.
- `test/rotta.test.js`: un click segna e un click sopra toglie, la
  tolleranza è in pixel e non in metri, un punto è passato solo entrandogli
  dentro e la tratta riparte da lì, lo scarto ha segno giusto (a dritta
  positivo) e vale zero sulla linea, togliere un punto già passato non
  cambia dove si sta andando, la rotta sopravvive al reset e non al cambio
  di carta, e un giro completo con la rotta disegnata — mare e carta — non
  produce NaN.
- **Doppio click del tasto destro: barra dritta.** Il tasto destro era già
  il modificatore del timone — tenuto premuto si governa con la rotella —
  ma per raddrizzare bisognava tornare alla tastiera e cercare **Spazio**,
  cioè lasciare il mouse proprio nel momento in cui si sta governando con
  una mano sola. Ora due click ravvicinati sul mare fanno esattamente
  quello che fa Spazio: barra al **cavallino** (non al centro geometrico,
  altrimenti ogni raddrizzata cancellerebbe la regolazione) e
  autotimoniere disinserito. Non è un `dblclick` — il browser lo manda
  solo per il tasto sinistro — quindi i due click si contano a mano sui
  `mousedown`, con la finestra di sistema di 350 ms e il tempo preso
  dall'evento invece che dall'orologio, così `clickDestro(e)` resta
  collaudabile come `rotella(e)`. Il corpo di Spazio è diventato
  `centraBarra(azzera)`, condiviso fra tastiera e mouse: due gesti che
  divergono sono un bug che aspetta.
- `test/rotelle.test.js`: il doppio click raddrizza, due click lenti no, il
  terzo click non fa una seconda coppia col secondo, col cavallino
  inserito la barra torna lì e il cavallino resta, il tasto sinistro non
  fa niente e sulla carta il timone non si tocca. Più un test sul verso
  del governo, che confronta randa e barra sullo stesso scatto.
- **Passo delle rotelle regolabile** (menù in alto, da `1×` a `1/10`) e
  **barra del timone con Alt + rotella**. Uno scatto di rotella valeva 6°
  di scotta, sempre: comodo per lascare tutto in poppa, inservibile per
  cercare l'ottimo, perché la fascia verde di bolina è larga ~4° e ogni
  scatto la scavalca. Ora il passo scelto scala tutto quello che si regola
  con la rotella — scotte, barra, cavallino, rotta impostata — e a `1/10`
  uno scatto vale **0,6°**, cioè si posa il segno bianco dentro il verde
  senza rincorrerlo. Lo zoom della carta non è toccato: lì la rotella
  serve a un'altra cosa.
  Il timone, che si governava solo a tastiera, risponde a
  **Alt + rotella** (in giù a dritta) o al **tasto destro tenuto premuto**
  mentre si gira la rotella, per governare con una mano sola — da cui la
  soppressione del menù contestuale sul solo canvas, altrimenti il
  browser lo apre sopra il mare. **Alt + Maiusc + rotella** muove il
  cavallino, e con l'autotimoniere su *ROTTA* lo stesso gesto sposta la
  rotta impostata di 5° per scatto a passo pieno. Tenere premuta una
  freccia per centrare 0,26 di barra era il gesto sbagliato per un
  comando di precisione: la rotella si posa su un valore e lo lascia lì.
  A differenza delle scotte il timone risponde **anche a vele
  automatiche** (`T`): quella assistenza riguarda le vele, non il governo.
- `test/rotelle.test.js`: il passo scala davvero (e in proporzione su
  scotte e barra), Alt non tocca le scotte e la rotella nuda non tocca la
  barra, il tasto destro premuto vale come Alt, il cavallino resta cinque
  volte più fine della barra, con
  l'autotimoniere inserito si muove la rotta e non la barra, la carta ha
  la precedenza e le rotelle invertite invertono anche il timone. Per
  renderlo collaudabile il corpo dell'ascoltatore `wheel` è diventato la
  funzione `rotella(e)`: la harness non può recapitare eventi.
- **Cavallino sulla barra** (`,` `.` per regolarlo, **K** per prenderlo
  dov'è la barra adesso). Il timone sembrava impossibile da regolare, e
  misurando si è visto perché: per *non* cambiare rotta la barra va tenuta
  **fuori dal centro** — 0,26 di barra tutta di bolina con 14 nodi, 0,40
  con 24 — mentre le frecce vanno a 1,15 al secondo, cioè quel valore si
  centra tenendo premuto per 226 millisecondi a occhio, senza nessun
  numero che dica dove sei. E bastava una correzione per perderlo.
  Ora `,` e `.` spostano il **neutro** della barra cinque volte più fine
  delle frecce, portandosi dietro la barra; **Spazio** riporta al
  cavallino invece che al centro, quindi correggere una raffica non
  cancella più la regolazione; **Maiusc+Spazio** azzera tutto. Il richiamo
  al centro (governo 1) torna anch'esso al cavallino.
  Misurato: di bolina, un minuto a mani ferme, la prua deriva di **7°**
  col cavallino contro **38,8°** senza.
  Il cavallino **non tocca la fisica** — è solo il punto a cui tornano i
  comandi, `physics()` non sa che esista — quindi la golden test resta
  intatta.
- L'indicatore è persistente, riga **CAVALLINO** in accento col valore,
  più un segno arancione sotto la scala del timone: un neutro spostato di
  nascosto sarebbe stato lo stesso inganno già corretto per la regolazione
  automatica delle vele.
- `test/timone.test.js`: verifica che il problema esista davvero (di
  bolina serve barra fuori centro, e di più col vento fresco), che il
  cavallino lo risolva, che sia più fine delle frecce e che le frecce non
  lo tocchino.
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
- **Gli strumenti si impaginano da soli sugli schermi stretti.** Erano
  disegnati a coordinate fisse pensate per una finestra da computer: su un
  telefono la rosa dei venti finiva sopra il pannello della velocità, la
  carta ridotta sotto le scotte e il pulsante ☰ sopra tutto. Invece di
  ritoccare cento coordinate, `hudBox()` stringe il contesto e finge una
  finestra più larga (fino a 0,72×, sotto quella soglia le scritte da 10 px
  diventerebbero illeggibili); da lì in giù si toglie roba invece di
  rimpicciolire — rosa più piccola, carta ridotta via, pannello delle scotte
  largo quanto lo schermo, che per cercare la fascia verde è anche meglio.
  Il fondo dello schermo resta ai joystick e gli strumenti si alzano di
  quanto è alta la loro fascia: sotto le dita non si legge niente.
  Il menù del gioco su schermo piccolo parte chiuso — aperto copriva mezzo
  mare, e per il lungo tutto — e diventa una fascia a due colonne col
  pulsante ☰ in alto a destra, dove il telefono se lo aspetta. Nel menù è
  comparso **Carta (C)**, perché su un telefono non c'è nessun tasto C da
  premere.
- **Il verso della rotella sul timone è invertito**: in su a dritta, in
  giù a sinistra. Prima seguiva il verso delle scotte, dove la rotella in
  giù *lasca*; ma il timone non è una scotta, è una ruota, e la si gira
  dalla parte in cui si vuole andare. L'inversione vale per tutto il
  governo — barra, cavallino e rotta impostata con l'autotimoniere su
  *ROTTA* — perché è lo stesso gesto e deve far accostare la barca sempre
  dalla stessa parte. Le scotte non sono toccate, e nemmeno lo zoom della
  carta. L'inversione delle rotelle del menù continua a valere sopra
  questa: chi le aveva invertite ritrova il verso di prima.
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

### Corretto
- **Il pannello della traversata non si sovrappone più a quello della
  regata.** Quando lo schermo è troppo stretto per tenere la regata in alto
  a destra, quella scende sotto gli strumenti — dove la traversata in corso
  si disegnava già, alla stessa quota. Si leggevano i due orari uno sopra
  l'altro. Ora la traversata scala di 74 px quando trova la regata al suo
  posto.
- **Lo spinnaker non cambiava colore con la regolazione.** Randa e fiocco
  dicono da sempre come sono regolati col colore — ambra fileggia, verde
  ottima, arancio in stallo — ma lo spi era disegnato con un arancione
  fisso e un filo di contorno scuro: l'unico dato che cambiava era
  l'opacità quando si sventava sotto i 66°. Lo stato c'era già, `boat.stJ`
  lo calcola anche per lo spi ed è quello che scrive lo strumento in
  basso; solo il disegno lo ignorava, così con **Q E** si vedeva muovere
  la vela ma non si vedeva mai *quando* era giusta. Ora il bordo dello
  spinnaker usa la stessa tavolozza delle altre vele — è la spia — mentre
  il corpo resta arancione, perché quel colore è l'identità dello spi e
  tingerlo di verde lo confonderebbe con la randa. Il corpo si spegne
  quando la vela non tira (sventata o fileggiante). Aggiunto alla
  tavolozza lo stato `sventato`, che esiste solo per lo spinnaker e prima
  cadeva sul grigio di `cazzata`.
- **Un `\n` stampato a schermo nel Giornale di bordo** (`index.html:171`):
  era una sequenza di escape finita per sbaglio dentro l'HTML, dove non
  significa niente, quindi il browser la disegnava come due caratteri
  qualsiasi sopra "Migliori traversate".
- `docs/deploy.md` riconosce il guasto in cui siamo appena inciampati: il
  sito pubblicato mostrava la barra del menù ma non il gioco, con le
  tendine **Barca** e **Partenza** vuote e un 404 su `/src/main.js`. Non
  era né la cache né la `base`: con la sorgente di Pages lasciata su
  *Deploy from a branch*, GitHub aggiunge un proprio workflow che pubblica
  la radice del repository, corre insieme al nostro e vince per pochi
  secondi — così `deploy.yml` risultava verde mentre il sito serviva
  l'`index.html` non compilato. La riga che diceva di impostare *Source:
  GitHub Actions* c'era già ma sembrava una formalità: ora dice cosa
  succede se la si salta, e il sintomo è scritto per esteso, perché le
  tendine vuote sono il modo più rapido di capire che il bundle non è
  mai partito.

### Rimosso
- I sei pulsanti direzionali per il tocco (`#touch`): li sostituiscono i due
  joystick, che fanno le stesse cose dosandole e occupano meno mare.

---

Le voci precedenti sono in [`docs/changelog/2026-07.md`](docs/changelog/2026-07.md).
