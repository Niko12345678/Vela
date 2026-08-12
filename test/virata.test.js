/* LA MANOVRA ASSISTITA — il tasto O.
 *
 * Serve a chi trova la virata difficile da azzeccare, e il suo valore sta
 * tutto in tre proprietà: che funzioni su ogni barca, che *rifiuti* quando
 * non si passa invece di piantare la barca in panne, e che si tolga di
 * mezzo appena il marinaio mette una mano sulla barra.
 *
 * Non collauda la fisica: la manovra scrive solo su barra e scotte, cioè
 * quello che ha sotto mano chiunque. Se questi test diventano rossi senza
 * che nessuno abbia toccato `manovraUpdate`, è la barca che è cambiata.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `
  world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
            size: 9000, start: {x:0,y:0}, name: "test" };
  gusts = []; streaks = []; windDirBase = 0;
`;

/* Porta a regime col pilota su rotta, poi lascia la barra all'uomo. */
const REGIME = `
  function regime(id, twa0, vento){
    setBarca(id);
    windBase = vento;
    boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=twa0*D2R;boat.heel=0;boat.yawRate=0;
    boat.stuck=0;boat.spPrec=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;
    boat.spi=false;boat.reef=0;boat.rudder=0;boat.rudderCmd=0;boat.rudderTrim=0;
    game.auto=true;game.pilot=2;game.pilotTgt=boat.h;game.t=0;game.msgT=99;
    for(let i=0;i<4000;i++){ trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t+=1/60; }
    game.pilot=0;
  }
  // fa girare la manovra fino a quando finisce; torna i secondi, o null
  function corri(sec){
    for(let i=0;i<sec*60;i++){
      manovraUpdate(1/60); trimWindows(); physics(1/120); physics(1/120); game.t+=1/60;
      if(!manovra) return i/60;
    }
    return null;
  }
`;

test("la manovra porta ogni barca dall'altro bordo, e con l'abbrivio addosso", async () => {
  const r = await runInGame(MONDO + REGIME + `
    const out = {};
    for (const id of FLOTTA.ordine)
      for (const vento of [5,7,12]) {
        regime(id,45,vento);
        const h0 = boat.h, kn0 = Math.hypot(boat.vx,boat.vy)*1.94384;
        comando("o");
        const partita = !!manovra;
        const t = partita ? corri(200) : null;
        out[id+"@"+vento] = { partita, t,
          giro: Math.abs(norm(boat.h-h0))*R2D,
          kn0, kn: Math.hypot(boat.vx,boat.vy)*1.94384 };
      }
    report(out);
  `);
  for (const [caso, d] of Object.entries(r)) {
    assert.ok(d.partita, `${caso}: a regime di bolina la manovra deve partire`);
    assert.ok(d.t !== null, `${caso}: e deve finire`);
    assert.ok(d.giro > 60, `${caso}: deve portare la prua dall'altra parte (girati ${d.giro.toFixed(0)}°)`);
    assert.ok(d.t < 40, `${caso}: in tempi umani (ottenuto ${d.t.toFixed(1)} s)`);
    assert.ok(d.kn > 1, `${caso}: e non deve lasciare la barca ferma (${d.kn.toFixed(2)} kn)`);
  }
});

test("in poppa la stessa manovra stramba invece di virare", async () => {
  const r = await runInGame(MONDO + REGIME + `
    regime("crociera11",150,7);
    const h0 = boat.h;
    comando("o");
    const stramba = manovra && manovra.stramba;
    const t = corri(120);
    report({ stramba, t, giro: Math.abs(norm(boat.h-h0))*R2D,
             kn: Math.hypot(boat.vx,boat.vy)*1.94384 });
  `);
  assert.equal(r.stramba, true, "a 150° dal vento la manovra deve essere una strambata");
  assert.ok(r.t !== null && r.t < 30, `che si compie in fretta (ottenuto ${r.t})`);
  assert.ok(r.giro > 25, `passando dall'altro bordo (girati ${r.giro.toFixed(0)}°)`);
  assert.ok(r.kn > 2, "senza fermare la barca: in poppa non si perde abbrivio");
});

