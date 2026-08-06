/* GLI STRUMENTI A SCHERMO — quali si vedono, quanto si vede la cartina,
 * e a che ritmo scorre il tempo.
 *
 * Tre comandi che non toccano la fisica ma che, se sbagliati, si vedono a
 * ogni fotogramma:
 *
 * - la **carta ridotta** in basso a destra si ingrandisce con la rotella,
 *   e da lì in poi segue la barca senza mai uscire dai bordi del mondo:
 *   una vista che scivola fuori mostrerebbe mare bianco al posto delle
 *   terre;
 * - ogni **riquadro** si spegne per conto suo, e spegnendone uno la
 *   colonna di sinistra deve *ricompattarsi*: il buco al posto del
 *   riquadro spento sarebbe peggio del riquadro;
 * - il **ritmo** si cambia anche da tastiera, a gradini, e la tendina del
 *   menù deve seguirlo — altrimenti mostra un numero che non è più vero.
 *
 * Il disegno si ascolta come in `impaginazione.test.js`: si mette
 * un'orecchia su `ctx.fillRect` e si guardano i rettangoli grandi, che
 * sono i pannelli.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInGame } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 9000, start: {x:0,y:0}, name: "test" };`;

/* Schermo da computer, joystick spenti: è l'unico caso in cui la carta
   ridotta si disegna, e quindi l'unico in cui si può zoomare. */
const SCRIVANIA = `VW=1440; VH=820; joyAttiva(false);`;

/* I pannelli disegnati in un fotogramma: rettangoli larghi e alti, non i
   segnetti delle scale. */
const PANNELLI = `
const pannelli = () => {
  const r=[];
  const vero=ctx.fillRect;
  ctx.fillRect=(x,y,w,h)=>r.push([x,y,w,h]);
  drawHUD();
  ctx.fillRect=vero;
  return r.filter(q=>q[2]>=100&&q[3]>=30);
};
// solo la colonna di sinistra, dall'alto in basso: i riquadri stretti a
// filo del bordo, non gli strumenti in alto né le scotte in basso
const colonna = () => pannelli().filter(q=>q[0]===14&&q[2]===176).sort((a,b)=>a[1]-b[1]);
const scena = () => {
  game.msgT=0; game.paused=false; boat.stuck=0; boat.gtime=0; game.auto=false;
  voy={from:"Preveza",to:null,t:12,dist:300,moving:true,ghost:null,delta:null};
  piano.pts=[{x:100,y:100}]; piano.i=0; piano.da={x:0,y:0};
  for(const [k] of HUD_VOCI) hud[k]=true;
};
`;

