/* I COMANDI COL DITO — pad del timone, manopole delle scotte, pulsantiera
 * e pizzico sulla carta.
 *
 * Sul telefono i sei pulsanti di prima erano tutto o niente: o la scotta
 * stava ferma o correva a 50°/s, e la fascia verde dell'ottimo è larga
 * pochi gradi. Il pad del timone dà la stessa corsa massima delle frecce e
 * tutto quello che c'è sotto, quindi lì si collauda *quanto* si muove e
 * *da che parte*; le manopole delle scotte sono di posizione e non di
 * velocità, quindi lì si collauda il rapporto — due giri per tutta la
 * corsa — e che i giri si contino davvero.
 *
 * Come per le rotelle, la harness non recapita eventi: si scrive nell'asse
 * (`joy.timone.x`) e si chiama `input(dt)`, che è esattamente quello che fa
 * il ciclo di gioco, oppure si gira la manopola con `manopolaGira`, che è
 * quello che fa il gestore del puntatore; per la carta si chiamano a mano
 * `cartaGiu/Muovi/Su`, come si fa con `rotella(e)`. La fisica non è
 * coinvolta — si guardano solo i comandi — quindi la golden test non ne
 * risente.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 9000, start: {x:0,y:0}, name: "test" };`;

const PRONTI = `
const pronti = () => {
  joyAttiva(true);                       // azzera anche gli assi
  game.auto=false; game.pilot=0; game.paused=false; chart.on=false;
  boat.trim=45*D2R; boat.jib=35*D2R; boat.spi=false; boat.jibFurled=false;
  boat.rudderCmd=0; boat.rudderTrim=0; game.pilotTgt=0; boat.h=0;
  for(const k in keys) keys[k]=0;
};
`;

test("il joystick del timone è una freccia che si può dosare", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${PRONTI}
    pronti(); keys["arrowright"]=1; input(0.2);  const conFreccia=boat.rudderCmd;
    pronti(); joy.timone.x=1;       input(0.2);  const aFondo=boat.rudderCmd;
    pronti(); joy.timone.x=0.5;     input(0.2);  const aMeta=boat.rudderCmd;
    pronti(); joy.timone.x=-1;      input(0.2);  const aSinistra=boat.rudderCmd;
    // il dito appoggiato al centro non deve governare
    pronti(); joy.timone.x=0.08;    input(0.2);  const appoggiato=boat.rudderCmd;
    // il pad del timone non tocca le scotte
    pronti(); joy.timone.x=1;       input(0.2);
    const scotteFerme = boat.trim===45*D2R && boat.jib===35*D2R;
    // e a fine corsa si ferma, non sfonda
    pronti(); joy.timone.x=1; for(let i=0;i<20;i++) input(0.2);
    const fondoCorsa=boat.rudderCmd;
    report({ conFreccia, aFondo, aMeta, aSinistra, appoggiato, scotteFerme, fondoCorsa });
  `);

  assert.ok(Math.abs(r.aFondo - r.conFreccia) < 1e-12,
    `a fondo corsa il pad vale una freccia tenuta premuta (${r.aFondo.toFixed(3)} contro ${r.conFreccia.toFixed(3)})`);
  assert.ok(r.aFondo > 0, "a destra la barra va a dritta");
  assert.ok(Math.abs(r.aSinistra + r.aFondo) < 1e-12, "a sinistra della stessa quantità");
  // risposta quadratica: a metà corsa un quarto, non la metà. È quello che
  // rende il primo terzo del pad buono per cercare la fascia verde.
  assert.ok(r.aMeta > 0 && r.aMeta < r.aFondo * 0.35,
    `a metà corsa si muove molto meno della metà (${r.aMeta.toFixed(4)} contro ${(r.aFondo/2).toFixed(4)})`);
  assert.equal(r.appoggiato, 0, "dentro la zona morta non si governa");
  assert.ok(r.scotteFerme, "il pad del timone non deve toccare le scotte");
  assert.equal(r.fondoCorsa, 1, "la barra si ferma a fine corsa");
});

test("le manopole delle scotte: due giri da tutta cazzata a tutta lascata", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${PRONTI}
    const gradi = v => v*R2D;
    const randa=manopole[0], fiocco=manopole[1];
    // un quarto di giro in orario: 90° di dita su 720° di corsa, cioè un
    // ottavo dei 90° della randa
    pronti(); manopolaGira(randa,90);
    const cazzata=gradi(boat.trim), fioccoFermo=boat.jib;
    pronti(); manopolaGira(randa,-90); const lascata=gradi(boat.trim);
    // il fiocco ha una corsa più corta, 80°: lo stesso quarto di giro vale meno
    pronti(); manopolaGira(fiocco,90);
    const fioccoCazzato=gradi(boat.jib), randaFerma=boat.trim;
    pronti(); manopolaGira(fiocco,-90); const fioccoLascato=gradi(boat.jib);
    // con lo spinnaker la corsa arriva a 90°, e il rapporto cambia con lei
    pronti(); boat.spi=true; manopolaGira(fiocco,90); const conSpi=gradi(boat.jib);
    // due giri interi coprono tutta la corsa, né più né meno
    pronti(); boat.trim=90*D2R; manopolaGira(randa,720); const dueGiri=gradi(boat.trim);
    // e oltre il fine corsa non si sfonda
    pronti(); manopolaGira(randa,5000); const tuttaCazzata=gradi(boat.trim);
    pronti(); manopolaGira(randa,-5000); const tuttaLascata=gradi(boat.trim);
    report({ cazzata, lascata, fioccoCazzato, fioccoLascato, conSpi, fioccoFermo,
             randaFerma, dueGiri, tuttaCazzata, tuttaLascata });
  `);

  assert.ok(Math.abs(r.cazzata - 33.75) < 1e-9,
    `in orario si cazza, 8° di manopola per 1° di vela: 45° → ${r.cazzata.toFixed(2)}°`);
  assert.ok(Math.abs(r.lascata - 56.25) < 1e-9,
    `in antiorario si lasca della stessa quantità: 45° → ${r.lascata.toFixed(2)}°`);
  assert.ok(Math.abs(r.fioccoCazzato - 25) < 1e-9,
    `il fiocco ha 80° di corsa, quindi un quarto di giro ne vale 10 (${r.fioccoCazzato.toFixed(2)}°)`);
  assert.ok(Math.abs(r.fioccoLascato - 45) < 1e-9, "e altrettanti dall'altra parte");
  assert.ok(Math.abs(r.conSpi - 23.75) < 1e-9,
    `con lo spi la corsa è 90° e il quarto di giro ne vale 11,25 (${r.conSpi.toFixed(2)}°)`);
  assert.equal(r.fioccoFermo, 35 * Math.PI / 180, "la manopola della randa non tocca il fiocco");
  assert.equal(r.randaFerma, 45 * Math.PI / 180, "e quella del fiocco non tocca la randa");
  assert.equal(r.dueGiri, 0, "due giri interi portano da tutta lascata a tutta cazzata");
  assert.equal(r.tuttaCazzata, 0, "la randa si ferma tutta cazzata");
  assert.ok(Math.abs(r.tuttaLascata - 90) < 1e-9, "e tutta lascata a 90°");
});

test("girando si contano i giri: il salto a ±180° non conta come mezzo giro", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${PRONTI}
    // l'angolo del dito attorno al perno: sullo schermo la y cresce in giù,
    // quindi si gira già nel verso dell'orologio
    const su=manoAngolo(0,-10), destra=manoAngolo(10,0), giu=manoAngolo(0,10);
    // passando davanti al fondo scala il salto di 360° va tolto
    const avanti=manoDelta(170,-170), indietro=manoDelta(-170,170);
    const fermo=manoDelta(45,45);
    // un giro intero in otto passi, come farebbe un dito che gira davvero:
    // deve valere mezza corsa della randa, non un pasticcio di segni
    pronti();
    let a=manoAngolo(0,-10);
    for(let i=1;i<=8;i++){
      const t=(-90+i*45)*D2R, b=manoAngolo(Math.cos(t)*10,Math.sin(t)*10);
      manopolaGira(manopole[0],manoDelta(a,b)); a=b;
    }
    const unGiro=boat.trim*R2D;
    report({ su, destra, giu, avanti, indietro, fermo, unGiro });
  `);

  assert.equal(r.su, -90, "in alto sono −90°");
  assert.equal(r.destra, 0, "a destra 0°");
  assert.equal(r.giu, 90, "in basso +90°: l'angolo cresce in senso orario");
  assert.equal(r.avanti, 20, "davanti al fondo scala il giro continua in avanti");
  assert.equal(r.indietro, -20, "e all'indietro all'indietro");
  assert.equal(r.fermo, 0, "fermo è fermo");
  assert.ok(Math.abs(r.unGiro - 0) < 1e-9,
    `un giro intero in orario vale mezza corsa: 45° → ${r.unGiro.toFixed(2)}°`);
});

test("i comandi a dito rispettano chi comanda: autotimoniere e vele automatiche", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${PRONTI}
    // con l'autotimoniere su ROTTA si sposta la rotta impostata, non la barra
    pronti(); game.pilot=2; joy.timone.x=1; input(0.2);
    const rotta=game.pilotTgt*R2D, barraConPilota=boat.rudderCmd;
    // a vele automatiche la manopola non comanda, ma si governa lo stesso
    pronti(); game.auto=true; manopolaGira(manopole[0],180); joy.timone.x=1; input(0.2);
    const randaAuto=boat.trim, barraAuto=boat.rudderCmd;
    // spenti dal menù non comandano niente nemmeno se l'asse resta sporco
    pronti(); joyAttiva(false); joy.timone.x=1; input(0.2); manopolaGira(manopole[0],180);
    const spento={barra:boat.rudderCmd, randa:boat.trim};
    joyAttiva(false);
    report({ rotta, barraConPilota, randaAuto, barraAuto, spento });
  `);

  assert.ok(Math.abs(r.rotta - 26 * 0.2) < 1e-9,
    `a fondo corsa la rotta accosta come con le frecce, 26°/s (${r.rotta.toFixed(2)}°)`);
  assert.equal(r.barraConPilota, 0, "con l'autotimoniere inserito la barra non la muovi tu");
  assert.equal(r.randaAuto, 45 * Math.PI / 180, "a vele automatiche la manopola non gira le scotte");
  assert.ok(r.barraAuto > 0, "ma il timone resta in mano al marinaio");
  assert.equal(r.spento.barra, 0, "coi comandi a dito spenti la barra sta ferma");
  assert.equal(r.spento.randa, 45 * Math.PI / 180, "e le scotte pure");
});

test("il pad del timone: mezza corsa a metà, e fuori dal pad non si va oltre", async () => {
  const r = await runInGame(`
    ${MONDO}
    // un pad da 126 px: mezza larghezza utile 42
    const meta=joyVettore(21,42), fondo=joyVettore(42,42), oltre=joyVettore(400,42);
    const sinistra=joyVettore(-400,42);
    report({ meta, fondo, oltre, sinistra });
  `);

  assert.ok(Math.abs(r.meta - 0.5) < 1e-9, "a metà pad l'asse vale mezzo");
  assert.equal(r.fondo, 1, "al bordo è pieno");
  assert.equal(r.oltre, 1, "e fuori dal pad non si va oltre");
  assert.equal(r.sinistra, -1, "dall'altra parte lo stesso, col segno opposto");
});

test("la pulsantiera dà gli stessi comandi della tastiera", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${PRONTI}
    // sono le lettere che i pulsanti mandano a comando(): sul telefono non
    // c'è nessun altro modo di darle
    pronti(); comando("t"); const auto=game.auto;
    pronti(); comando("z"); const pilota=game.pilot;
    pronti(); comando("x"); const terzaroli=boat.reef;
    pronti(); comando("f"); const fiocco=boat.jibFurled;
    pronti(); comando("b"); const collo=boat.jibBack;
    pronti(); boat.rudderCmd=0.7; boat.rudderTrim=0.3; comando(" ");
    const barraDritta=boat.rudderCmd, cavRimasto=boat.rudderTrim;
    pronti(); boat.rudderCmd=0.7; boat.rudderTrim=0.3; comando(" ",true);
    const cavAzzerato=boat.rudderTrim;
    report({ auto, pilota, terzaroli, fiocco, collo, barraDritta, cavRimasto, cavAzzerato });
  `);

  assert.equal(r.auto, true, "«Vele auto» accende la regolazione automatica");
  assert.equal(r.pilota, 1, "«Governo» fa un passo dell'autotimoniere");
  assert.equal(r.terzaroli, 1, "«Terzaroli» prende una mano");
  assert.equal(r.fiocco, true, "«Fiocco» lo avvolge");
  assert.equal(r.collo, true, "«A collo» mette il fiocco a collo");
  assert.ok(Math.abs(r.barraDritta - 0.3) < 1e-12,
    "«Barra dritta» riporta al cavallino, come Spazio");
  assert.equal(r.cavRimasto, 0.3, "e il cavallino resta dov'era");
  assert.equal(r.cavAzzerato, 0, "col maiuscolo si azzera anche il cavallino");
});

test("pizzico a due dita: sulla carta ingrandisce, e non segna punti di rotta", async () => {
  const r = await runInGame(`
    ${MONDO}
    const dito=(id,x,y)=>({pointerId:id,offsetX:x,offsetY:y,button:0});
    const puliti=()=>{ tocchi.clear(); pizzico=null; chart.drag=null; cliccoCarta=null;
                       chart.on=true; chart.z=0.2; chart.x=0; chart.y=0; pianoAzzera(true); };
    // due dita che si allontanano: la carta si ingrandisce
    puliti();
    cartaGiu(dito(1,100,400)); cartaGiu(dito(2,300,400));
    cartaMuovi(dito(1,100,400)); cartaMuovi(dito(2,300,400));   // presa
    cartaMuovi(dito(1,50,400));  cartaMuovi(dito(2,350,400));   // allargata
    const zoom=chart.z;
    // e avvicinandole rimpicciolisce
    puliti();
    cartaGiu(dito(1,50,400)); cartaGiu(dito(2,350,400));
    cartaMuovi(dito(1,50,400)); cartaMuovi(dito(2,350,400));
    cartaMuovi(dito(1,140,400)); cartaMuovi(dito(2,260,400));
    const zoomGiu=chart.z;
    // il punto di mezzo trascina la carta
    puliti();
    cartaGiu(dito(1,100,400)); cartaGiu(dito(2,300,400));
    cartaMuovi(dito(1,100,400)); cartaMuovi(dito(2,300,400));
    cartaMuovi(dito(1,160,400)); cartaMuovi(dito(2,360,400));   // stessa distanza, spostate
    const spostata=chart.x;
    // alzando un dito dal pizzico non si segna un punto di rotta
    puliti();
    cartaGiu(dito(1,100,400)); cartaGiu(dito(2,300,400));
    cartaSu(dito(2,300,400)); cartaSu(dito(1,100,400));
    const dopoPizzico=piano.pts.length;
    // con un dito solo, invece, il tocco fermo segna come sempre
    puliti();
    cartaGiu(dito(1,200,400)); cartaSu(dito(1,202,401));
    const conUnDito=piano.pts.length;
    // e trascinando non si segna niente
    puliti();
    cartaGiu(dito(1,200,400)); cartaMuovi(dito(1,260,430)); cartaSu(dito(1,260,430));
    const trascinato=piano.pts.length;
    pianoAzzera(true); chart.on=false; tocchi.clear();
    report({ zoom, zoomGiu, spostata, dopoPizzico, conUnDito, trascinato });
  `);

  assert.ok(r.zoom > 0.2, `allargando le dita la carta si ingrandisce (${r.zoom.toFixed(3)})`);
  assert.ok(Math.abs(r.zoom - 0.2 * 300 / 200) < 1e-9,
    "e lo fa in proporzione a quanto si sono allontanate");
  assert.ok(r.zoomGiu < 0.2, `avvicinandole rimpicciolisce (${r.zoomGiu.toFixed(3)})`);
  assert.ok(Math.abs(r.spostata + 60 / 0.2) < 1e-6,
    `il punto di mezzo trascina la carta di quanto si è spostato (${r.spostata.toFixed(0)})`);
  assert.equal(r.dopoPizzico, 0, "alzando le dita dal pizzico non si segna un punto");
  assert.equal(r.conUnDito, 1, "un dito solo, fermo, segna il punto come prima");
  assert.equal(r.trascinato, 0, "trascinando si sposta la carta e basta");
});
