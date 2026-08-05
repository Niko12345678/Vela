/* IL CONSIGLIO DI ROTTA — da che parte si va, col vento che c'è.
 *
 * È il compasso sulla carta come i bordi, non un timoniere: traccia una
 * spezzata dentro `piano` e non tocca la barca, quindi la golden test non
 * deve accorgersene. Qui si collauda quello che *decide* qualcosa — che la
 * rotta stia in acqua, che giri le terre, che eviti le ombre di vento, che
 * a mare libero non inventi punti che non servono — e non il disegno, che
 * si controlla solo perché non produca NaN.
 *
 * Nessun numero assoluto: il tempo di una tratta esce dal polare della
 * barca, quindi si collaudano proprietà — che il conto della griglia sia
 * lo stesso dei bordi, che deviare per il vento costi meno che tirare
 * dritto, che togliere l'ostacolo raddrizzi la rotta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 12000, start: {x:0,y:0}, name: "test" };
               pianoAzzera(true); consiglio = null; destPorto = null;
               boat.x = 0; boat.y = 0; boat.vx = 0; boat.vy = 0;
               windBase = 7; windDirBase = 0; gusts = []; game.t = 0;`;

test("il tempo di una tratta è lo stesso che calcolano i bordi", async () => {
  const r = await runInGame(`
    ${MONDO}
    // stessa tratta, due conti diversi: bordiPer risolve il parallelogramma
    // delle due mure, velocitaUtile divide la VMG per il coseno. Devono dare
    // lo stesso tempo, se no la griglia sceglierebbe rotte che i bordi poi
    // smentiscono
    const casi = [];
    for (const vento of [4, 7, 12]) {
      for (const twaDeg of [0, 20, 35, 50, 90, 130, 160, 180]) {
        const d = dv(twaDeg * D2R);                 // vento da nord: la rotta a twa dal vento
        const p = bordiPer(0, 0, d.x * 3000, d.y * 3000, 0, vento);
        const v = velocitaUtile(twaDeg * D2R, vento);
        casi.push({ vento, twaDeg, tipo: p.tipo, tBordi: p.t, tGriglia: 3000 / v });
      }
    }
    report({ casi });
  `);

  for (const c of r.casi) {
    assert.ok(c.tGriglia > 0 && isFinite(c.tGriglia),
      `${c.vento} m/s a ${c.twaDeg}°: una velocità utile c'è sempre`);
    assert.ok(Math.abs(c.tBordi - c.tGriglia) < 1e-6 * c.tBordi,
      `${c.vento} m/s a ${c.twaDeg}° (${c.tipo}): ${c.tGriglia} contro ${c.tBordi} dei bordi`);
  }
});

test("a mare libero non si inventano punti, nemmeno controvento", async () => {
  const r = await runInGame(`
    ${MONDO}
    // vento da nord. Sottovento, al traverso e in bolina piena: in mare
    // aperto la risposta a "da che parte ci vado" è sempre "dritto", e i
    // bordi sono un'altra domanda, quella a cui risponde V
    const prova = (nome, bx, by) => {
      const c = consigliaRotta(0, 0, bx, by);
      const u = c.punti[c.punti.length - 1];
      return { nome, punti: c.punti.length, scarto: Math.hypot(u.x - bx, u.y - by),
               allunga: c.allunga, t: c.t, tDiretta: c.tDiretta };
    };
    report({ poppa: prova("poppa", 0, 3000), traverso: prova("traverso", 3000, 0),
             bolina: prova("bolina", 0, -3000), obliqua: prova("obliqua", 1800, -2400) });
  `);

  for (const [nome, c] of Object.entries(r)) {
    assert.equal(c.punti, 1, `${nome}: un punto solo, quello dove si vuole arrivare`);
    assert.ok(c.scarto < 1, `${nome}: e cade esattamente sul bersaglio (${c.scarto} m)`);
    assert.ok(Math.abs(c.allunga - 1) < 1e-9, `${nome}: senza allungare la strada`);
    assert.ok(Math.abs(c.t - c.tDiretta) < 1e-6 * c.t,
      `${nome}: e il tempo è quello della linea diretta`);
  }
  assert.ok(r.bolina.t > r.traverso.t,
    `la stessa distanza in bolina costa più che al traverso (${r.bolina.t} vs ${r.traverso.t})`);
});

test("un'isola in mezzo si gira, e la rotta resta in acqua", async () => {
  const r = await runInGame(`
    ${MONDO}
    const isola = (cx, cy, rr) => {
      const p = [];
      for (let i = 0; i < 24; i++) { const d = dv(i / 24 * TAU); p.push(cx + d.x*rr, cy + d.y*rr); }
      return mkIsland(p, "scoglio");
    };
    // un'isola tonda a metà strada, larga il doppio del margine di sicurezza
    world.islands = [isola(0, -1500, 700)];
    world.shade = buildShade(world.islands);
    const c = consigliaRotta(0, 0, 0, -3000);
    // ogni tratta va guardata in acqua per conto suo, con lo stesso metro
    // dei nodi: la rotta serve a passare, non a sfiorare
    let px = 0, py = 0, minDist = 1e9;
    for (const p of c.punti) {
      const n = Math.ceil(Math.hypot(p.x-px, p.y-py) / 50);
      for (let i = 0; i <= n; i++) {
        const t = i/n;
        minDist = Math.min(minDist, -landDepth(world.islands, px+(p.x-px)*t, py+(p.y-py)*t));
      }
      px = p.x; py = p.y;
    }
    // e senza isola la stessa rotta torna una linea sola
    world.islands = []; world.shade = [];
    const libera = consigliaRotta(0, 0, 0, -3000);
    report({ punti: c.punti.length, allunga: c.allunga, minDist,
             dirittaConIsola: c.diretta, senzaIsola: libera.punti.length });
  `);

  assert.equal(r.dirittaConIsola, false, "la linea diretta passava sull'isola");
  assert.ok(r.punti >= 2, `per girarla serve almeno un punto in mezzo (${r.punti})`);
  assert.ok(r.minDist > 90, `e la rotta resta al largo della costa (${r.minDist.toFixed(0)} m)`);
  assert.ok(r.allunga > 1.05 && r.allunga < 2,
    `girare allunga, ma non si fa il giro del mondo (${r.allunga}×)`);
  assert.equal(r.senzaIsola, 1, "tolta l'isola, la stessa rotta torna dritta");
});

test("l'ombra di vento si aggira anche dove il mare è libero", async () => {
  const r = await runInGame(`
    ${MONDO}
    // nessuna terra: solo un buco di vento in mezzo alla rotta, come quello
    // che un'isola alta si porta sottovento. Il mare è tutto navigabile,
    // quindi se la rotta devia è per il vento e per nient'altro
    world.islands = [];
    world.shade = [{ x: 0, y: -600, r: 420, L: 3400 }];
    const c = consigliaRotta(0, 0, 0, 2400);
    let largo = 0, px = 0, py = 0;
    for (const p of c.punti) largo = Math.max(largo, Math.abs(p.x));
    // lo stesso viaggio senza il buco
    world.shade = [];
    const pulita = consigliaRotta(0, 0, 0, 2400);
    // e quanto costava tirare dritto dentro l'ombra
    world.shade = [{ x: 0, y: -600, r: 420, L: 3400 }];
    const dritto = consTempo(0, 0, 0, 2400, 150);
    report({ punti: c.punti.length, largo, t: c.t, dritto, allunga: c.allunga,
             senzaOmbra: pulita.punti.length, tSenzaOmbra: pulita.t });
  `);

  assert.ok(r.punti >= 2, `si esce dall'ombra e si rientra: servono punti (${r.punti})`);
  assert.ok(r.largo > 400, `e si passa davvero al largo del cono (${r.largo.toFixed(0)} m)`);
  assert.ok(r.allunga > 1, "la strada si allunga");
  assert.ok(r.t < r.dritto * 0.97,
    `ma il tempo cala: ${r.t.toFixed(0)} s contro ${r.dritto.toFixed(0)} tirando dritto`);
  assert.equal(r.senzaOmbra, 1, "senza il buco di vento la stessa rotta è una linea sola");
  assert.ok(r.t > r.tSenzaOmbra, "l'ombra si paga comunque: aggirarla costa più che non averla");
});

test("una lingua di terra più stretta della maglia non si taglia lo stesso", async () => {
  const r = await runInGame(`
    ${MONDO}
    // Un muro di terra sottile in mezzo alla rotta. I nodi della griglia si
    // guardano nei loro punti, e una striscia più stretta del passo può
    // passare fra una fila di nodi e l'altra senza farsi vedere: è così che
    // una rotta consigliata tagliava una penisola. Lo si prova a quattro
    // altezze diverse, perché a seconda di dove cade il muro rispetto alle
    // file di nodi il tranello scatta o no
    const muro = (cy, sp) =>
      mkIsland([-2000, cy-sp, 2000, cy-sp, 2000, cy+sp, -2000, cy+sp], "istmo");
    const casi = [];
    for (const cy of [-3000, -2910, -2820, -2730]) {
      world.islands = [muro(cy, 30)];               // sessanta metri di terra in tutto
      world.shade = [];
      const c = consigliaRotta(0, 0, 0, -6000);
      let dentro = 0, px = 0, py = 0;
      if (c) for (const p of c.punti) {
        const n = Math.ceil(Math.hypot(p.x-px, p.y-py) / 20);
        for (let i = 0; i <= n; i++) {
          const t = i/n;
          if (landDepth(world.islands, px+(p.x-px)*t, py+(p.y-py)*t) > 0) dentro++;
        }
        px = p.x; py = p.y;
      }
      casi.push({ cy, trovata: !!c, dentro, punti: c ? c.punti.length : 0,
                  allunga: c ? c.allunga : 0 });
    }
    report({ casi });
  `);

  for (const c of r.casi) {
    assert.ok(c.trovata, `muro a ${c.cy}: la rotta attorno c'è, e va trovata`);
    assert.equal(c.dentro, 0, `muro a ${c.cy}: nessun pezzo di rotta passa sulla terra`);
    assert.ok(c.allunga > 1, `muro a ${c.cy}: girarlo allunga la strada`);
  }
});

test("le traversate che tagliavano le penisole ora le girano", async () => {
  const r = await runInGame(`
    helpEl.classList.remove("on"); tut.on = false;
    mapMode = "ionio"; newWorld("mantova");
    const P = n => world.ports.find(o => o.n === n);
    windBase = 8; windDirBase = 315 * D2R;
    // sono le sei coppie che passavano sulla terra: la griglia le portava
    // dritte attraverso un istmo più stretto della sua maglia
    const out = {};
    for (const [da, a] of [["Preveza","Palairos"], ["Nydri","Argostoli"],
                           ["Sivota","Argostoli"], ["Spartochori","Argostoli"],
                           ["Argostoli","Kalamos"], ["Argostoli","Mytikas"]]) {
      const p1 = P(da), p2 = P(a);
      const c = consigliaRotta(p1.x, p1.y, p2.x, p2.y);
      let peggio = 1e9, px = p1.x, py = p1.y;
      for (const q of c.punti) {
        const n = Math.ceil(Math.hypot(q.x-px, q.y-py) / 25);
        for (let i = 0; i <= n; i++) {
          const t = i/n, x = px+(q.x-px)*t, y = py+(q.y-py)*t;
          if (Math.hypot(x-p1.x, y-p1.y) < 300 || Math.hypot(x-p2.x, y-p2.y) < 300) continue;
          peggio = Math.min(peggio, -landDepth(world.islands, x, y));
        }
        px = q.x; py = q.y;
      }
      out[da + " → " + a] = { peggio, punti: c.punti.length };
    }
    report(out);
  `);

  for (const [rotta, c] of Object.entries(r))
    assert.ok(c.peggio > 90,
      `${rotta}: la rotta resta al largo della costa (${c.peggio.toFixed(0)} m nel punto peggiore)`);
});

test("il bersaglio è il porto d'arrivo, poi l'incarico, poi la rotta, poi il cursore", async () => {
  const r = await runInGame(`
    ${MONDO}
    world.ports = [{n:"Qui",x:0,y:0}, {n:"Là",x:2000,y:-500}, {n:"Laggiù",x:-1800,y:900}];
    chart.on = true; chart.z = 1; chart.x = 0; chart.y = 0;
    chart.mx = VW/2 + 300; chart.my = VH/2 + 300;      // cursore a (300, 300)
    const fonti = [];
    fonti.push(consiglioBersaglio());                   // solo il cursore
    pianoClick(600, -600);
    fonti.push(consiglioBersaglio());                   // ora c'è una rotta tracciata
    CARRIERA.attiva = true; CARRIERA.incarico = { a: "Laggiù" };
    fonti.push(consiglioBersaglio());                   // il carico a bordo ha la precedenza
    destPorto = "Là";
    fonti.push(consiglioBersaglio());                   // ma la scelta esplicita vince su tutto
    CARRIERA.attiva = false; CARRIERA.incarico = null;
    chart.on = false; pianoAzzera(true); destPorto = null;
    const vuoto = consiglioBersaglio();                 // niente da nessuna parte
    report({ fonti: fonti.map(f => [f.fonte, f.nome, Math.round(f.x), Math.round(f.y)]),
             vuoto });
  `);

  assert.deepEqual(r.fonti, [
    ["cursore", null, 300, 300],
    ["punto", null, 600, -600],
    ["incarico", "Laggiù", -1800, 900],
    ["menu", "Là", 2000, -500],
  ], "l'ordine è: menù, incarico, ultimo punto della rotta, cursore");
  assert.equal(r.vuoto, null, "senza niente di tutto questo non c'è un dove");
});

test("il consiglio diventa la rotta tracciata, e non muove la barca", async () => {
  const r = await runInGame(`
    helpEl.classList.remove("on"); tut.on = false;
    mapMode = "ionio"; newWorld("mantova");
    const porto = world.ports.find(o => o.n === "Fiskardo");
    boat.x = world.ports.find(o => o.n === "Nydri").x;
    boat.y = world.ports.find(o => o.n === "Nydri").y;
    windBase = 8; windDirBase = 315 * D2R;
    const prima = { x: boat.x, y: boat.y, h: boat.h, barra: boat.rudderCmd, vele: boat.trim };
    destPorto = "Fiskardo";
    comando("u");                                       // il tasto U consiglia la rotta
    const c = consiglio;
    const uguale = c.punti.length === piano.pts.length &&
      c.punti.every((p, i) => piano.pts[i].x === p.x && piano.pts[i].y === p.y);
    // la carta la disegna senza inciampare, e i numeri sono numeri
    toggleChart(); seconds(0.5); toggleChart();
    const vivo = !!consiglioVivo();
    pianoTogli(0);                                      // toccata la rotta, il consiglio non è più lei
    const vivoDopo = !!consiglioVivo();
    report({
      punti: c.punti.length, uguale, vivo, vivoDopo,
      arriva: Math.hypot(c.punti[c.punti.length-1].x - porto.x,
                         c.punti[c.punti.length-1].y - porto.y),
      fermo: boat.x === prima.x && boat.y === prima.y && boat.h === prima.h
             && boat.rudderCmd === prima.barra && boat.trim === prima.vele,
      nan: [c.t, c.totale, c.allunga, c.tDiretta].some(Number.isNaN) ||
           c.punti.some(p => Number.isNaN(p.x) || Number.isNaN(p.y)),
      dalPrimo: piano.i === 0,
      tratte: c.tratte.length, tipi: c.tratte.map(t => t.tipo)
    });
  `);

  assert.ok(r.punti >= 1 && r.punti <= 8, `una rotta corta da leggere (${r.punti} punti)`);
  assert.ok(r.uguale, "i punti consigliati sono esattamente quelli della rotta tracciata");
  assert.ok(r.arriva < 1, "e l'ultimo è il porto d'arrivo");
  assert.ok(r.fermo, "consigliare non tocca la barca");
  assert.ok(!r.nan, "nessun NaN nei numeri del consiglio");
  assert.ok(r.dalPrimo, "si riparte dal primo punto");
  assert.equal(r.tratte, r.punti, "una tratta per punto, con la sua andatura");
  assert.ok(r.vivo, "finché la rotta è quella consigliata, la carta lo dice");
  assert.ok(!r.vivoDopo, "tolto un punto torna una rotta a matita come le altre");
});

test("sulla carta vera la rotta consigliata passa in acqua, e il conto è svelto", async () => {
  const r = await runInGame(`
    helpEl.classList.remove("on"); tut.on = false;
    mapMode = "ionio"; newWorld("mantova");
    const P = n => world.ports.find(o => o.n === n);
    windBase = 8; windDirBase = 315 * D2R;
    const prova = (da, a) => {
      const p1 = P(da), p2 = P(a);
      const t0 = Date.now();
      const c = consigliaRotta(p1.x, p1.y, p2.x, p2.y);
      const ms = Date.now() - t0;
      // in acqua ovunque, tranne l'ultimo pezzo dentro i due porti: quelli
      // stanno a riva per definizione
      let peggio = 1e9, px = p1.x, py = p1.y, tot = 0;
      for (const q of c.punti) {
        const n = Math.ceil(Math.hypot(q.x-px, q.y-py) / 60);
        for (let i = 0; i <= n; i++) {
          const t = i/n, x = px+(q.x-px)*t, y = py+(q.y-py)*t;
          if (Math.hypot(x-p1.x, y-p1.y) < 300 || Math.hypot(x-p2.x, y-p2.y) < 300) continue;
          peggio = Math.min(peggio, -landDepth(world.islands, x, y));
        }
        tot += Math.hypot(q.x-px, q.y-py); px = q.x; py = q.y;
      }
      return { ms, punti: c.punti.length, peggio, nmi: nm(tot), allunga: c.allunga,
               dritto: nm(c.dist) };
    };
    const primo = prova("Nydri", "Fiskardo");           // il primo paga le VMG da calcolare
    const poi = [prova("Preveza", "Vathy Itaca"), prova("Kioni", "Sivota"),
                 prova("Argostoli", "Kastos"), prova("Astakos", "Vasiliki")];
    report({ primo, poi });
  `);

  for (const c of [r.primo, ...r.poi]) {
    // pochi punti, come si traccia a matita: otto è l'obiettivo, il giro
    // largo attorno a Cefalonia ne chiede qualcuno in più e sono terra vera
    assert.ok(c.punti >= 1 && c.punti <= 14, `una rotta da leggere a colpo d'occhio (${c.punti})`);
    assert.ok(c.peggio > 60, `la rotta non rade la costa (${c.peggio.toFixed(0)} m dal più vicino)`);
    assert.ok(c.allunga >= 1 && c.allunga < 2.6,
      `girare le terre allunga il giusto (${c.allunga.toFixed(2)}× su ${c.dritto.toFixed(1)} nm dritti)`);
  }
  // il primo conto riempie le tabelle di VMG della barca, gli altri le trovano
  // già fatte: è la stessa memoria dei bordi
  assert.ok(r.primo.ms < 4000, `il primo consiglio non blocca la carta (${r.primo.ms} ms)`);
  for (const c of r.poi)
    assert.ok(c.ms < 600, `i successivi sono immediati (${c.ms} ms)`);
});
