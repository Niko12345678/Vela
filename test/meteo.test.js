/* IL METEO VIVO — il vento che gira e rinforza con le ore.
 *
 * Due cose vanno tenute ferme, e sono più importanti di quanto sia bello
 * il modello.
 *
 * La prima: **spento non deve esistere**. È la ragione per cui nasce
 * spento, e per cui la golden test non ha dovuto cambiare una riga. Se un
 * giorno il default si ribalta, questi test restano il posto dove si
 * dimostra che il vento fermo è ancora esattamente quello di prima.
 *
 * La seconda: **acceso deve restare ripetibile**. Il meteo è una funzione
 * pura del cronometro e del seme — niente Math.random, niente stato
 * integrato — perché è quello che permette a un collaudo di verificarlo,
 * a una rotta consigliata di avere senso, e un giorno a un replay di
 * rigiocare la stessa giornata.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `
  world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
            size: 9000, start: {x:0,y:0}, name: "test" };
  gusts = []; streaks = []; windDirBase = 0; windBase = 7;
`;

test("spento, il vento è esattamente quello di sempre", async () => {
  const r = await runInGame(MONDO + `
    meteoDin = false;
    const letto = [], atteso = [];
    for (const t of [0, 3.7, 61.2, 900.5, 12345.6]) {
      game.t = t;
      const w = windAt(0,0);
      letto.push([w.from, w.spd]);
      // la formula di sempre, scritta a mano qui: se cambia, questo test lo
      // dice. La normalizzazione ci va anche qui perché è quello che fa
      // windAt in uscita, e passarci attraverso costa qualche cifra in fondo.
      atteso.push([
        norm(windDirBase + Math.sin(t*0.07)*6*D2R + Math.sin(t*0.021+1.7)*4*D2R),
        windBase*(1 + 0.07*Math.sin(t*0.12+0.6))
      ]);
    }
    report({ letto, atteso, predefinito: meteoDin });
  `);
  assert.equal(r.predefinito, false,
    "il meteo vivo deve nascere spento: è quello che tiene ferma la golden test");
  for (let i = 0; i < r.letto.length; i++) {
    assert.equal(r.letto[i][0], r.atteso[i][0],
      "col meteo spento la direzione è la formula di sempre, cifra per cifra");
    assert.equal(r.letto[i][1], r.atteso[i][1],
      "e così la velocità");
  }
});

test("acceso, la brezza si alza col sole e cala di notte", async () => {
  const r = await runInGame(MONDO + `
    meteoSemina("collaudo"); meteoDin = true; oraPartenza = 0;
    const forza = h => { game.t = h*GIORNO/24; return windAt(0,0).spd; };
    const notte = forza(3), alba = forza(7), meriggio = forza(15), sera = forza(21);
    // la media della giornata, campionata fitta
    let somma = 0, n = 0, min = 1e9, max = 0;
    for (let i = 0; i < 24*12; i++) {
      game.t = i*GIORNO/(24*12);
      const s = windAt(0,0).spd;
      somma += s; n++; min = Math.min(min,s); max = Math.max(max,s);
    }
    report({ notte, alba, meriggio, sera, media: somma/n, min, max, rif: windBase });
  `);
  assert.ok(r.meriggio > r.notte * 1.5,
    `nel pomeriggio deve soffiare molto più che di notte: ${r.notte.toFixed(2)} -> ${r.meriggio.toFixed(2)} m/s`);
  assert.ok(r.meriggio > r.alba && r.meriggio > r.sera,
    "e il culmine sta nel pomeriggio, non all'alba né a notte fatta");
  assert.ok(r.notte < r.rif, "di notte si sta sotto il vento di riferimento");
  assert.ok(r.media > r.rif*0.85 && r.media < r.rif*1.05,
    `la media della giornata deve restare vicina al cursore, che è quello che dichiara di essere: ${r.media.toFixed(2)} contro ${r.rif}`);
  assert.ok(r.max < r.rif*1.6,
    `e il culmine non deve diventare un'altra cosa dal vento impostato (${r.max.toFixed(2)})`);
});

test("acceso, la direzione gira di giorno e va a spasso in giorni", async () => {
  const r = await runInGame(MONDO + `
    meteoSemina("collaudo"); meteoDin = true; oraPartenza = 0;
    const dir = t => { game.t = t; return norm(windAt(0,0).from)*R2D; };
    // dentro la giornata
    const giro = [];
    for (let h = 0; h < 24; h += 2) giro.push(dir(h*GIORNO/24));
    // e a mezzogiorno di otto giorni, dove parla il regime
    const mezzogiorni = [];
    for (let g = 0; g < 8; g++) mezzogiorni.push(dir(g*GIORNO + GIORNO/2));
    report({ giro, mezzogiorni });
  `);
  const esc = a => Math.max(...a) - Math.min(...a);
  assert.ok(esc(r.giro) > 12,
    `in una giornata il vento deve girare in modo percepibile (escursione ${esc(r.giro).toFixed(0)}°)`);
  assert.ok(esc(r.giro) < 90,
    `ma non tanto da rendere irriconoscibile la carta (escursione ${esc(r.giro).toFixed(0)}°)`);
  assert.ok(esc(r.mezzogiorni) > 15,
    `e da un giorno all'altro il regime deve spostarlo (escursione ${esc(r.mezzogiorni).toFixed(0)}°)`);
  assert.ok(r.giro.every(Number.isFinite) && r.mezzogiorni.every(Number.isFinite),
    "senza mai produrre un angolo che non è un angolo");
});

test("stessa parola, stessa giornata: il meteo è ripetibile", async () => {
  const r = await runInGame(MONDO + `
    meteoDin = true;
    const impronta = seme => {
      meteoSemina(seme);
      const a = [];
      for (let g = 0; g < 4; g++)
        for (const q of [0.2, 0.55, 0.9]) {
          game.t = (g+q)*GIORNO;
          const w = windAt(0,0);
          a.push(w.from.toFixed(9)+"|"+w.spd.toFixed(9));
        }
      return a.join(",");
    };
    report({ a: impronta("mantova"), b: impronta("verona"), aBis: impronta("mantova") });
  `);
  assert.equal(r.a, r.aBis, "lo stesso seme deve rifare la stessa giornata di vento");
  assert.notEqual(r.a, r.b, "e due semi diversi devono dare due giornate diverse");
});

test("il meteo non costa niente al singolo campione", async () => {
  const r = await runInGame(`
    mapMode = "ionio"; newWorld("x");
    windDirBase = 0; windBase = 7; game.t = 0;
    shadeDir = dv(windDirBase + Math.PI);
    const giro = () => {
      const t0 = Date.now();
      for (let i = 0; i < 200000; i++) windAt(i%9000-4000, (i*7)%9000-4000);
      return Date.now() - t0;
    };
    meteoDin = false; giro();            // scalda
    const spento = giro();
    meteoDin = true; giro();
    const acceso = giro();
    report({ spento, acceso });
  `);
  /* Il meteo si calcola una volta per fotogramma dentro la cache del vento
     di fondo, non a ogni campione: acceso non deve pesare più di spento.
     La soglia è larga perché è una misura di tempo su una macchina
     condivisa; quello che intercetta è un meteo finito per sbaglio dentro
     il ciclo dei campioni, che costerebbe un ordine di grandezza. */
  assert.ok(r.acceso < Math.max(r.spento*1.6, r.spento+40),
    `il meteo acceso non deve appesantire il campo di vento: ${r.spento} -> ${r.acceso} ms per 200k campioni`);
  assert.ok(r.acceso < 900,
    `e il tetto della golden test vale anche col meteo acceso (${r.acceso} ms)`);
});