test("rifiuta quando l'abbrivio non basta, invece di piantare la barca in panne", async () => {
  const r = await runInGame(MONDO + REGIME + `
    // fermo di bolina: la virata non si può fare, e va detto
    setBarca("crociera11"); windBase=7;
    boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=45*D2R;boat.heel=0;boat.yawRate=0;
    boat.stuck=0;boat.spPrec=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;
    boat.spi=false;boat.reef=0;boat.rudder=0;boat.rudderCmd=0;boat.rudderTrim=0;
    game.auto=true;game.pilot=0;game.t=0;game.msgT=99;
    trimWindows();
    comando("o");
    const fermo = { partita: !!manovra, msg: game.msg, barra: boat.rudderCmd };
    // e con 27 nodi a tutto ferro sotto i tre nodi non si passa: misurato
    setBarca("crociera11"); windBase=14;
    const v=2.0/1.94384, f=dv(45*D2R);
    boat.x=0;boat.y=0;boat.vx=f.x*v;boat.vy=f.y*v;boat.h=45*D2R;boat.heel=0;boat.yawRate=0;
    boat.stuck=0;boat.spPrec=0;boat.jibBack=false;boat.jibFurled=false;boat.spi=false;boat.reef=0;
    boat.rudderCmd=0;boat.rudderTrim=0;game.auto=true;game.pilot=0;game.t=0;game.msgT=99;
    trimWindows();
    comando("o");
    const ventoso = { partita: !!manovra, msg: game.msg };
    // ma con l'abbrivio giusto, sì
    regime("crociera11",45,7);
    comando("o");
    const pronta = !!manovra;
    report({ fermo, ventoso, pronta });
  `);
  assert.equal(r.fermo.partita, false, "da ferma la manovra non deve partire");
  assert.match(r.fermo.msg, /abbrivio/i, "e deve dire perché, in chiaro");
  assert.equal(r.fermo.barra, 0, "senza toccare la barra");
  assert.equal(r.ventoso.partita, false,
    "con 27 nodi a tutto ferro e due nodi di abbrivio non si passa: va rifiutata");
  assert.equal(r.pronta, true, "con l'abbrivio giusto invece parte");
});

test("chi tocca comanda: una mano sulla barra annulla la manovra", async () => {
  const r = await runInGame(MONDO + REGIME + `
    const out={};
    // freccia sulla barra
    regime("crociera11",45,7);
    comando("o");
    for(let i=0;i<60;i++){ manovraUpdate(1/60); physics(1/120); physics(1/120); game.t+=1/60; }
    keys["arrowleft"]=1; input(1/60); keys["arrowleft"]=0;
    out.dopoFreccia = !!manovra; out.msgFreccia = game.msg;
    // Spazio, che riporta la barra al cavallino
    regime("crociera11",45,7);
    comando("o"); corriPoco();
    comando(" ");
    out.dopoSpazio = !!manovra;
    // l'autotimoniere
    regime("crociera11",45,7);
    comando("o"); corriPoco();
    comando("z");
    out.dopoPilota = !!manovra;
    // e premere di nuovo O annulla
    regime("crociera11",45,7);
    comando("o"); corriPoco();
    comando("o");
    out.dopoBis = !!manovra;
    // col pilota inserito non parte nemmeno
    regime("crociera11",45,7); game.pilot=2; game.pilotTgt=boat.h;
    comando("o");
    out.colPilota = !!manovra;
    function corriPoco(){ for(let i=0;i<60;i++){ manovraUpdate(1/60); physics(1/120); physics(1/120); game.t+=1/60; } }
    report(out);
  `);
  assert.equal(r.dopoFreccia, false, "una freccia sulla barra annulla la manovra");
  assert.match(r.msgFreccia, /interrotta/i, "e lo dice");
  assert.equal(r.dopoSpazio, false, "Spazio la annulla");
  assert.equal(r.dopoPilota, false, "inserire l'autotimoniere la annulla");
  assert.equal(r.dopoBis, false, "premere O di nuovo la annulla");
  assert.equal(r.colPilota, false, "e col pilota già inserito non parte");
});

test("l'indicatore dice la stessa cosa che farà la manovra", async () => {
  const r = await runInGame(MONDO + REGIME + `
    const out={};
    regime("crociera11",45,7);
    out.aRegime = { pronta: virataPronta(), parte: (comando("o"), !!manovra) };
    manovraFine(null);
    // ferma
    boat.vx=0;boat.vy=0; trimWindows();
    out.ferma = { pronta: virataPronta(), parte: (comando("o"), !!manovra) };
    manovraFine(null);
    // e la soglia cresce col vento, perché la barca va più forte
    const s=[];
    for(const v of [4,7,10,14]) s.push(andature(v).bolina.v*0.60);
    out.soglie=s;
    report(out);
  `);
  assert.equal(r.aRegime.pronta, true, "a regime l'indicatore è verde");
  assert.equal(r.aRegime.parte, true, "e la manovra parte: dicono la stessa cosa");
  assert.equal(r.ferma.pronta, false, "da ferma l'indicatore è spento");
  assert.equal(r.ferma.parte, false, "e la manovra rifiuta: di nuovo d'accordo");
  for (let i = 1; i < r.soglie.length; i++)
    assert.ok(r.soglie[i] > r.soglie[i-1],
      "la soglia deve crescere col vento, come la velocità di bolina");
});