test("la carta ridotta si ingrandisce con la rotella e resta dentro la carta", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCRIVANIA}
    mini.z=1;
    // a zoom 1 l'inquadratura è quella di sempre: tutta la carta, centrata
    // sull'origine anche con la barca in un angolo
    boat.x=world.size*0.4; boat.y=-world.size*0.4;
    const v1=cartinaVista(), kAtteso=MINI_LATO/(world.size*1.06);

    const rett=cartinaRett();
    const suDiLei=(o={})=>rotella({deltaY:0,deltaX:0,deltaMode:0,
      offsetX:rett.x+rett.l/2, offsetY:rett.y+rett.l/2, ...o});

    boat.trim=45*D2R;
    suDiLei({deltaY:-300});                       // rotella in su: si ingrandisce
    const zSu=mini.z, randaDopo=boat.trim;
    suDiLei({deltaY:300}); suDiLei({deltaY:300});  // e in giù si torna indietro
    const zGiu=mini.z;
    for(let i=0;i<40;i++) suDiLei({deltaY:-300});
    const zMax=mini.z;

    // al massimo dello zoom, con la barca in un angolo, la vista non deve
    // scavallare il bordo del mondo
    const semi=world.size*1.06/(2*mini.z), lim=world.size*0.53-semi;
    boat.x=world.size; boat.y=-world.size;
    const vAngolo=cartinaVista();

    // uno scatto sul mare, fuori dalla cartina, resta la scotta di sempre
    mini.z=2; boat.trim=45*D2R; game.auto=false; chart.on=false; game.paused=false;
    wheelStep=1;                       // a scatto pieno, per parlare di gradi veri
    rotella({deltaY:100,deltaX:0,deltaMode:0,offsetX:20,offsetY:20});
    wheelStep=0.2;
    const zSulMare=mini.z, randaSulMare=(boat.trim-45*D2R)*R2D;

    // e con la cartina spenta dal menù non c'è più niente da zoomare
    hud.cartina=false; const rettSpenta=cartinaRett(); hud.cartina=true;

    report({ v1, kAtteso, zSu, zGiu, zMax, lim,
             vAngolo, zSulMare, randaDopo, randaSulMare,
             rettSpenta, rett });
  `);

  assert.ok(Math.abs(r.v1.k - r.kAtteso) < 1e-12,
    "a zoom 1 la scala è quella di sempre");
  assert.equal(Math.abs(r.v1.cx), 0, "e la carta resta centrata sull'origine");
  assert.equal(Math.abs(r.v1.cy), 0, "in tutte e due le direzioni");

  assert.ok(r.zSu > 1.05, `la rotella in su ingrandisce (${r.zSu.toFixed(2)}×)`);
  assert.equal(r.randaDopo, 45 * Math.PI / 180,
    "e sulla cartina non tocca le scotte, che lì sotto non ci sono");
  assert.ok(r.zGiu < r.zSu, `in giù rimpicciolisce (${r.zGiu.toFixed(2)}×)`);
  assert.ok(r.zGiu >= 1, "e non si scende sotto la carta intera");
  assert.equal(r.zMax, 12, "lo zoom si ferma a dodici volte");

  assert.ok(Math.abs(r.vAngolo.cx) <= r.lim + 1e-9 && Math.abs(r.vAngolo.cy) <= r.lim + 1e-9,
    `ingrandita, la vista segue la barca ma non esce dalla carta ` +
    `(${r.vAngolo.cx.toFixed(0)} su un limite di ${r.lim.toFixed(0)})`);

  assert.equal(r.zSulMare, 2, "uno scatto sul mare non tocca lo zoom della cartina");
  assert.ok(Math.abs(r.randaSulMare - 6) < 0.5,
    `e continua a lascare la randa come prima (${r.randaSulMare.toFixed(2)}°)`);
  assert.equal(r.rettSpenta, null, "spenta dal menù, la cartina non si zooma più");
  assert.ok(r.rett.l > 100, "e accesa occupa il suo quadrato in basso a destra");
});

test("ogni strumento si spegne per conto suo, e la colonna si ricompatta", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCRIVANIA}
    ${PANNELLI}
    scena();
    const tutti=colonna();
    hud.traversata=false;  const senzaTraversata=colonna();
    scena(); hud.strumenti=false; const senzaStrumenti=colonna();
    scena(); for(const [k] of HUD_VOCI) hud[k]=false;
    const spentiTutti=pannelli();
    scena();
    const cartinaAccesa=hudBox().cartina;
    hud.cartina=false; const cartinaSpenta=hudBox().cartina;
    scena();
    report({ tutti, senzaTraversata, senzaStrumenti, spentiTutti,
             cartinaAccesa, cartinaSpenta });
  `);

  // con tutto acceso la colonna è traversata (46 alta) e poi rotta (62)
  assert.equal(r.tutti.length, 2, "traversata e rotta, una sotto l'altra");
  const [trav, rotta] = r.tutti;
  assert.equal(trav[3], 46, "la traversata senza fantasma è alta 46");
  assert.equal(rotta[3], 62, "la rotta in corso è alta 62");
  assert.equal(rotta[1] - (trav[1] + trav[3]), 10, "e fra i due c'è un dito d'aria");

  assert.equal(r.senzaTraversata.length, 1, "spenta la traversata resta la rotta");
  assert.equal(r.senzaTraversata[0][1], trav[1],
    "che sale a prendere il suo posto invece di lasciare il buco");

  assert.equal(r.senzaStrumenti[0][1], 14,
    "spenti gli strumenti in alto a sinistra, la colonna comincia da sopra");
  assert.ok(r.senzaStrumenti[0][1] < trav[1], "cioè più su di prima");

  assert.deepEqual(r.spentiTutti, [],
    "spenti tutti, sul mare non resta nessun riquadro");
  assert.equal(r.cartinaAccesa, true, "sul computer la carta ridotta c'è");
  assert.equal(r.cartinaSpenta, false, "e la casella del menù la toglie");
});