test("col meteo acceso il ritmo di gioco non cambia il risultato", async () => {
  /* Lo stesso contratto della golden test sulla scala temporale, ripetuto
     col meteo acceso: è il collaudo migliore del fatto che il vento sia
     una funzione del tempo e non qualcosa che si integra passo per passo.
     Se un giorno il meteo diventasse incrementale, questo diventerebbe
     rosso mentre tutto il resto resterebbe verde. */
  const r = await runInGame(MONDO + `
    helpEl.classList.remove("on"); tut.on = false;
    game.paused = false; chart.on = false;
    meteoSemina("ritmo"); meteoDin = true;
    const prova = ritmo => {
      setRitmo(ritmo,false);
      game.t = 0; oraPartenza = 9*3600;
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=90*D2R;boat.heel=0;boat.yawRate=0;
      boat.stuck=0;boat.spPrec=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;
      boat.spi=false;boat.reef=0;boat.rudderCmd=0;boat.rudderTrim=0;
      game.auto=true;game.pilot=2;game.pilotTgt=boat.h;game.msgT=99;
      gusts=[]; streaks=[];
      // 120 secondi di tempo simulato, comunque ci si arrivi
      while (game.t < 120) tick(1);
      return { kn: Math.hypot(boat.vx,boat.vy)*1.94384, ora: oraH(), t: game.t };
    };
    const a = prova(1), b = prova(8);
    report({ a, b });
  `);
  assert.ok(Math.abs(r.a.ora - r.b.ora) < 0.05,
    `a ritmi diversi l'ora di bordo deve coincidere: ${r.a.ora.toFixed(3)} contro ${r.b.ora.toFixed(3)}`);
  assert.ok(Math.abs(r.a.kn - r.b.kn) < 0.25,
    `e la barca deve fare la stessa velocità: ${r.a.kn.toFixed(2)} contro ${r.b.kn.toFixed(2)} kn`);
});

