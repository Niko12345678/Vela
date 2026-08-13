/* LE CORRENTI DI MAREA.
 *
 * La cosa che questi test difendono, prima di ogni altra, è la
 * **separazione**: la corrente sposta la barca sul fondo e non tocca
 * niente di quello che la barca sente. Il vento apparente si calcola sulla
 * velocità rispetto all'acqua, le resistenze dello scafo pure, e la presa
 * del timone anche. Se un giorno la corrente finisse per sbaglio dentro il
 * vento apparente, la barca sentirebbe un vento che non c'è e tutto il
 * resto del simulatore comincerebbe a mentire piano: il polare, la fascia
 * verde degli strumenti, il consiglio di rotta. Il test 3 è lì per quello.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `
  world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
            size: 9000, start: {x:0,y:0}, name: "test" };
  gusts = []; streaks = []; windDirBase = 0; windBase = 7;
`;

/* Un campo di corrente finto e uniforme: costante nota, per poter fare i
   conti a mano invece di inseguire la griglia vera. */
const UNIFORME = `
  function correnteFinta(ux, uy){
    const n = 4, lato = world.size*1.06, passo = lato/n;
    const u = new Float32Array(n*n), v = new Float32Array(n*n);
    u.fill(ux); v.fill(uy);
    world.corrente = { n, passo, x0:-lato/2, y0:-lato/2, u, v };
  }
`;

test("senza mare vivo la corrente non esiste, e la posizione è quella di sempre", async () => {
  const r = await runInGame(MONDO + UNIFORME + `
    meteoDin = false;
    correnteFinta(1, 0);
    const c = correnteAt(0,0);
    // e la barca deve muoversi esattamente come la sua velocità dice
    boat.x=0;boat.y=0;boat.vx=2;boat.vy=0;boat.h=90*D2R;
    boat.heel=0;boat.yawRate=0;boat.stuck=0;boat.spPrec=0;boat.sbanda=0;
    boat.jibFurled=true;boat.spi=false;boat.jibBack=false;boat.reef=0;
    game.auto=false;game.pilot=0;game.t=0;game.msgT=99;
    boat.trim=90*D2R;boat.jib=80*D2R;                 // vele in bandiera: solo abbrivio
    const x0=boat.x;
    for(let i=0;i<60;i++){ trimWindows(); physics(1/60); }
    report({ cx:c.x, cy:c.y, spostata:boat.x-x0, deriva:boat.cx });
  `);
  assert.equal(r.cx, 0, "col mare fermo la corrente è nulla");
  assert.equal(r.cy, 0, "in tutte e due le componenti");
  assert.equal(r.deriva, 0, "e la barca non ne registra nessuna");
});

test("la corrente sposta la barca sul fondo senza farla andare più forte sull'acqua", async () => {
  const r = await runInGame(MONDO + UNIFORME + `
    meteoDin = true; oraPartenza = 0;
    // marea al culmine: seno = 1
    game.t = (CORR_MAREA/4)/24*GIORNO;
    /* Si misura per **differenza**: la stessa navigazione, una volta con
       la corrente e una senza. Così quello che resta è solo il contributo
       della corrente, senza doversi inventare una barca senza vele — che
       comunque scarroccerebbe, e sporcherebbe il conto. */
    const t0 = game.t;
    const naviga = (ux,uy) => {
      correnteFinta(ux,uy);
      game.t = t0;
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=90*D2R;
      boat.heel=0;boat.yawRate=0;boat.stuck=0;boat.spPrec=0;boat.sbanda=0;
      boat.jibFurled=false;boat.spi=false;boat.jibBack=false;boat.reef=0;
      // anche l'angolo del vento apparente: trimWindows lo legge PRIMA del
      // primo passo, e quello che resta della prova precedente basta a far
      // divergere le due alla settima cifra
      boat.beta=0; boat.rudder=0; boat.rudderCmd=0;
      game.auto=true;game.pilot=0;game.msgT=99;
      trimWindows();
      for(let i=0;i<60*60;i++){ const h=boat.h; trimWindows(); physics(1/60); boat.h=h; game.t+=1/60; }
      return { x:boat.x, y:boat.y, stw:Math.hypot(boat.vx,boat.vy) };
    };
    const senza = naviga(0,0), con = naviga(1,0);
    correnteFinta(1,0); game.t = t0;
    const c = correnteAt(0,0);
    report({ cx:c.x, cy:c.y, senza, con,
             dx: con.x-senza.x, dy: con.y-senza.y });
  `);
  // la tolleranza è quella del seno valutato all'ora giusta, non una resa
  assert.ok(Math.abs(r.cx - 0.35) < 1e-3,
    `al culmine della marea la corrente al largo vale CORR_MAX (ottenuto ${r.cx})`);
  assert.ok(Math.abs(r.cy) < 1e-9, "e va dove la mandiamo, senza componenti fantasma");
  // in sessanta secondi a ~0,35 m/s sono una ventina di metri; la marea
  // intanto gira un po', quindi si controlla l'ordine di grandezza
  assert.ok(r.dx > 15 && r.dx < 25,
    `la corrente deve portare la barca a valle di una ventina di metri (ottenuto ${r.dx.toFixed(1)})`);
  assert.ok(Math.abs(r.dy) < 0.5,
    `e solo a valle, non di traverso (ottenuto ${r.dy.toFixed(2)})`);
  assert.ok(Math.abs(r.con.stw - r.senza.stw) < 1e-9,
    `ma la velocità sull'acqua deve restare identica: la corrente porta, non spinge (${r.senza.stw} contro ${r.con.stw})`);
});

