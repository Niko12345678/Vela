/* LA FLOTTA — che ogni scafo sia una barca diversa, non la stessa con
 * altri numeri.
 *
 * Qui NON si fissano velocità assolute: quelle sono affare della golden
 * test, e riguardano solo lo sloop 11 m. Qui si collauda il *carattere*,
 * sempre in rapporto allo sloop: chi scarroccia di più, chi accelera
 * prima, chi non riesce a virare. Così la taratura di una barca resta
 * libera finché la sua storia resta quella dichiarata in barche.json.
 *
 * Se una di queste asserzioni diventa rossa, la barca ha smesso di essere
 * quella descritta: o la rimetti a posto, o cambi la descrizione.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame, STEADY } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 9000, start: {x:0,y:0}, name: "test" };`;

/* Le costanti che la fisica legge davvero. Una che manca non esplode: si
   propaga come NaN e la barca sparisce dallo schermo senza un errore. */
const COSTANTI = ["SAIL_MAIN","REEF","SAIL_JIB","SAIL_SPI","CLmax","CD0","CDmax",
  "MASS","HULL_F","LIN_F","HULL_L","LIN_L","RUDDER","VHULL","WAVE","YAWTAU",
  "YAW","ARM_M","ARM_J","STIFF","PESCAGGIO","LOA"];

test("ogni barca della flotta è completa e naviga senza NaN", async () => {
  const r = await runInGame(`
    ${MONDO}
    windBase = 7; windDirBase = 0; gusts = []; streaks = [];
    const out = {};
    for (const id of FLOTTA.ordine) {
      setBarca(id);
      const mancanti = ${JSON.stringify(COSTANTI)}.filter(c => K[c] === undefined);
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=90*D2R;boat.heel=0;boat.yawRate=0;
      boat.stuck=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;boat.spi=false;
      boat.reef=0;game.auto=true;game.pilot=0;game.t=0;game.msgT=99;
      for (let i=0;i<3000;i++){ trimWindows(); physics(1/120); game.t+=1/120; }
      out[id] = { mancanti,
        nan: [boat.x,boat.y,boat.h,boat.vx,boat.vy,boat.heel].some(Number.isNaN),
        reefPrimo: K.REEF[0], mani: K.REEF.length,
        kn: Math.hypot(boat.vx,boat.vy)*1.94384 };
    }
    out.__base = BARCA_BASE;
    out.__ordine = FLOTTA.ordine.length;
    report(out);
  `);
  assert.equal(r.__base, "crociera11", "la barca di partenza è quella della golden test");
  assert.ok(r.__ordine >= 2, "la flotta deve avere almeno due barche");
  for (const [id, d] of Object.entries(r)) {
    if (id.startsWith("__")) continue;
    assert.deepEqual(d.mancanti, [], `${id}: costanti mancanti in barche.json`);
    assert.ok(!d.nan, `${id}: la simulazione produce NaN`);
    assert.equal(d.reefPrimo, 1, `${id}: la prima mano di terzaroli è "tutto ferro", cioè 1`);
    assert.ok(d.mani >= 2, `${id}: deve avere almeno una mano di terzaroli`);
    assert.ok(d.kn > 1, `${id}: al traverso con 14 nodi deve muoversi (ottenuto ${d.kn.toFixed(2)})`);
  }
});