test("il meteo acceso sopravvive a un F5, con la sua giornata", async () => {
  const r = await runInGame(`
    mapMode = "ionio"; newWorld("burrasca");
    sessPronta = true;
    meteoDin = true; windBase = 9; windDirBase = 40*D2R;
    game.t = 2*GIORNO + 4321; oraPartenza = 7*3600;
    boat.x = world.start.x + 30; boat.y = world.start.y - 15;
    /* Senza raffiche: quelle sono un tiro di dadi che non è mai stato
       salvato in sessione, e qui si sta collaudando il campo di fondo —
       ora, regime e brezza — non il posto dove capita una folata. */
    gusts = [];
    const w0 = windAt(boat.x, boat.y);
    const atteso = { from: w0.from, spd: w0.spd, ora: oraHM() };
    const foto = sessioneCorrente();
    // ricaricamento: si riparte da capo, con un'altra giornata addosso
    meteoDin = false; game.t = 0; oraPartenza = 8*3600;
    windBase = 7; windDirBase = 200*D2R; meteoSemina("tutt'altro");
    const ok = riprendiSessione(foto);
    gusts = [];
    const w1 = windAt(boat.x, boat.y);
    report({ ok, meteo: meteoDin, ora: oraHM(),
             scartoDir: Math.abs(norm(w1.from - atteso.from)),
             spd: w1.spd, atteso });
  `);
  assert.equal(r.ok, true, "la sessione si riprende");
  assert.equal(r.meteo, true, "col meteo acceso com'era");
  assert.equal(r.ora, r.atteso.ora, "e all'ora giusta");
  assert.ok(Math.abs(r.spd - r.atteso.spd) < 1e-9,
    `il vento deve essere lo stesso di prima del ricaricamento: ${r.atteso.spd} -> ${r.spd}`);
  assert.ok(r.scartoDir < 1e-9,
    `direzione compresa: sono le fasi del regime, che vanno riseminate dal seme (scarto ${r.scartoDir})`);
});

