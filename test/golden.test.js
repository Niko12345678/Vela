/* GOLDEN TEST — i numeri che definiscono "questa barca".
 *
 * Sono il contratto della simulazione. Se un refactoring li muove oltre la
 * tolleranza, o hai rotto qualcosa o hai cambiato il gioco di proposito:
 * nel secondo caso si aggiornano i valori QUI, in un commit dedicato che
 * dice perché. Mai di straforo insieme ad altro.
 *
 * Le tolleranze sono larghe di proposito: servono a intercettare le
 * regressioni vere (quelle che abbiamo preso in faccia tre volte), non a
 * fissare l'ultima cifra decimale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame, STEADY } from "./harness.js";

const close = (got, want, tol, what) =>
  assert.ok(Math.abs(got - want) <= tol,
    `${what}: atteso ${want} ±${tol}, ottenuto ${got.toFixed(2)}`);

test("polare a 14 nodi di vento", async () => {
  const r = await runInGame(STEADY + `
    world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
              size: 9000, start: {x:0,y:0}, name: "test" };
    report({
      t40: steady(40), t60: steady(60), t90: steady(90),
      t135: steady(135), t180: steady(180)
    });
  `);
  close(r.t40,  3.4, 0.4, "bolina stretta 40°");
  close(r.t60,  5.1, 0.5, "bolina larga 60°");
  close(r.t90,  6.3, 0.5, "traverso 90°");
  close(r.t135, 5.8, 0.5, "gran lasco 135°");
  close(r.t180, 4.3, 0.5, "poppa 180°");
  assert.ok(r.t90 > r.t40, "il traverso deve battere la bolina");
  assert.ok(r.t90 > r.t180, "il traverso deve battere la poppa");
});

test("lo spinnaker paga solo alle andature portanti", async () => {
  const r = await runInGame(STEADY + `
    world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
              size: 9000, start: {x:0,y:0}, name: "test" };
    report({
      bolinaSenza: steady(60), bolinaCon: steady(60, { spi: true }),
      lascoSenza:  steady(140), lascoCon:  steady(140, { spi: true })
    });
  `);
  assert.ok(r.bolinaCon < r.bolinaSenza,
    "di bolina lo spinnaker deve essere un freno");
  assert.ok(r.lascoCon > r.lascoSenza * 1.10,
    `al lasco deve dare almeno il 10%: ${r.lascoSenza.toFixed(2)} -> ${r.lascoCon.toFixed(2)}`);
});

test("con vento forte i terzaroli fanno andare più forte", async () => {
  const r = await runInGame(`
    world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
              size: 9000, start: {x:0,y:0}, name: "test" };
    function bolina(reef) {
      windBase = 16; windDirBase = 0; gusts = []; streaks = [];
      boat.x = 0; boat.y = 0; boat.vx = 0; boat.vy = 0; boat.h = 90 * D2R;
      boat.heel = 0; boat.yawRate = 0; boat.stuck = 0; boat.gtime = 0;
      boat.jibBack = false; boat.jibFurled = false; boat.spi = false; boat.reef = reef;
      game.auto = true; game.pilot = 2; game.pilotTgt = boat.h; game.t = 0; game.msgT = 99;
      for (let i = 0; i < 4500; i++) { trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t += 1/60; }
      game.pilotTgt = 45 * D2R;
      for (let i = 0; i < 9000; i++) { trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t += 1/60; }
      return { kn: Math.hypot(boat.vx, boat.vy) * 1.94384,
               tieneRotta: Math.abs(norm(boat.h - 45*D2R)) * R2D < 10 };
    }
    report({ ferro: bolina(0), terzarolata: bolina(2) });
  `);
  assert.ok(!r.ferro.tieneRotta, "a tutto ferro con 31 nodi deve straorzare");
  assert.ok(r.terzarolata.tieneRotta, "terzarolata deve tenere la rotta");
  assert.ok(r.terzarolata.kn > r.ferro.kn,
    `ridurre la tela deve far andare più forte: ${r.ferro.kn.toFixed(1)} -> ${r.terzarolata.kn.toFixed(1)}`);
});

test("manovra: virata possibile, panne senza uscita se non col fiocco a collo", async () => {
  const r = await runInGame(`
    world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
              size: 9000, start: {x:0,y:0}, name: "test" };
    windBase = 7; windDirBase = 0; gusts = []; streaks = [];

    function cruise(twa) {
      boat.x=0; boat.y=0; boat.vx=0; boat.vy=0; boat.h=twa*D2R; boat.heel=0; boat.yawRate=0;
      boat.stuck=0; boat.gtime=0; boat.jibBack=false; boat.jibFurled=false; boat.spi=false; boat.reef=0;
      game.auto=true; game.pilot=2; game.pilotTgt=boat.h; game.t=0; game.msgT=99;
      for (let i=0;i<4000;i++){ trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t+=1/60; }
      game.pilot=0;
    }
    // punta di velocità di rotazione a barra tutta
    cruise(90);
    let picco=0; boat.rudderCmd=1;
    for (let i=0;i<1200;i++){ trimWindows(); physics(1/120); physics(1/120); game.t+=1/60;
      picco=Math.max(picco, Math.abs(boat.yawRate)*R2D); }
    // virata da bolina
    cruise(45); const h0=boat.h; boat.rudderCmd=-1; let virata=null;
    for (let i=0;i<3000 && virata===null;i++){ trimWindows(); physics(1/120); physics(1/120); game.t+=1/60;
      boat.trim=boat.wM.opt; boat.jib=boat.wJ.opt;
      if (Math.abs(norm(boat.h-h0)) > 90*D2R) virata=i/60; }
    // panne
    function irons(collo){
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=8*D2R;boat.yawRate=0;boat.heel=0;
      boat.stuck=0;boat.gtime=0;boat.trim=70*D2R;boat.jib=60*D2R;
      boat.jibFurled=false;boat.spi=false;boat.reef=0;boat.rudder=0;boat.rudderCmd=0;
      game.auto=false;game.pilot=0;game.t=0;game.msgT=99;boat.jibBack=collo;
      for(let i=0;i<6000;i++){ trimWindows(); physics(1/120); physics(1/120); game.t+=1/60;
        if (Math.abs(boat.beta)>65*D2R && Math.hypot(boat.vx,boat.vy)*1.94384>1.5) return i/60; }
      return null;
    }
    report({ picco, virata, senza: irons(false), collo: irons(true) });
  `);
  close(r.picco, 18, 4, "punta di rotazione (gradi/s)");
  assert.ok(r.virata !== null && r.virata < 20,
    `una virata di 90° deve riuscire in meno di 20 s (ottenuto ${r.virata})`);
  assert.equal(r.senza, null, "senza manovra si deve restare in panne");
  assert.ok(r.collo !== null && r.collo < 30,
    `col fiocco a collo si esce in meno di 30 s (ottenuto ${r.collo})`);
});

test("ombra di vento sottovento alle terre", async () => {
  const r = await runInGame(`
    mapMode = "ionio"; newWorld("x");
    windDirBase = 0; windBase = 7; gusts = []; game.t = 0;
    shadeDir = dv(windDirBase + Math.PI);
    const lef = world.islands.find(i => i.n === "Lefkada");
    let minRatio = 9;
    for (let gx = lef.x0; gx <= lef.x1; gx += 120)
      for (let gy = lef.y1 + 60; gy <= lef.y1 + 1400; gy += 120)
        if (landDepth(world.islands, gx, gy) < 0)
          minRatio = Math.min(minRatio, windAt(gx, gy).spd / windBase);
    const lontano = windAt(lef.x0 - 4000, lef.y1 + 5000).spd / windBase;
    const t0 = Date.now();
    for (let i = 0; i < 200000; i++) windAt(i % 9000 - 4000, (i * 7) % 9000 - 4000);
    report({ minRatio, lontano, msPer200k: Date.now() - t0, dischi: world.shade.length });
  `);
  assert.ok(r.minRatio < 0.55,
    `sottovento a Lefkada il vento deve scendere sotto il 55% (ottenuto ${(r.minRatio*100).toFixed(0)}%)`);
  close(r.lontano, 1, 0.25, "in mare aperto il vento resta pieno");
  assert.ok(r.msPer200k < 900,
    `il campo di vento deve restare veloce: ${r.msPer200k} ms per 200k campioni`);
});

test("la carta del Ionio è navigabile", async () => {
  const r = await runInGame(`
    mapMode = "ionio"; newWorld("x");
    const inAcqua = o => landDepth(world.islands, o.x, o.y) < -60;
    report({
      isole: world.islands.length,
      porti: world.ports.length,
      portiInAcqua: world.ports.every(inAcqua),
      boeInAcqua: world.marks.every(inAcqua),
      partenzaLibera: landDepth(world.islands, world.start.x, world.start.y) < -150,
      geo: !!world.geo,
      punti: world.islands.reduce((a, i) => a + i.p.length / 2, 0)
    });
  `);
  assert.ok(r.isole >= 15, "le terre della carta ionica");
  assert.ok(r.porti >= 14, "i porti disponibili");
  assert.ok(r.portiInAcqua, "ogni porto deve stare in acqua navigabile");
  assert.ok(r.boeInAcqua, "ogni boa deve stare in acqua navigabile");
  assert.ok(r.partenzaLibera, "la partenza deve avere acqua libera attorno");
  assert.ok(r.geo, "la carta deve essere georeferenziata");
});

test("la scala temporale non altera la simulazione", async () => {
  const r = await runInGame(`
    world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
              size: 9000, start: {x:0,y:0}, name: "test" };
    windBase = 7; windDirBase = 0; gusts = []; streaks = [];
    helpEl.classList.remove("on"); tut.on = false; game.paused = false;
    const prova = ts => {
      timeScale = ts;
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=90*D2R;boat.heel=0;boat.yawRate=0;
      boat.stuck=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;boat.spi=false;boat.reef=0;
      game.auto=true;game.pilot=2;game.pilotTgt=boat.h;game.t=0;game.msgT=99;
      tick(Math.round(9000 / ts));
      return Math.hypot(boat.vx, boat.vy) * 1.94384;
    };
    report({ x1: prova(1), x2: prova(2), x6: prova(6) });
  `);
  close(r.x2, r.x1, 0.05, "ritmo 2× contro 1×");
  close(r.x6, r.x1, 0.05, "ritmo 6× contro 1×");
});

test("il gioco parte, gira e non produce NaN", async () => {
  const r = await runInGame(`
    helpEl.classList.remove("on"); tut.on = false;
    mapMode = "ionio"; newWorld("mantova");
    seconds(30);
    toggleChart(); seconds(3); toggleChart();
    toggleLog();  seconds(1); toggleLog();
    report({
      nan: [boat.x, boat.y, boat.h, boat.vx, chart.x, chart.z].some(Number.isNaN),
      mosso: Math.hypot(boat.x - world.start.x, boat.y - world.start.y) > 5
    });
  `);
  assert.ok(!r.nan, "nessun NaN dopo un giro completo di interfaccia");
  assert.ok(r.mosso, "la barca deve essersi mossa");
});
