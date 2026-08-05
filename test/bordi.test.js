/* I BORDI — come arrivare dove il vento non lascia andare dritti.
 *
 * È il compasso sulla carta, non un timoniere: come la rotta a matita non
 * tocca la barca e la golden test non deve accorgersene. Qui si collauda
 * quello che *decide* qualcosa — se una rotta si tiene o va spezzata, dove
 * cade il vertice, su che mure si parte, quando un bordo finisce sulla
 * terra — e non il disegno, che si controlla solo perché non produca NaN.
 *
 * Gli angoli buoni non sono scritti da nessuna parte: escono dal polare
 * della barca, quindi qui non si fissano numeri assoluti ma proprietà —
 * che sia un massimo di VMG, che la spezzata chiuda sul bersaglio, che le
 * mure siano quelle del vento vero.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 9000, start: {x:0,y:0}, name: "test" };
               pianoAzzera(true); boat.x = 0; boat.y = 0; boat.vx = 0; boat.vy = 0;`;

test("una rotta che si può tenere resta una linea sola", async () => {
  const r = await runInGame(`
    ${MONDO}
    // vento da nord, bersaglio a est: è un traverso, non c'è niente da spezzare
    const p = bordiPer(0, 0, 3000, 0, 0, 7);
    report({ tipo: p.tipo, rami: p.rami ? 0 : p.scelta.rami.length,
             allunga: p.allunga, ril: p.ril * R2D, twa: p.twa * R2D,
             totale: p.totale, dist: p.dist, nodi: p.v * 1.94384 });
  `);

  assert.equal(r.tipo, "diretta", "al traverso ci si va di filata");
  assert.equal(r.rami, 1, "un bordo solo");
  assert.equal(r.allunga, 1, "e non si allunga di niente");
  assert.ok(Math.abs(r.ril - 90) < 1e-9, "il rilevamento è est");
  assert.ok(Math.abs(r.twa - (-90)) < 1e-9, "vento da sinistra: TWA negativo");
  assert.equal(r.totale, r.dist, "la strada da fare è la distanza");
  assert.ok(r.nodi > 3 && r.nodi < 12, `nodi sensati al traverso (${r.nodi})`);
});

test("controvento la spezzata chiude sul bersaglio, e costa più della diretta", async () => {
  const r = await runInGame(`
    ${MONDO}
    // vento da nord, bersaglio a nord: si può solo bordeggiare
    const p = bordiPer(0, 0, 0, -3000, 0, 7);
    const chiude = o => {
      const v = o.vertice, b = { x: 0, y: -3000 };
      const d1 = dv(o.rami[0].rotta), d2 = dv(o.rami[1].rotta);
      return Math.max(
        Math.hypot(v.x - d1.x*o.rami[0].lung, v.y - d1.y*o.rami[0].lung),
        Math.hypot(v.x + d2.x*o.rami[1].lung - b.x, v.y + d2.y*o.rami[1].lung - b.y));
    };
    report({ tipo: p.tipo, twaOtt: p.twaOtt * R2D, allunga: p.allunga,
             mure: p.scelta.rami.map(b => b.mure),
             lati: p.scelta.rami.map(b => b.lung),
             errore: Math.max(chiude(p.scelta), chiude(p.altra)),
             verticiDiversi: Math.hypot(p.scelta.vertice.x - p.altra.vertice.x,
                                        p.scelta.vertice.y - p.altra.vertice.y),
             stessoCosto: Math.abs(
               p.altra.rami[0].lung + p.altra.rami[1].lung - p.totale) });
  `);

  assert.equal(r.tipo, "bolina");
  assert.ok(r.twaOtt > 28 && r.twaOtt < 60, `bolina in gradi sensati (${r.twaOtt})`);
  assert.ok(r.errore < 1e-6, `i due lati chiudono sul bersaglio (${r.errore} m)`);
  assert.deepEqual(r.mure.slice().sort(), ["dritta", "sinistra"],
    "un bordo per mure: si vira una volta sola");
  assert.ok(r.allunga > 1.15, `bordeggiare allunga la strada (${r.allunga}×)`);
  assert.ok(r.stessoCosto < 1e-6, "virare prima o dopo costa uguale: è lo stesso parallelogramma");
  assert.ok(r.verticiDiversi > 100, "ma il vertice cade in due posti diversi");
});

test("sottovento si stramba solo se si guadagna tempo davvero", async () => {
  const r = await runInGame(`
    ${MONDO}
    // vento da nord, bersaglio a sud: la poppa piena è lenta, ma scendere a
    // zigzag allunga la strada. Il piano deve decidere sul tempo, non sull'angolo
    const casi = [];
    for (const vento of [3, 5, 7, 9, 12, 15]) {
      const p = bordiPer(0, 0, 0, 3000, 0, vento);
      casi.push({ vento, tipo: p.tipo, pari: !!p.pari, allunga: p.allunga,
                  twaOtt: p.twaOtt * R2D, t: p.t, tDiretta: p.tDiretta,
                  guadagno: p.guadagno });
    }
    // e a mezzo lasco, dove il polare dà il suo massimo, non c'è nessun dubbio
    const lasco = bordiPer(0, 0, 0, 3000, 30 * D2R, 7);
    report({ casi, lasco: lasco.tipo });
  `);

  assert.equal(r.lasco, "diretta", "a 150° dal vento la linea si tiene e basta");
  for (const c of r.casi) {
    if (c.tipo === "poppa") {
      assert.ok(c.twaOtt > 100 && c.twaOtt < 180, `${c.vento} m/s: angolo sensato (${c.twaOtt}°)`);
      assert.ok(c.allunga > 1, `${c.vento} m/s: strambare allunga la strada`);
      assert.ok(c.t < c.tDiretta * 0.99,
        `${c.vento} m/s: ma accorcia il tempo di almeno l'1% (${c.t} vs ${c.tDiretta})`);
      assert.ok(c.guadagno > 0, `${c.vento} m/s: il guadagno è quello dichiarato`);
    } else {
      assert.equal(c.tipo, "diretta", `${c.vento} m/s: o si stramba, o si tiene la diretta`);
      assert.ok(c.pari, `${c.vento} m/s: e se si tiene la diretta il piano dice perché`);
      assert.equal(c.allunga, 1, `${c.vento} m/s: senza inventare strada in più`);
    }
  }
});

test("l'angolo scelto è davvero il massimo della VMG", async () => {
  const r = await runInGame(`
    ${MONDO}
    const prova = (vento) => {
      const a = andature(vento);
      const vmg = (t, s) => polarSpeed(t, vento) * s * Math.cos(t * D2R);
      const b = a.bolina.twa * R2D, p = a.poppa.twa * R2D;
      return { bolina: b, poppa: p,
               bolinaMax: [-8,-4,4,8].every(d => vmg(b+d, 1) <= vmg(b, 1) + 1e-9),
               poppaMax:  [-8,-4,4,8].every(d => vmg(p+d,-1) <= vmg(p,-1) + 1e-9) };
    };
    report({ leggero: prova(4), fresco: prova(12) });
  `);

  for (const [nome, v] of Object.entries(r)) {
    assert.ok(v.bolinaMax, `${nome}: nessun angolo vicino stringe meglio (${v.bolina}°)`);
    assert.ok(v.poppaMax, `${nome}: nessun angolo vicino scende meglio (${v.poppa}°)`);
  }
  assert.ok(r.leggero.bolina > r.fresco.bolina - 1e-9,
    `con poco vento non si stringe più che col fresco (${r.leggero.bolina}° vs ${r.fresco.bolina}°)`);
});

test("ogni scafo ha i suoi angoli, e nessuno consiglia uno zigzag inutile", async () => {
  const r = await runInGame(`
    ${MONDO}
    const out = {};
    for (const id of Object.keys(FLOTTA.barche)) {
      setBarca(id);
      out[id] = [4, 8, 14].map(vento => {
        const a = andature(vento), p = bordiPer(0, 0, 0, 3000, 0, vento);
        return { vento, bolina: a.bolina.twa * R2D, poppa: a.poppa.twa * R2D,
                 tipo: p.tipo, pari: !!p.pari, t: p.t, tDiretta: p.tDiretta };
      });
    }
    report(out);
  `);

  for (const [id, casi] of Object.entries(r)) {
    for (const c of casi) {
      assert.ok(c.bolina > 30 && c.bolina < 60, `${id} a ${c.vento} m/s: bolina ${c.bolina}°`);
      assert.ok(c.poppa > 120 && c.poppa <= 180, `${id} a ${c.vento} m/s: poppa ${c.poppa}°`);
      // sottovento la diretta si tiene sempre: o si guadagna tempo, o si tiene lei
      if (c.tipo === "poppa") assert.ok(c.t < c.tDiretta * 0.99,
        `${id} a ${c.vento} m/s: strambare guadagna tempo vero`);
      else assert.ok(c.pari, `${id} a ${c.vento} m/s: e se non guadagna, si tiene la diretta`);
    }
    assert.ok(casi[2].bolina < casi[0].bolina,
      `${id}: col vento fresco si stringe di più (${casi[0].bolina}° → ${casi[2].bolina}°)`);
  }
  assert.ok(r.regata12[1].bolina < r.gozzo[1].bolina,
    `la barca da regata stringe più del gozzo (${r.regata12[1].bolina}° vs ${r.gozzo[1].bolina}°)`);
});

test("con mare libero si fa per primo il bordo lungo", async () => {
  const r = await runInGame(`
    ${MONDO}
    // vento da nord, bersaglio al vento ma spostato a est: il bordo che
    // punta più vicino alla congiungente è quello di sinistra, ed è il lungo
    const d = dv(20 * D2R);
    const p = bordiPer(0, 0, d.x * 3000, d.y * 3000, 0, 7);
    report({ mure: p.scelta.mure, primo: p.scelta.rami[0].lung, secondo: p.scelta.rami[1].lung,
             altra: p.altra.mure });
  `);

  assert.ok(r.primo > r.secondo,
    `si parte sul bordo lungo (${r.primo} m poi ${r.secondo} m)`);
  assert.equal(r.mure, "sinistra", "col bersaglio spostato a est si parte mure a sinistra");
  assert.equal(r.altra, "dritta", "e l'alternativa disegnata è l'altra");
});

test("le mure del piano sono quelle che sentirebbe la barca", async () => {
  const r = await runInGame(`
    ${MONDO}
    windBase = 7; gusts = []; game.t = 0;
    const vento = 40 * D2R;                       // vento da nord-est
    const p = bordiPer(0, 0, 0, -3000, vento, 7);
    // si mette la prua sulla rotta del primo bordo e si guarda da dove
    // arriva il vento apparente: beta positivo vuol dire mure a dritta
    const beta = [];
    for (const ramo of p.scelta.rami) {
      boat.h = ramo.rotta; boat.vx = 0; boat.vy = 0;
      windDirBase = vento - Math.sin(game.t*0.07)*6*D2R - Math.sin(game.t*0.021+1.7)*4*D2R;
      physics(0.001);
      beta.push({ mure: ramo.mure, beta: boat.beta * R2D });
    }
    report({ beta });
  `);

  for (const b of r.beta) {
    if (b.mure === "dritta") assert.ok(b.beta > 0, `mure a dritta: vento da dritta (${b.beta}°)`);
    else assert.ok(b.beta < 0, `mure a sinistra: vento da sinistra (${b.beta}°)`);
  }
});

test("il bordo che finisce sulla terra è segnalato, e si parte dall'altra parte", async () => {
  const r = await runInGame(`
    ${MONDO}
    const isola = (cx, cy, r) =>
      mkIsland([cx-r,cy-r, cx+r,cy-r, cx+r,cy+r, cx-r,cy+r], "scoglio");
    // dove cadono i due vertici, con il bersaglio dritto al vento
    const v = bordiPer(0, 0, 0, -3600, 0, 7).scelta.vertice;
    // un'isola addosso al vertice di est: quella coppia di bordi non si fa
    world.islands = [isola(Math.abs(v.x), v.y, 500)];
    const p = bordiPer(0, 0, 0, -3600, 0, 7);
    // e una anche a ovest: lì non si passa da nessuna parte, e il piano lo
    // dice invece di far finta di niente
    world.islands.push(isola(-Math.abs(v.x), v.y, 500));
    const q = bordiPer(0, 0, 0, -3600, 0, 7);
    report({ terraScelta: p.scelta.terra, terraAltra: p.altra.terra,
             verticeScelto: p.scelta.vertice, chiuso: q.scelta.terra && q.altra.terra });
  `);

  assert.equal(r.terraAltra, true, "il bordo che passa sull'isola è riconosciuto");
  assert.equal(r.terraScelta, false, "quindi si sceglie l'altra coppia");
  assert.ok(r.verticeScelto.x < 0, "cioè si vira dalla parte libera, a ovest dell'isola");
  assert.ok(r.chiuso, "con le isole da tutte e due le parti l'avviso resta acceso");
});

test("accendere i bordi non muove la barca, e la carta li disegna senza NaN", async () => {
  const r = await runInGame(`
    helpEl.classList.remove("on"); tut.on = false;
    mapMode = "ionio"; newWorld("mantova");
    chart.z = 1;
    const d = dv(boat.h);
    pianoClick(boat.x + d.x*2000, boat.y + d.y*2000);
    const prima = { x: boat.x, y: boat.y, h: boat.h, barra: boat.rudderCmd };
    comando("v");                                  // il tasto V accende i bordi
    toggleChart();
    chart.mx = 0;                                  // senza cursore vale il punto di rotta
    seconds(1);
    const conPunto = bordiPiano();
    pianoAzzera(true); chart.mx = 200; chart.my = 200;
    seconds(1);
    const conCursore = bordiPiano();
    toggleChart();
    report({
      acceso: bordiOn,
      fermo: boat.x === prima.x && boat.y === prima.y && boat.h === prima.h
             && boat.rudderCmd === prima.barra,
      fonti: [conPunto && conPunto.fonte, conCursore && conCursore.fonte],
      nan: [conPunto, conCursore].some(p => p && [p.totale, p.t, p.allunga,
             p.scelta.rami[0].rotta].some(Number.isNaN))
    });
  `);

  assert.equal(r.acceso, true, "V accende i bordi");
  assert.ok(r.fermo, "pianificare non tocca la barca");
  assert.deepEqual(r.fonti, ["punto", "cursore"],
    "il bersaglio è il punto di rotta se c'è, il cursore altrimenti");
  assert.ok(!r.nan, "nessun NaN nei numeri del piano");
});