test("il ritmo sale e scende a gradini, e lo zero riporta al tempo reale", async () => {
  const r = await runInGame(`
    ${MONDO}
    chart.on=false;
    const sel=document.getElementById("tscale");
    setRitmo(2,false);
    comando("+"); const su=timeScale;
    comando("-"); const giu=timeScale;
    for(let i=0;i<30;i++) comando("+");
    const max=timeScale, selMax=sel.value;
    comando("0"); const zero=timeScale;
    for(let i=0;i<30;i++) comando("-");
    const min=timeScale;
    // + e − non sono più lo zoom della vista: quello è passato a Pag↑ Pag↓
    setRitmo(2,false); game.zoom=3.4;
    comando("+"); const zoomDopoPiu=game.zoom;
    comando("pageup"); const zoomSu=game.zoom;
    comando("pagedown"); comando("pagedown"); const zoomGiu=game.zoom;
    // sulla carta aperta lo zero continua a inquadrare tutto, non a
    // cambiare il ritmo: lì il tempo è già fermo
    setRitmo(4,false); chart.on=true; comando("0");
    const suCarta=timeScale; chart.on=false;
    setRitmo(2,false);
    report({ su, giu, max, selMax, zero, min, ritmi:RITMI,
             zoomDopoPiu, zoomSu, zoomGiu, suCarta });
  `);

  assert.equal(r.su, 3, "da 2× un gradino in su è 3×");
  assert.equal(r.giu, 2, "e uno in giù riporta a 2×");
  assert.equal(r.max, 16, "in cima alla scaletta c'è il 16×");
  assert.equal(r.selMax, "16", "e la tendina del menù lo mostra");
  assert.equal(r.zero, 1, "lo zero è il tempo reale");
  assert.equal(r.min, 1, "e sotto il tempo reale non si scende");
  assert.equal(r.ritmi[r.ritmi.length - 1], 16, "la scaletta arriva a 16×");

  assert.equal(r.zoomDopoPiu, 3.4, "il più non tocca più lo zoom della vista");
  assert.ok(r.zoomSu > 3.4, `Pag↑ ingrandisce (${r.zoomSu.toFixed(2)})`);
  assert.ok(r.zoomGiu < r.zoomSu, "e Pag↓ rimpicciolisce");
  assert.equal(r.suCarta, 4, "sulla carta lo zero resta l'inquadratura");
});

/* La scaletta dei ritmi vive in due file: `RITMI` in game.js e le opzioni
   della tendina in index.html. Se le due non coincidono, i tasti portano il
   gioco a un ritmo che il menù non sa mostrare. */
test("la scaletta dei ritmi e la tendina del menù dicono la stessa cosa", async () => {
  const r = await runInGame(`${MONDO} report({ ritmi: RITMI, ora: timeScale });`);
  assert.equal(r.ora, 2, "a gioco appena aperto il ritmo è 2×");

  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const sel = html.match(/<select id="tscale">(.*?)<\/select>/s);
  assert.ok(sel, "il menù del ritmo esiste ancora");
  const opzioni = [...sel[1].matchAll(/value="([\d.]+)"/g)].map(m => parseFloat(m[1]));
  assert.deepEqual(opzioni, r.ritmi, "le opzioni sono esattamente la scaletta");
  const scelta = sel[1].match(/value="([\d.]+)" selected/);
  assert.ok(scelta && parseFloat(scelta[1]) === r.ora,
    "e quella selezionata è il ritmo con cui parte il gioco");
});