test("la corrente non tocca il vento apparente: è la separazione che regge tutto", async () => {
  const r = await runInGame(MONDO + UNIFORME + `
    meteoDin = true; oraPartenza = 0;
    game.t = (CORR_MAREA/4)/24*GIORNO;
    const misura = (ux, uy) => {
      correnteFinta(ux, uy);
      boat.x=0;boat.y=0;boat.vx=1.8;boat.vy=0.4;boat.h=45*D2R;
      boat.heel=0;boat.yawRate=0;boat.stuck=0;boat.spPrec=0;boat.sbanda=0;
      boat.jibBack=false;boat.jibFurled=false;boat.spi=false;boat.reef=0;
      boat.trim=20*D2R;boat.jib=16*D2R;
      game.auto=false;game.pilot=0;game.msgT=99;
      const vx0=boat.vx, vy0=boat.vy;
      trimWindows(); physics(1/120);
      return { beta:boat.beta, aoa:boat.aoa, heel:boat.heel,
               dvx:boat.vx-vx0, dvy:boat.vy-vy0 };
    };
    const senza = misura(0,0), diTraverso = misura(0,1), diPoppa = misura(1,0);
    report({ senza, diTraverso, diPoppa });
  `);
  for (const [nome, d] of [["di traverso", r.diTraverso], ["in poppa", r.diPoppa]]) {
    assert.equal(d.beta, r.senza.beta,
      `${nome}: il vento apparente deve essere identico — a parità di velocità sull'acqua la barca non può accorgersi della corrente`);
    assert.equal(d.aoa, r.senza.aoa, `${nome}: e con lui l'angolo d'attacco delle vele`);
    assert.equal(d.heel, r.senza.heel, `${nome}: e lo sbandamento`);
    assert.equal(d.dvx, r.senza.dvx,
      `${nome}: nemmeno l'accelerazione sull'acqua può cambiare, o vorrebbe dire che la corrente è finita nelle resistenze`);
    assert.equal(d.dvy, r.senza.dvy, `${nome}: in tutte e due le componenti`);
  }
});

test("la marea gira, e a mezzo ciclo la corrente si è invertita", async () => {
  const r = await runInGame(MONDO + UNIFORME + `
    meteoDin = true; oraPartenza = 0;
    correnteFinta(1, 0);
    const a = t => { game.t = t/24*GIORNO; const c = correnteAt(0,0); return c.x; };
    const q = CORR_MAREA/4;
    report({ culmine:a(q), stanca:a(q*2), contraria:a(q*3), ciclo:a(q+CORR_MAREA),
             periodo: CORR_MAREA });
  `);
  assert.ok(r.culmine > 0.3, `al culmine la corrente scorre piena (${r.culmine.toFixed(3)})`);
  assert.ok(Math.abs(r.stanca) < 0.02,
    `a mezza marea si ferma: è la stanca (${r.stanca.toFixed(3)})`);
  assert.ok(r.contraria < -0.3,
    `e poi si inverte, che è quello che fa una marea (${r.contraria.toFixed(3)})`);
  assert.ok(Math.abs(r.ciclo - r.culmine) < 0.02,
    "dopo un ciclo intero torna dov'era");
});

