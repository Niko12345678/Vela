/* LE ROTELLE — passo regolabile, e la barra fra le cose che governano.
 *
 * Uno scatto di rotella a passo pieno muove la scotta di ~6°: giusto per
 * lascare tutto in poppa, troppo per cercare la fascia verde dell'ottimo,
 * che è larga pochi gradi. Da qui il *passo* scelto nel menù, che scala
 * tutto quello che si regola con la rotella tranne lo zoom — e da qui il
 * predefinito a 1/5, verificato in fondo insieme al menù che lo mostra.
 *
 * I collaudi sui versi e sugli accoppiamenti misurano lo scatto PIENO:
 * `pronti()` rimette `wheelStep` a 1 apposta, così parlano di gradi veri e
 * non cambiano di significato se un giorno cambia il predefinito.
 *
 * Qui si collauda `rotella(e)`, la funzione che l'ascoltatore chiama con
 * l'evento vero: la harness non può recapitare eventi (`addEventListener`
 * è un guscio vuoto), quindi il collaudo passa da lei. La fisica non è
 * coinvolta — si guardano solo i comandi — perciò la golden test non ne
 * risente.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInGame } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 9000, start: {x:0,y:0}, name: "test" };`;

/* Uno scatto di rotella come lo manda il browser: 100 px in pixel. */
const SCATTO = `
const scatto = (o={}) => rotella({ deltaY: 0, deltaX: 0, deltaMode: 0,
                                   altKey:false, shiftKey:false, ctrlKey:false, ...o });
const pronti = () => { chart.on=false; game.paused=false; game.auto=false; game.pilot=0;
                       boat.spi=false; boat.jibFurled=false;
                       boat.trim=45*D2R; boat.jib=35*D2R;
                       boat.rudderCmd=0; boat.rudderTrim=0;
                       wheelStep=1; };
`;

test("il passo delle rotelle scala lo scatto, da 1× a un decimo", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCATTO}
    const randa = passo => { pronti(); wheelStep=passo; scatto({deltaY:100});
                             return (boat.trim-45*D2R)*R2D; };
    const barra = passo => { pronti(); wheelStep=passo; scatto({deltaY:-100,altKey:true});
                             return boat.rudderCmd; };
    report({ pieno: randa(1), mezzo: randa(0.5), decimo: randa(0.1),
             bPieno: barra(1), bDecimo: barra(0.1) });
  `);

  // il passo pieno è quello di sempre: ~6° di scotta per scatto
  assert.ok(Math.abs(r.pieno - 6) < 0.01, `scatto pieno = 6° di randa (${r.pieno.toFixed(2)}°)`);
  assert.ok(Math.abs(r.mezzo - r.pieno / 2) < 1e-9,
    `a 1/2 lo scatto vale la metà: ${r.pieno.toFixed(2)}° -> ${r.mezzo.toFixed(2)}°`);
  assert.ok(Math.abs(r.decimo - r.pieno / 10) < 1e-9,
    `a 1/10 vale un decimo: ${r.pieno.toFixed(2)}° -> ${r.decimo.toFixed(2)}°`);
  // e il passo vale per tutto, non solo per le scotte
  assert.ok(Math.abs(r.bDecimo - r.bPieno / 10) < 1e-12,
    `il passo scala anche la barra: ${r.bPieno.toFixed(4)} -> ${r.bDecimo.toFixed(4)}`);
  // un decimo di scatto deve essere fine ma non inutile
  assert.ok(r.decimo > 0.3 && r.decimo < 1,
    `a 1/10 uno scatto sta fra 0,3° e 1° di scotta (${r.decimo.toFixed(2)}°)`);
});

test("Alt+rotella governa la barra, e lo fa anche a vele automatiche", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCATTO}
    pronti(); scatto({deltaY:-100,altKey:true}); const dritta=boat.rudderCmd;
    pronti(); scatto({deltaY:100,altKey:true});  const sinistra=boat.rudderCmd;
    // la barra non deve muovere le scotte, e le scotte non devono muovere la barra
    pronti(); const t0=boat.trim, j0=boat.jib;
    scatto({deltaY:-100,altKey:true});
    const scotteFerme = boat.trim===t0 && boat.jib===j0;
    scatto({deltaY:100});
    const barraFerma = Math.abs(boat.rudderCmd-dritta)<1e-12;
    // con la regolazione vele automatica (T) si governa comunque
    pronti(); game.auto=true; scatto({deltaY:-100,altKey:true});
    const conAuto=boat.rudderCmd, randaAuto=boat.trim;
    // a fine corsa si ferma, non sfonda
    pronti(); for(let i=0;i<40;i++) scatto({deltaY:-100,altKey:true});
    const fondo=boat.rudderCmd;
    // il tasto destro tenuto premuto vale come Alt: si governa con una mano sola
    pronti(); scatto({deltaY:-100,buttons:2});
    const conTastoDestro=boat.rudderCmd, randaTastoDestro=boat.trim;
    report({ dritta, sinistra, scotteFerme, barraFerma, conAuto, randaAuto, fondo,
             conTastoDestro, randaTastoDestro, t0, j0 });
  `);

  assert.ok(r.dritta > 0.05, `rotella in su = barra a dritta (${r.dritta.toFixed(3)})`);
  assert.ok(Math.abs(r.sinistra + r.dritta) < 1e-12,
    `in giù = a sinistra, e della stessa quantità (${r.sinistra.toFixed(3)})`);
  assert.ok(r.scotteFerme, "Alt+rotella non deve toccare le scotte");
  assert.ok(r.barraFerma, "la rotella senza Alt non deve toccare la barra");
  assert.ok(Math.abs(r.conAuto - r.dritta) < 1e-12,
    "a vele automatiche il timone resta in mano al marinaio");
  assert.ok(r.randaAuto === r.t0, "a vele automatiche la rotella non tocca la randa");
  assert.equal(r.fondo, 1, "la barra si ferma a fine corsa");
  assert.ok(Math.abs(r.conTastoDestro - r.dritta) < 1e-12,
    "il tasto destro premuto fa quello che fa Alt");
  assert.ok(r.randaTastoDestro === r.t0, "e nemmeno lui tocca le scotte");
});