test("ogni scafo ha il carattere dichiarato in barche.json", async () => {
  const r = await runInGame(STEADY + `
    ${MONDO}
    const misura = id => {
      setBarca(id);
      // scarroccio: quanto la rotta effettiva si scosta dalla prua, di bolina
      steady(45);
      const scarroccio = Math.abs(norm(angOf(boat.vx,boat.vy) - boat.h)) * R2D;
      steady(90, { wind: 16 });
      const sbandoForte = Math.abs(boat.heel);
      // secondi per arrivare a 2 nodi da fermo, al traverso
      windBase = 7; windDirBase = 0; gusts = []; streaks = [];
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=90*D2R;boat.heel=0;boat.yawRate=0;
      boat.stuck=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;boat.spi=false;
      boat.reef=0;game.auto=true;game.pilot=0;game.t=0;game.msgT=99;
      let spunto = null;
      for (let i=0;i<3000 && spunto===null;i++){ const h=boat.h; trimWindows(); physics(0.02); boat.h=h;
        if (Math.hypot(boat.vx,boat.vy)*1.94384 > 2) spunto = i*0.02; }
      return { scarroccio, sbandoForte, spunto,
               bolina: steady(40), traverso: steady(90),
               leggero: steady(90, { wind: 3 }), forte: steady(90, { wind: 16 }),
               spi: K.SAIL_SPI > 0, mani: K.REEF.length, pescaggio: K.PESCAGGIO };
    };
    // virata di 90° da bolina: la manovra che separa una barca leggera da una pesante
    const virata = id => {
      setBarca(id);
      windBase = 7; windDirBase = 0; gusts = []; streaks = [];
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=45*D2R;boat.heel=0;boat.yawRate=0;
      boat.stuck=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;boat.spi=false;
      boat.reef=0;game.auto=true;game.pilot=2;game.pilotTgt=boat.h;game.t=0;game.msgT=99;
      for (let i=0;i<4000;i++){ trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t+=1/60; }
      game.pilot=0; const h0=boat.h; boat.rudderCmd=-1;
      for (let i=0;i<6000;i++){ trimWindows(); physics(1/120); physics(1/120); game.t+=1/60;
        boat.trim=boat.wM.opt; boat.jib=boat.wJ.opt;
        if (Math.abs(norm(boat.h-h0)) > 90*D2R) return i/60; }
      return null;
    };
    report({ gozzo: misura("gozzo"), sloop: misura("crociera11"),
             regata: misura("regata12"), cutter: misura("cutter15"),
             virataSloop: virata("crociera11"), virataCutter: virata("cutter15"),
             virataGozzo: virata("gozzo") });
  `);

  // ─ gozzo: agile e leggero, ma scarroccia e va piano
  assert.ok(r.gozzo.scarroccio > r.sloop.scarroccio * 1.4,
    `il gozzo deve scarrocciare molto più dello sloop: ${r.sloop.scarroccio.toFixed(1)}° -> ${r.gozzo.scarroccio.toFixed(1)}°`);
  assert.ok(r.gozzo.spunto < r.sloop.spunto,
    `il gozzo deve prendere lo spunto prima dello sloop: ${r.sloop.spunto.toFixed(1)} s -> ${r.gozzo.spunto.toFixed(1)} s`);
  assert.ok(r.gozzo.traverso < r.sloop.traverso && r.gozzo.bolina < r.sloop.bolina,
    "il gozzo deve essere più lento dello sloop sia al traverso sia di bolina");
  assert.ok(!r.gozzo.spi, "il gozzo non ha lo spinnaker");
  assert.equal(r.gozzo.mani, 2, "il gozzo ha una sola mano di terzaroli");
  assert.ok(r.gozzo.pescaggio < r.sloop.pescaggio,
    "il gozzo deve pescare meno dello sloop: è il suo unico vero vantaggio");

  // ─ dodici da regata: punta altissimo, ma è tenera
  assert.ok(r.regata.bolina > r.sloop.bolina * 1.2,
    `la regata deve puntare molto meglio dello sloop: ${r.sloop.bolina.toFixed(2)} -> ${r.regata.bolina.toFixed(2)} kn`);
  assert.ok(r.regata.spunto < r.sloop.spunto,
    "la regata deve accelerare più dello sloop");
  assert.ok(r.regata.sbandoForte > r.sloop.sbandoForte * 1.3,
    `la regata è tenera: con 31 nodi deve sbandare molto più dello sloop (${r.sloop.sbandoForte.toFixed(2)} -> ${r.regata.sbandoForte.toFixed(2)})`);
  assert.ok(r.regata.forte < r.cutter.forte,
    `con vento forte la regata si corica e perde contro il cutter: ${r.regata.forte.toFixed(2)} contro ${r.cutter.forte.toFixed(2)} kn`);

  // ─ cutter: da mare aperto. Fiacco con poco vento, imprendibile con tanto
  assert.ok(r.cutter.forte > r.sloop.forte * 1.1,
    `con 31 nodi il cutter deve staccare lo sloop: ${r.sloop.forte.toFixed(2)} -> ${r.cutter.forte.toFixed(2)} kn`);
  assert.ok(r.cutter.leggero <= r.sloop.leggero * 1.05,
    `con 6 nodi il cutter non deve battere lo sloop: ${r.sloop.leggero.toFixed(2)} contro ${r.cutter.leggero.toFixed(2)} kn`);
  assert.ok(r.cutter.scarroccio < r.sloop.scarroccio,
    "il cutter deve scarrocciare meno dello sloop");
  assert.ok(r.cutter.sbandoForte < r.sloop.sbandoForte,
    "il cutter deve sbandare meno dello sloop");
  assert.ok(r.cutter.spunto > r.sloop.spunto * 1.3,
    `il cutter deve essere molto più lento a prendere lo spunto: ${r.sloop.spunto.toFixed(1)} s -> ${r.cutter.spunto.toFixed(1)} s`);
  assert.ok(r.cutter.pescaggio > r.sloop.pescaggio,
    "il cutter deve pescare più dello sloop");

  // ─ la virata è la manovra che racconta la differenza meglio di tutte
  assert.ok(r.virataSloop !== null && r.virataGozzo !== null && r.virataCutter !== null,
    `ogni barca deve riuscire a virare di 90°: gozzo ${r.virataGozzo}, sloop ${r.virataSloop}, cutter ${r.virataCutter}`);
  assert.ok(r.virataCutter > r.virataSloop * 3,
    `il cutter deve impiegarci molto più dello sloop: ${r.virataSloop.toFixed(1)} s -> ${r.virataCutter.toFixed(1)} s`);
  assert.ok(r.virataCutter < 90,
    `ma deve pur sempre virare in tempi giocabili (ottenuto ${r.virataCutter.toFixed(1)} s)`);
});