test("da quattro nodi si vira anche col vento di punta della giornata", async () => {
  /* Questo test nasce da un reclamo: «sono partito con una virata che ero
     a 4 nodi e sono andato in panne». Non era la fisica della virata — è
     misurata identica a prima — era il meteo, che col cursore su 7 m/s
     portava il pomeriggio a 27 nodi perché il rinforzo si moltiplicava
     con le raffiche. A 27 nodi con tutto ferro la barca non vira, ed è
     giusto così; il difetto era arrivarci senza volerlo, partendo da un
     cursore che ne dichiarava tredici.
     Qui si fissa il contratto: al peggio che la giornata può produrre —
     culmine del pomeriggio più raffica piena — una virata da quattro nodi
     deve ancora riuscire. */
  const r = await runInGame(MONDO + `
    setBarca("crociera11");
    windBase = 7; assist = 0.55; meteoSemina("punta");
    // il peggio della giornata: culmine del pomeriggio con la raffica piena
    meteoDin = true;
    let punta = 0;
    for (let i = 0; i < 24*20; i++) {
      game.t = i*GIORNO/(24*20);
      punta = Math.max(punta, ventoAl(game.t).spd*(1+0.46*(0.5+assist*0.5)));
    }
    meteoDin = false; gusts = [];
    const vira = (vento, reef) => {
      windBase = vento;
      const v = 4/1.94384, f = dv(45*D2R);
      boat.x=0;boat.y=0;boat.vx=f.x*v;boat.vy=f.y*v;boat.h=45*D2R;
      boat.heel=0;boat.yawRate=0;boat.stuck=0;boat.spPrec=0;boat.sbanda=0;boat.gtime=0;
      boat.jibBack=false;boat.jibFurled=false;boat.spi=false;boat.reef=reef;
      boat.rudder=0;boat.rudderTrim=0;boat.rudderCmd=-1;
      game.auto=true;game.pilot=0;game.t=0;game.msgT=99;
      trimWindows();
      for (let i=0;i<90*60;i++){
        trimWindows(); physics(1/120); physics(1/120); game.t+=1/60;
        if (norm(boat.h-windDirBase)*R2D < -35 && Math.hypot(boat.vx,boat.vy)*1.94384 > 1.5) return i/60;
      }
      return null;
    };
    report({ punta: punta*1.94384, rif: 7*1.94384,
             ferro: vira(punta,0), unaMano: vira(punta,1) });
  `);
  assert.ok(r.punta < r.rif*1.9,
    `il peggio della giornata non deve arrivare al doppio del cursore: ${r.rif.toFixed(1)} -> ${r.punta.toFixed(1)} kn`);
  assert.ok(r.ferro !== null && r.ferro < 20,
    `a ${r.punta.toFixed(1)} kn una virata da 4 nodi deve riuscire anche a tutto ferro (ottenuto ${r.ferro})`);
  assert.ok(r.unaMano !== null && r.unaMano < r.ferro,
    "e terzarolando deve venire meglio, che è la ragione per cui si terzarola");
});

test("quando c'è troppa tela il gioco lo dice, e tace appena terzaroli", async () => {
  const r = await runInGame(MONDO + `
    setBarca("crociera11"); meteoDin = false;
    /* A rotta bloccata, cioè la barca che sta navigando di bolina: è lì
       che l'avviso deve arrivare, *prima* che la barca straorzi. Lasciata
       libera a quindici metri al secondo si mette dritta nel vento, le
       vele fileggiano e lo sbandamento crolla — a quel punto è già tardi
       e non c'è più niente da segnalare. */
    const prova = (vento, reef) => {
      windBase = vento;
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=45*D2R;boat.heel=0;boat.yawRate=0;
      boat.stuck=0;boat.spPrec=0;boat.sbanda=0;boat.gtime=0;
      boat.jibBack=false;boat.jibFurled=false;boat.spi=false;boat.reef=reef;
      boat.rudderCmd=0;boat.rudderTrim=0;
      game.auto=true;game.pilot=0;game.t=0;game.msg="";game.msgT=0;
      let detto = "";
      for (let i=0;i<90*60;i++){
        const h = boat.h;
        trimWindows(); physics(1/120); physics(1/120); boat.h = h; game.t+=1/60;
        game.msgT = 0;                          // gli avvisi non si accodano
        if (/terzarolare/i.test(game.msg)) { detto = game.msg; break; }
      }
      return { detto, heel: Math.abs(boat.heel) };
    };
    report({ calmo: prova(7,0), forte: prova(15,0), forteTerzarolato: prova(15,2) });
  `);
  assert.equal(r.calmo.detto, "",
    `con sette metri al secondo non c'è niente da terzarolare (sbandamento ${r.calmo.heel.toFixed(2)})`);
  assert.match(r.forte.detto, /terzarolare/i,
    `con quindici sì, e va detto (sbandamento ${r.forte.heel.toFixed(2)})`);
  assert.equal(r.forteTerzarolato.detto, "",
    `ma con due mani prese deve tacere: l'avviso chiede una cosa sola, e va tolto quando è fatta (sbandamento ${r.forteTerzarolato.heel.toFixed(2)})`);
});