test("Alt+Maiusc+rotella muove il cavallino, più fine della barra", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCATTO}
    pronti(); scatto({deltaY:-100,altKey:true});               const barra=boat.rudderCmd;
    pronti(); scatto({deltaY:-100,altKey:true,shiftKey:true});
    report({ barra, cav: boat.rudderTrim, cmd: boat.rudderCmd });
  `);

  assert.ok(r.cav > 0, `il cavallino si sposta (${r.cav.toFixed(4)})`);
  assert.ok(Math.abs(r.barra / r.cav - 5) < 0.01,
    `cinque volte più fine della barra: barra ${r.barra.toFixed(4)}, cavallino ${r.cav.toFixed(4)}`);
  assert.ok(Math.abs(r.cmd - r.cav) < 1e-12,
    "la barra segue il neutro, come fanno già , e .");
});

test("con l'autotimoniere su ROTTA la rotella sposta la rotta, non la barra", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCATTO}
    pronti(); game.pilot=2; game.pilotTgt=0; boat.h=0;
    scatto({deltaY:-100,altKey:true});
    const rotta=game.pilotTgt*R2D, barra=boat.rudderCmd;
    // e la carta ha la precedenza: lì la rotella è lo zoom, non il timone
    pronti(); chart.on=true; chart.z=0.3; scatto({deltaY:-100,altKey:true});
    report({ rotta, barra, zoom: chart.z, barraSuCarta: boat.rudderCmd });
  `);

  assert.ok(Math.abs(r.rotta - 5) < 0.01,
    `lo stesso scatto che porta la barra a dritta accosta la rotta di 5° a dritta (${r.rotta.toFixed(2)}°)`);
  assert.equal(r.barra, 0, "con l'autotimoniere inserito la barra non la muovi tu");
  assert.ok(r.zoom > 0.3, "sulla carta la rotella resta lo zoom");
  assert.equal(r.barraSuCarta, 0, "e non tocca il timone");
});