test("la previsione è esatta, non stimata: è la stessa formula più avanti", async () => {
  /* Il motivo per cui vale la pena pretendere che il meteo sia una
     funzione pura del cronometro. Qui si guarda la previsione, poi si
     lascia scorrere il tempo fino a quell'ora, e si controlla che il
     vento sia proprio quello: non «vicino», identico. */
  const r = await runInGame(MONDO + `
    meteoSemina("previsione"); meteoDin = true; oraPartenza = 5*3600;
    game.t = 0;
    const detto = [];
    for (let i = 0; i < 12; i++) {
      const v = ventoAl(game.t + i*ORA_GIOCO);
      detto.push([v.from, v.spd]);
    }
    // adesso il tempo passa davvero, un'ora per volta
    const avvenuto = [];
    for (let i = 0; i < 12; i++) {
      game.t = i*ORA_GIOCO;
      const v = ventoAl(game.t);
      avvenuto.push([v.from, v.spd]);
    }
    report({ detto, avvenuto });
  `);
  for (let i = 0; i < r.detto.length; i++) {
    assert.equal(r.detto[i][0], r.avvenuto[i][0],
      `la direzione prevista per fra ${i} ore deve essere quella che poi arriva`);
    assert.equal(r.detto[i][1], r.avvenuto[i][1],
      `e così la forza`);
  }
});

test("la previsione racconta la giornata: il pomeriggio si vede arrivare", async () => {
  const r = await runInGame(MONDO + `
    meteoSemina("previsione"); meteoDin = true; oraPartenza = 6*3600;
    game.t = 0;
    const p = [];
    for (let i = 0; i < 12; i++) {
      const t = game.t + i*ORA_GIOCO;
      p.push({ h: Math.floor(oraHDi(t)), kn: ventoAl(t).spd*1.94384 });
    }
    report({ p });
  `);
  const alle = h => r.p.find(q => q.h === h);
  assert.ok(alle(6) && alle(15), "la previsione deve coprire dalle sei alle quindici");
  assert.ok(alle(15).kn > alle(6).kn * 1.4,
    `partendo all'alba, la previsione deve già mostrare il rinforzo del pomeriggio: ${alle(6).kn.toFixed(1)} -> ${alle(15).kn.toFixed(1)} kn`);
  assert.ok(r.p.every(q => Number.isFinite(q.kn) && q.kn > 0),
    "e ogni ora deve avere un vento vero");
});

test("il cielo segue l'ora, e non spegne mai del tutto la luce", async () => {
  const r = await runInGame(MONDO + `
    oraPartenza = 0;
    const a = {};
    for (let h = 0; h < 24; h++) { game.t = h*GIORNO/24; a[h] = tintaDelCielo(); }
    // e mezz'ora per volta, per stanare i salti
    const alfa = [];
    for (let i = 0; i < 48; i++) {
      game.t = i*GIORNO/48;
      const c = tintaDelCielo();
      alfa.push(c ? Number(c.split(",")[3].replace(")","")) : 0);
    }
    report({ a, alfa });
  `);
  assert.equal(r.a[12], null, "a mezzogiorno non si vela niente");
  assert.ok(r.a[2] !== null && r.a[22] !== null, "di notte sì");
  assert.ok(r.a[6] !== null, "e all'alba pure");
  const max = Math.max(...r.alfa);
  assert.ok(max <= 0.45,
    `la notte non deve mai diventare una schermata nera (velatura massima ${max})`);
  assert.ok(r.alfa.some(v => v === 0), "e di giorno deve sparire del tutto");
  // nessun salto: fra due mezz'ore vicine la velatura cambia poco
  for (let i = 1; i < r.alfa.length; i++)
    assert.ok(Math.abs(r.alfa[i] - r.alfa[i-1]) < 0.12,
      `il cielo deve cambiare senza scatti (salto di ${Math.abs(r.alfa[i]-r.alfa[i-1]).toFixed(3)} fra due mezz'ore)`);
});
