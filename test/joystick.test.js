/* I COMANDI COL DITO — joystick, pulsantiera e pizzico sulla carta.
 *
 * Sul telefono i sei pulsanti di prima erano tutto o niente: o la scotta
 * stava ferma o correva a 50°/s, e la fascia verde dell'ottimo è larga
 * pochi gradi. I due pad danno la stessa corsa massima delle frecce e
 * tutto quello che c'è sotto, quindi qui si collauda soprattutto *quanto*
 * si muovono e *da che parte*.
 *
 * Come per le rotelle, la harness non recapita eventi: si scrive negli
 * assi (`joy.timone.x`, `joy.vele`) e si chiama `input(dt)`, che è
 * esattamente quello che fa il ciclo di gioco; per la carta si chiamano a
 * mano `cartaGiu/Muovi/Su`, come si fa con `rotella(e)`. La fisica non è
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

test("il pad delle vele: in verticale la randa, in orizzontale il fiocco", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${PRONTI}
    const gradi = v => v*R2D;
    pronti(); joy.vele.y=1;  input(0.2); const randaSu=gradi(boat.trim), fioccoFermo1=boat.jib;
    pronti(); joy.vele.y=-1; input(0.2); const randaGiu=gradi(boat.trim);
    pronti(); joy.vele.x=-1; input(0.2); const fioccoSin=gradi(boat.jib), randaFerma=boat.trim;
    pronti(); joy.vele.x=1;  input(0.2); const fioccoDes=gradi(boat.jib);
    // le due scotte insieme, come sa fare solo un pad a due assi
    pronti(); joy.vele.x=-1; joy.vele.y=1; input(0.2);
    const insieme={randa:gradi(boat.trim), fiocco:gradi(boat.jib)};
    // stessa corsa dei tasti: 50°/s a fondo corsa
    pronti(); keys["arrowup"]=1; input(0.2); const conFreccia=gradi(boat.trim);
    // fine corsa delle scotte
    pronti(); joy.vele.y=1;  for(let i=0;i<20;i++) input(0.2); const tuttaCazzata=gradi(boat.trim);
    pronti(); joy.vele.y=-1; for(let i=0;i<20;i++) input(0.2); const tuttaLascata=gradi(boat.trim);
    report({ randaSu, randaGiu, fioccoSin, fioccoDes, fioccoFermo1, randaFerma,
             insieme, conFreccia, tuttaCazzata, tuttaLascata });
  `);

  assert.ok(Math.abs(r.randaSu - 35) < 1e-9, `in su cazza la randa: 45° → ${r.randaSu.toFixed(1)}°`);
  assert.ok(Math.abs(r.randaGiu - 55) < 1e-9, `in giù la lasca: 45° → ${r.randaGiu.toFixed(1)}°`);
  assert.ok(Math.abs(r.fioccoSin - 25) < 1e-9,
    `a sinistra cazza il fiocco, come la rotella orizzontale: 35° → ${r.fioccoSin.toFixed(1)}°`);
  assert.ok(Math.abs(r.fioccoDes - 45) < 1e-9, `a destra lo lasca: 35° → ${r.fioccoDes.toFixed(1)}°`);
  assert.equal(r.fioccoFermo1, 35 * Math.PI / 180, "l'asse verticale non tocca il fiocco");
  assert.equal(r.randaFerma, 45 * Math.PI / 180, "e l'orizzontale non tocca la randa");
  assert.ok(Math.abs(r.insieme.randa - 35) < 1e-9 && Math.abs(r.insieme.fiocco - 25) < 1e-9,
    "in diagonale si cazzano tutte e due insieme");
  assert.ok(Math.abs(r.conFreccia - r.randaSu) < 1e-12,
    "a fondo corsa il pad vale la freccia tenuta premuta");
  assert.equal(r.tuttaCazzata, 0, "la randa si ferma tutta cazzata");
  assert.ok(Math.abs(r.tuttaLascata - 90) < 1e-9, "e tutta lascata a 90°");
});

test("il joystick rispetta chi comanda: autotimoniere e vele automatiche", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${PRONTI}
    // con l'autotimoniere su ROTTA si sposta la rotta impostata, non la barra
    pronti(); game.pilot=2; joy.timone.x=1; input(0.2);
    const rotta=game.pilotTgt*R2D, barraConPilota=boat.rudderCmd;
    // a vele automatiche le scotte non si toccano, ma si governa lo stesso
    pronti(); game.auto=true; joy.vele.y=1; joy.timone.x=1; input(0.2);
    const randaAuto=boat.trim, barraAuto=boat.rudderCmd;
    // spento dal menù, il pad non comanda niente nemmeno se resta sporco
    pronti(); joyAttiva(false); joy.timone.x=1; joy.vele.y=1; input(0.2);
    const spento={barra:boat.rudderCmd, randa:boat.trim};
    joyAttiva(false);
    report({ rotta, barraConPilota, randaAuto, barraAuto, spento });
  `);

  assert.ok(Math.abs(r.rotta - 26 * 0.2) < 1e-9,
    `a fondo corsa la rotta accosta come con le frecce, 26°/s (${r.rotta.toFixed(2)}°)`);
  assert.equal(r.barraConPilota, 0, "con l'autotimoniere inserito la barra non la muovi tu");
  assert.equal(r.randaAuto, 45 * Math.PI / 180, "a vele automatiche il pad non tocca le scotte");
  assert.ok(r.barraAuto > 0, "ma il timone resta in mano al marinaio");
  assert.equal(r.spento.barra, 0, "col joystick spento la barra sta ferma");
  assert.equal(r.spento.randa, 45 * Math.PI / 180, "e le scotte pure");
});

test("il pad tondo è una cloche: agli angoli il vettore si accorcia", async () => {
  const r = await runInGame(`
    ${MONDO}
    // il dito nell'angolo in alto a sinistra di un pad da 120 px
    const angolo=joyVettore(-60,-60,38,38,false);
    const destra=joyVettore(60,0,38,38,false);
    const oltre=joyVettore(400,-400,38,38,false);
    // il timone ha un asse solo: il verticale non lo tocca
    const timone=joyVettore(60,-60,42,20,true);
    report({ angolo, destra, oltre, timone,
             modAngolo:Math.hypot(angolo.x,angolo.y), modOltre:Math.hypot(oltre.x,oltre.y) });
  `);

  assert.ok(Math.abs(r.modAngolo - 1) < 1e-9,
    `in diagonale il vettore resta lungo 1, non 1,41 (${r.modAngolo.toFixed(3)})`);
  assert.ok(Math.abs(r.angolo.x + 0.7071) < 1e-3 && Math.abs(r.angolo.y - 0.7071) < 1e-3,
    "e i due assi valgono 0,7 per uno — a sinistra cazza, in su cazza");
  assert.ok(Math.abs(r.destra.x - 1) < 1e-9 && r.destra.y === 0,
    "sull'asse il fondo corsa resta pieno");
  assert.ok(Math.abs(r.modOltre - 1) < 1e-9, "e fuori dal pad non si va oltre");
  assert.ok(Math.abs(r.timone.x - 1) < 1e-9 && r.timone.y === 0,
    "il pad del timone ignora il verticale");
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