test("cambiare barca adatta il corredo al nuovo scafo", async () => {
  const r = await runInGame(`
    ${MONDO}
    setBarca("crociera11");
    boat.reef = 2; boat.spi = true; boat.jibFurled = true;      // corredo da sloop
    const ok = setBarca("gozzo");                                // ...su una barca che non ce l'ha
    const dopoGozzo = { ok, reef: boat.reef, spi: boat.spi, furled: boat.jibFurled,
                        mani: K.REEF.length };
    const idInventato = setBarca("caravella");
    const restaGozzo = barcaCorrente().nome;

    // il selettore del menù, per la via vera: game.started è falso, quindi
    // niente conferma e si cambia subito
    mapMode = "ionio"; newWorld("x");
    setBarca("crociera11"); fillBarche();
    boatEl.onchange({ target: { value: "cutter15", blur(){} } });
    const dalMenu = { nome: barcaCorrente().nome, loa: K.LOA,
                      alVia: Math.hypot(boat.x-world.start.x, boat.y-world.start.y) < 1 };
    setBarca("gozzo"); tutStart(); tutQuit();
    report({ dopoGozzo, idInventato, restaGozzo, dalMenu, dopoTutorial: barcaId });
  `);
  assert.ok(r.dopoGozzo.ok, "setBarca deve accettare un id della flotta");
  assert.ok(r.dopoGozzo.reef <= r.dopoGozzo.mani - 1,
    `i terzaroli vanno riportati entro le mani disponibili: ${r.dopoGozzo.reef} con ${r.dopoGozzo.mani} mani`);
  assert.equal(r.dopoGozzo.spi, false, "su una barca senza spinnaker lo spinnaker va ammainato");
  assert.equal(r.dopoGozzo.furled, false, "e il fiocco torna issato, altrimenti si resta senza vele di prua");
  assert.equal(r.idInventato, false, "un id che non esiste non cambia barca");
  assert.match(r.restaGozzo, /Gozzo/, "dopo un id sbagliato si resta sulla barca precedente");
  assert.match(r.dalMenu.nome, /Cutter/, "il selettore del menù deve cambiare barca davvero");
  assert.equal(r.dalMenu.loa, 15, "e con la barca devono cambiare le costanti della fisica");
  assert.ok(r.dalMenu.alVia, "cambiare barca riporta al via: il corredo è di quello scafo");
  assert.equal(r.dopoTutorial, "crociera11",
    "il tutorial parla di undici metri e ha un passo sullo spinnaker: deve riportare sulla barca base");
});
