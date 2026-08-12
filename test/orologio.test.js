/* L'OROLOGIO DI BORDO.
 *
 * Non è una scala del tempo nuova: è quella che il gioco ha già, la stessa
 * di `nm` e di `realT`. Un secondo di cronometro vale SCALE_GEO secondi di
 * orologio, e da lì discende tutto. Questi test tengono ferme le due
 * proprietà che servono a chi ci costruirà sopra il meteo: che sia una
 * funzione pura del cronometro, e che sopravviva a un F5.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `
  world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
            size: 9000, start: {x:0,y:0}, name: "test" };
`;

test("l'ora di bordo scorre col cronometro alla scala della carta", async () => {
  const r = await runInGame(MONDO + `
    oraPartenza = 8*3600;
    const letture = {};
    for (const t of [0, GIORNO/4, GIORNO/2, GIORNO, 2*GIORNO, 3*GIORNO+GIORNO/2]) {
      game.t = t;
      letture[t] = { hm: oraHM(), h: oraH(), giorno: giornoDiBordo(), fase: faseDelCielo() };
    }
    report({ letture, GIORNO, SCALE_GEO,
             // un'ora di orologio quanti secondi di cronometro costa
             oraInSecondi: GIORNO/24 });
  `);
  assert.equal(r.SCALE_GEO, 6, "la scala della carta è 1:6");
  assert.equal(r.GIORNO, 86400/6, "e un giorno di bordo sono 14400 s di cronometro");
  assert.equal(r.oraInSecondi, 600, "cioè dieci minuti di cronometro per ogni ora di bordo");

  assert.equal(r.letture[0].hm, "08:00", "si salpa alle otto");
  assert.equal(r.letture[r.GIORNO/4].hm, "14:00", "un quarto di giorno dopo sono le due");
  assert.equal(r.letture[r.GIORNO/2].hm, "20:00", "a mezzo giorno sono le otto di sera");
  assert.equal(r.letture[r.GIORNO].hm, "08:00", "e dopo un giorno intero si torna alle otto");

  assert.equal(r.letture[0].giorno, 0, "il primo giorno è lo zero");
  assert.equal(r.letture[r.GIORNO].giorno, 1, "dopo ventiquattr'ore è il secondo");
  assert.equal(r.letture[3*r.GIORNO + r.GIORNO/2].giorno, 3, "e il conto non si perde per strada");

  assert.equal(r.letture[0].fase, "giorno", "alle otto è giorno");
  assert.equal(r.letture[r.GIORNO/2].fase, "tramonto", "alle venti tramonta");
});

test("l'ora è una funzione pura del cronometro: nessuno stato da integrare", async () => {
  const r = await runInGame(MONDO + `
    oraPartenza = 8*3600;
    // avanti e indietro nel tempo, in ordine sparso: la stessa t deve dare
    // sempre la stessa ora, senza memoria di come ci si è arrivati
    const a = [];
    for (const t of [1234, 99999, 7, 1234, 55555, 7, 99999]) { game.t = t; a.push(oraHM()); }
    // e far girare la fisica in mezzo non deve cambiarla
    game.t = 1234; const prima = oraHM();
    windBase = 7; windDirBase = 0; gusts = []; streaks = [];
    for (let i=0;i<600;i++){ trimWindows(); physics(1/120); }
    const dopo = oraHM();
    report({ a, prima, dopo });
  `);
  assert.equal(r.a[0], r.a[3], "la stessa t dà la stessa ora");
  assert.equal(r.a[2], r.a[5], "sempre, anche tornando indietro");
  assert.equal(r.a[1], r.a[6], "e ancora");
  assert.equal(r.prima, r.dopo,
    "far girare la fisica senza toccare il cronometro non sposta l'orologio");
});

test("il ritmo di gioco accelera l'orologio senza sfasarlo", async () => {
  const r = await runInGame(MONDO + `
    helpEl.classList.remove("on"); tut.on = false;
    game.paused = false; chart.on = false;
    const misura = ritmo => {
      setRitmo(ritmo,false);
      game.t = 0; oraPartenza = 8*3600;
      seconds(10);                     // dieci secondi di orologio da polso
      return { t: game.t, ora: oraH() };
    };
    const a = misura(1), b = misura(4);
    report({ a, b });
  `);
  // a 4x il cronometro avanza quattro volte tanto, e l'ora con lui
  assert.ok(r.b.t > r.a.t * 3.5 && r.b.t < r.a.t * 4.5,
    `a 4x il cronometro deve correre quattro volte tanto: ${r.a.t.toFixed(1)} -> ${r.b.t.toFixed(1)}`);
  const avanzoA = r.a.ora - 8, avanzoB = r.b.ora - 8;
  assert.ok(avanzoB > avanzoA * 3.5 && avanzoB < avanzoA * 4.5,
    "e l'ora di bordo deve seguirlo esattamente, senza sfasarsi");
});

test("un F5 non perde né l'ora né il vento", async () => {
  const r = await runInGame(MONDO + `
    mapMode = "ionio"; newWorld("prova");
    sessPronta = true;
    windBase = 11.5; windDirBase = 123*D2R;
    game.t = 3*GIORNO + 5000; oraPartenza = 6*3600;
    boat.x = world.start.x + 40; boat.y = world.start.y - 25;
    const atteso = { ora: oraHM(), giorno: giornoDiBordo(), t: game.t,
                     base: windBase, dir: windDirBase };
    const foto = sessioneCorrente();
    // si riparte da zero, come dopo un ricaricamento
    game.t = 0; oraPartenza = 8*3600; windBase = 7; windDirBase = 200*D2R;
    const ripreso = riprendiSessione(foto);
    report({ atteso, ripreso,
             ora: oraHM(), giorno: giornoDiBordo(), t: game.t,
             base: windBase, dir: windDirBase });
  `);
  assert.equal(r.ripreso, true, "la sessione si deve poter riprendere");
  assert.equal(r.ora, r.atteso.ora, "l'ora di bordo torna dov'era");
  assert.equal(r.giorno, r.atteso.giorno, "e anche il giorno");
  assert.ok(Math.abs(r.t - r.atteso.t) < 1e-6, "il cronometro pure");
  assert.ok(Math.abs(r.base - r.atteso.base) < 1e-9,
    `la forza del vento torna dov'era (${r.atteso.base} -> ${r.base})`);
  assert.ok(Math.abs(r.dir - r.atteso.dir) < 1e-9,
    "e la sua direzione: prima non veniva salvata affatto");
});

test("una sessione storta non manda l'orologio fuori giri", async () => {
  const r = await runInGame(MONDO + `
    mapMode = "ionio"; newWorld("prova");
    sessPronta = true;
    game.t = 100; oraPartenza = 8*3600; windBase = 7; windDirBase = 0;
    const foto = sessioneCorrente();
    foto.tempo = { t: -9e9, ora0: 999999999 };
    foto.vento = { dir: "banane", base: 3000 };
    const ok = riprendiSessione(foto);
    report({ ok, t: game.t, ora0: oraPartenza, base: windBase,
             dirFinita: Number.isFinite(windDirBase),
             oraFinita: Number.isFinite(oraH()) && oraH() >= 0 && oraH() < 24 });
  `);
  assert.equal(r.ok, true, "il resto della sessione resta buono");
  assert.ok(r.t >= 0, `il cronometro non può andare all'indietro (ottenuto ${r.t})`);
  assert.ok(r.ora0 >= 0 && r.ora0 < 86400, `l'ora di partenza sta in un giorno (ottenuto ${r.ora0})`);
  assert.ok(r.base >= 2 && r.base <= 16, `il vento sta nella scala del cursore (ottenuto ${r.base})`);
  assert.equal(r.dirFinita, true, "e una direzione che non è un numero non diventa NaN");
  assert.equal(r.oraFinita, true, "l'ora resta un'ora vera");
});