test("nei canali la corrente stringe, al largo no, e a terra non scorre", async () => {
  const r = await runInGame(`
    mapMode = "ionio"; newWorld("collaudo");
    meteoDin = true; oraPartenza = 0;
    game.t = (CORR_MAREA/4)/24*GIORNO;
    const c = world.corrente;
    let mareCelle = 0, ampMax = 0, somma = 0, terraNonNulla = 0;
    for (let j = 0; j < c.n; j++) for (let i = 0; i < c.n; i++) {
      const k = j*c.n + i;
      const m = Math.hypot(c.u[k], c.v[k]);
      const x = c.x0 + (i+0.5)*c.passo, y = c.y0 + (j+0.5)*c.passo;
      if (landDepth(world.islands, x, y) > 0) { if (m > 0) terraNonNulla++; }
      else if (m > 0) { mareCelle++; somma += m; ampMax = Math.max(ampMax, m); }
    }
    // il costo di costruzione, che si paga a ogni carta nuova
    const t0 = Date.now();
    buildCorrente(world.islands, world.size, "collaudo");
    const ms = Date.now() - t0;
    report({ mareCelle, ampMedia: somma/mareCelle, ampMax, terraNonNulla, ms,
             celle: c.n*c.n });
  `);
  assert.ok(r.mareCelle > r.celle*0.5, "il campo deve coprire il mare della carta");
  assert.equal(r.terraNonNulla, 0, "a terra la corrente non scorre");
  assert.ok(r.ampMax > 1.5,
    `da qualche parte deve stringere davvero: nei canali fra le isole (massimo ${r.ampMax.toFixed(2)})`);
  assert.ok(r.ampMedia < 1.3,
    `ma non ovunque, o non sarebbe un canale (media ${r.ampMedia.toFixed(2)})`);
  assert.ok(r.ms < 400,
    `e il campo si deve costruire in fretta, perché si rifà a ogni carta (${r.ms} ms)`);
});

test("con la corrente la scia esce dalla prua più dello scarroccio", async () => {
  /* L'effetto che si deve vedere navigando, e il motivo per cui gli
     strumenti hanno due velocità: con la corrente di traverso la rotta
     vera non è più quella che dice la bussola, e non di due gradi. */
  const r = await runInGame(MONDO + UNIFORME + `
    meteoDin = true; oraPartenza = 0;
    game.t = (CORR_MAREA/4)/24*GIORNO;
    const prova = (ux,uy) => {
      correnteFinta(ux,uy);
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=90*D2R;
      boat.heel=0;boat.yawRate=0;boat.stuck=0;boat.spPrec=0;boat.sbanda=0;
      boat.jibBack=false;boat.jibFurled=false;boat.spi=false;boat.reef=0;
      game.auto=true;game.pilot=0;game.msgT=99;
      const t0=game.t;
      for(let i=0;i<90*60;i++){ const h=boat.h; trimWindows(); physics(1/60); boat.h=h; game.t+=1/60; }
      game.t=t0;
      const gx=boat.vx+boat.cx, gy=boat.vy+boat.cy;
      return { stw:Math.hypot(boat.vx,boat.vy)*1.94384,
               sog:Math.hypot(gx,gy)*1.94384,
               scarto:Math.abs(norm(angOf(gx,gy)-boat.h))*R2D };
    };
    report({ senza: prova(0,0), traverso: prova(0,1) });
  `);
  assert.ok(Math.abs(r.traverso.stw - r.senza.stw) < 0.05,
    `la velocità sull'acqua non cambia: ${r.senza.stw.toFixed(2)} -> ${r.traverso.stw.toFixed(2)} kn`);
  assert.ok(r.traverso.scarto > r.senza.scarto + 2,
    `ma la rotta vera sì, e di parecchio più dello scarroccio: ${r.senza.scarto.toFixed(1)}° -> ${r.traverso.scarto.toFixed(1)}°`);
});
