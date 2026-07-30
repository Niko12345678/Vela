/* LE ROTELLE — passo regolabile, e la barra fra le cose che governano.
 *
 * Uno scatto di rotella a passo pieno muove la scotta di ~6°: giusto per
 * lascare tutto in poppa, troppo per cercare la fascia verde dell'ottimo,
 * che è larga pochi gradi. Da qui il *passo* scelto nel menù, che scala
 * tutto quello che si regola con la rotella tranne lo zoom.
 *
 * Qui si collauda `rotella(e)`, la funzione che l'ascoltatore chiama con
 * l'evento vero: la harness non può recapitare eventi (`addEventListener`
 * è un guscio vuoto), quindi il collaudo passa da lei. La fisica non è
 * coinvolta — si guardano solo i comandi — perciò la golden test non ne
 * risente.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
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
                       boat.rudderCmd=0; boat.rudderTrim=0; };
`;

test("il passo delle rotelle scala lo scatto, da 1× a un decimo", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${SCATTO}
    const randa = passo => { pronti(); wheelStep=passo; scatto({deltaY:100});
                             return (boat.trim-45*D2R)*R2D; };
    const barra = passo => { pronti(); wheelStep=passo; scatto({deltaY:100,altKey:true});
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
    pronti(); scatto({deltaY:100,altKey:true});  const dritta=boat.rudderCmd;
    pronti(); scatto({deltaY:-100,altKey:true}); const sinistra=boat.rudderCmd;
    // la barra non deve muovere le scotte, e le scotte non devono muovere la barra
    pronti(); const t0=boat.trim, j0=boat.jib;
    scatto({deltaY:100,altKey:true});
    const scotteFerme = boat.trim===t0 && boat.jib===j0;
    scatto({deltaY:100});
    const barraFerma = Math.abs(boat.rudderCmd-dritta)<1e-12;
    // con la regolazione vele automatica (T) si governa comunque
    pronti(); game.auto=true; scatto({deltaY:100,altKey:true});
    const conAuto=boat.rudderCmd, randaAuto=boat.trim;
    // a fine corsa si ferma, non sfonda
    pronti(); for(let i=0;i<40;i++) scatto({deltaY:100,altKey:true});
    const fondo=boat.rudderCmd;
    // il tasto destro tenuto premuto vale come Alt: si governa con una mano sola
    pronti(); scatto({deltaY:100,buttons:2});
    const conTastoDestro=boat.rudderCmd, randaTastoDestro=boat.trim;
    report({ dritta, sinistra, scotteFerme, barraFerma, conAuto, randaAuto, fondo,
             conTastoDestro, randaTastoDestro, t0, j0 });
  `);

  assert.ok(r.dritta > 0.05, `rotella in giù = barra a dritta (${r.dritta.toFixed(3)})`);
  assert.ok(Math.abs(r.sinistra + r.dritta) < 1e-12,
    `in su = a sinistra, e della stessa quantità (${r.sinistra.toFixed(3)})`);
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
    pronti(); scatto({deltaY:100,altKey:true});               const barra=boat.rudderCmd;
    pronti(); scatto({deltaY:100,altKey:true,shiftKey:true});
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
    scatto({deltaY:100,altKey:true});
    const rotta=game.pilotTgt*R2D, barra=boat.rudderCmd;
    // e la carta ha la precedenza: lì la rotella è lo zoom, non il timone
    pronti(); chart.on=true; chart.z=0.3; scatto({deltaY:-100,altKey:true});
    report({ rotta, barra, zoom: chart.z, barraSuCarta: boat.rudderCmd });
  `);

  assert.ok(Math.abs(r.rotta - 5) < 0.01, `uno scatto pieno sposta la rotta di 5° (${r.rotta.toFixed(2)}°)`);
  assert.equal(r.barra, 0, "con l'autotimoniere inserito la barra non la muovi tu");
  assert.ok(r.zoom > 0.3, "sulla carta la rotella resta lo zoom");
  assert.equal(r.barraSuCarta, 0, "e non tocca il timone");
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