test("il timone gira al contrario delle scotte, e tutto il governo con lui", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCATTO}
    // stesso scatto (in giù) su scotte e su timone: la randa lasca, la barra
    // va a sinistra. Il verso del timone è quello della ruota, non quello
    // della scotta.
    pronti(); scatto({deltaY:100});               const randaGiu=boat.trim-45*D2R;
    pronti(); scatto({deltaY:100,altKey:true});   const barraGiu=boat.rudderCmd;
    pronti(); scatto({deltaY:100,altKey:true,shiftKey:true}); const cavGiu=boat.rudderTrim;
    pronti(); game.pilot=2; game.pilotTgt=0; boat.h=0;
    scatto({deltaY:100,altKey:true});             const rottaGiu=game.pilotTgt;
    // e il tasto destro premuto segue la stessa regola di Alt
    pronti(); scatto({deltaY:100,buttons:2});     const barraDestroGiu=boat.rudderCmd;
    report({ randaGiu, barraGiu, cavGiu, rottaGiu, barraDestroGiu });
  `);

  assert.ok(r.randaGiu > 0, "la rotella in giù continua a lascare la randa");
  assert.ok(r.barraGiu < -0.05, `la rotella in giù porta la barra a sinistra (${r.barraGiu.toFixed(3)})`);
  assert.ok(r.cavGiu < 0, `e il cavallino con lei (${r.cavGiu.toFixed(4)})`);
  assert.ok(r.rottaGiu < 0, `e la rotta impostata accosta a sinistra (${(r.rottaGiu * 180 / Math.PI).toFixed(2)}°)`);
  assert.ok(Math.abs(r.barraDestroGiu - r.barraGiu) < 1e-12,
    "col tasto destro premuto il verso è lo stesso di Alt");
});

test("doppio click del tasto destro: barra dritta", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCATTO}
    const destro = (t, o={}) => clickDestro({ button:2, timeStamp:t, ...o });
    // due click ravvicinati sul mare rimettono la barra dov'è il neutro
    pronti(); boat.rudderCmd=0.7;
    const primo=destro(1000), secondo=destro(1200);
    const dopoDoppio=boat.rudderCmd;
    // due click lontani nel tempo non sono un doppio click
    pronti(); boat.rudderCmd=0.7; destro(2000); destro(3000);
    const dopoLenti=boat.rudderCmd;
    // il terzo click non fa una seconda coppia col secondo
    pronti(); boat.rudderCmd=0.7; destro(4000); destro(4100);
    boat.rudderCmd=0.7; const terzo=destro(4200);
    const dopoTerzo=boat.rudderCmd;
    // torna al cavallino, non al centro: raddrizzare non cancella la regolazione
    pronti(); boat.rudderTrim=0.3; boat.rudderCmd=0.9;
    destro(5000); destro(5100);
    const conCavallino=boat.rudderCmd, cavRimasto=boat.rudderTrim;
    // e disinserisce l'autotimoniere, come Spazio
    pronti(); game.pilot=2; destro(6000); destro(6100);
    const pilota=game.pilot;
    // il tasto sinistro non c'entra niente
    pronti(); boat.rudderCmd=0.7; destro(7000,{button:0}); destro(7100,{button:0});
    const conSinistro=boat.rudderCmd;
    // sulla carta il doppio click destro non tocca il timone
    pronti(); chart.on=true; boat.rudderCmd=0.7; destro(8000); destro(8100);
    const suCarta=boat.rudderCmd;
    report({ primo, secondo, dopoDoppio, dopoLenti, dopoTerzo, conCavallino,
             cavRimasto, pilota, conSinistro, suCarta });
  `);

  assert.equal(r.primo, false, "un click solo non basta");
  assert.equal(r.secondo, true, "il secondo click ravvicinato è il gesto");
  assert.equal(r.dopoDoppio, 0, "la barra torna dritta");
  assert.equal(r.dopoLenti, 0.7, "due click lenti lasciano la barra dov'è");
  assert.equal(r.dopoTerzo, 0.7, "il terzo click non fa una seconda coppia");
  assert.ok(Math.abs(r.conCavallino - 0.3) < 1e-12,
    `con un cavallino inserito la barra torna lì, non al centro (${r.conCavallino})`);
  assert.equal(r.cavRimasto, 0.3, "e il cavallino resta dov'era");
  assert.equal(r.pilota, 0, "il doppio click riprende la barra, come Spazio");
  assert.equal(r.conSinistro, 0.7, "col tasto sinistro non succede niente");
  assert.equal(r.suCarta, 0.7, "sulla carta il timone non si tocca");
});

test("rotelle invertite: si invertono anche barra e cavallino", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCATTO}
    wheelStep=1;
    const prova = inv => { wheelInv=inv; pronti(); scatto({deltaY:100});
      const randa=boat.trim; pronti(); scatto({deltaY:100,altKey:true});
      return { randa, barra: boat.rudderCmd }; };
    const no=prova(false), si=prova(true);
    wheelInv=false;
    report({ no, si });
  `);

  assert.ok(r.si.randa < r.no.randa, "la randa si inverte");
  assert.ok(Math.abs(r.si.barra + r.no.barra) < 1e-12, "e la barra con lei");
});

/* Il predefinito è 1/5, e non basta che lo sia in `game.js`: il menù mostra
   un'opzione già selezionata, e se le due cose non coincidono il marinaio
   legge 1/5 e gira una rotella che va a passo pieno. Il valore vive in due
   file, quindi si collauda che siano d'accordo. */
test("il passo predefinito è 1/5, e il menù dice la stessa cosa", async () => {
  const r = await runInGame(`
    ${MONDO}
    report({ passo: wheelStep });
  `);
  assert.equal(r.passo, 0.2, "a gioco appena aperto la rotella va a un quinto di scatto");

  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const wstep = html.match(/<select id="wstep">(.*?)<\/select>/s);
  assert.ok(wstep, "il menù del passo rotelle esiste ancora");
  const scelta = wstep[1].match(/<option value="([\d.]+)" selected>/);
  assert.ok(scelta, "un'opzione del passo rotelle è quella predefinita");
  assert.equal(parseFloat(scelta[1]), 0.2, "ed è la stessa che usa il gioco");
});
