/* LA ROTTA PIANIFICATA — punti segnati sulla carta, tratteggio in mare.
 *
 * È una linea a matita: non governa la barca, non tocca la fisica, e la
 * golden test non deve accorgersi che esiste. Qui si collauda quello che
 * *decide* qualcosa — dove finisce un punto quando lo si clicca, quando un
 * punto conta per passato, e da che parte si è fuori rotta — non il
 * disegno, che si controlla solo perché non produca NaN.
 *
 * Come per `rotella(e)`, il collaudo passa dalla funzione e non
 * dall'ascoltatore: la harness non può recapitare eventi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 9000, start: {x:0,y:0}, name: "test" };
               pianoAzzera(true); boat.x = 0; boat.y = 0;`;

test("un click segna un punto, un click sopra lo toglie", async () => {
  const r = await runInGame(`
    ${MONDO}
    chart.z = 1;
    pianoClick(300, 0); pianoClick(300, -600); pianoClick(-200, -900);
    const segnati = piano.pts.length;
    // ricliccando sul secondo punto lo si toglie: è lo stesso gesto
    const esito = pianoClick(302, -603);
    const dopo = piano.pts.map(p => [p.x, p.y]);
    // la barca non c'entra: segnare una rotta non muove niente a bordo
    const fermo = boat.x === 0 && boat.y === 0 && boat.rudderCmd === 0 && boat.vx === 0;
    report({ segnati, esito, dopo, fermo });
  `);

  assert.equal(r.segnati, 3, "tre click, tre punti");
  assert.equal(r.esito, "tolto", "il click sopra un punto lo toglie");
  assert.deepEqual(r.dopo, [[300, 0], [-200, -900]], "resta la spezzata senza quel punto");
  assert.ok(r.fermo, "pianificare non deve toccare la barca");
});

test("la tolleranza del click è in pixel, non in metri di mare", async () => {
  const r = await runInGame(`
    ${MONDO}
    // stesso scarto in metri, due ingrandimenti: da lontano 100 m sono un
    // pelo sotto il cursore, da vicino sono mezzo golfo
    chart.z = 0.05; pianoClick(1000, 0); pianoClick(1100, 0);
    const daLontano = piano.pts.length;
    pianoAzzera(true);
    chart.z = 1;    pianoClick(1000, 0); pianoClick(1100, 0);
    const daVicino = piano.pts.length;
    report({ daLontano, daVicino });
  `);

  assert.equal(r.daLontano, 0, "a carta rimpicciolita 100 m sono lo stesso punto: tolto");
  assert.equal(r.daVicino, 2, "a carta ingrandita sono due punti distinti");
});

test("un punto è passato solo entrandogli dentro, e la tratta riparte da lì", async () => {
  const r = await runInGame(`
    ${MONDO}
    chart.z = 1;
    pianoClick(500, 0); pianoClick(500, -800);
    boat.x = 500 - PIANO_R - 20; boat.y = 0; pianoUpdate();
    const fuori = piano.i;
    boat.x = 500 - PIANO_R + 20; pianoUpdate();
    const dentro = piano.i, da = { ...piano.da };
    // arrivati in fondo l'indice si ferma: non esiste un punto dopo l'ultimo
    boat.x = 500; boat.y = -800; pianoUpdate(); pianoUpdate();
    report({ fuori, dentro, da, fine: piano.i, punti: piano.pts.length,
             scartoFinito: pianoScarto() });
  `);

  assert.equal(r.fuori, 0, "appena fuori dal cerchio il punto non è girato");
  assert.equal(r.dentro, 1, "dentro sì");
  assert.deepEqual(r.da, { x: 500, y: 0 },
    "la tratta in corso riparte dal punto appena passato");
  assert.equal(r.fine, r.punti, "l'indice si ferma sull'ultimo punto");
  assert.equal(r.scartoFinito, null, "a rotta finita non c'è più uno scarto da dare");
});

test("lo scarto dice di quanto e da che parte si è fuori rotta", async () => {
  const r = await runInGame(`
    ${MONDO}
    chart.z = 1;
    // tratta verso nord: da (0,0) a (0,-1000). A dritta di chi va a nord
    // c'è l'est, cioè le x positive (lo schermo ha la y in giù)
    pianoClick(0, -1000);
    piano.da = { x: 0, y: 0 };
    boat.x = 200; boat.y = -500;  const dritta = pianoScarto();
    boat.x = -350; boat.y = -700; const sinistra = pianoScarto();
    boat.x = 0;   boat.y = -900;  const sopra = pianoScarto();
    report({ dritta, sinistra, sopra });
  `);

  assert.ok(Math.abs(r.dritta - 200) < 1e-9, `a est di una rotta nord: +200 (${r.dritta})`);
  assert.ok(Math.abs(r.sinistra + 350) < 1e-9, `a ovest: −350 (${r.sinistra})`);
  assert.ok(Math.abs(r.sopra) < 1e-9, "sulla congiungente lo scarto è nullo");
});

test("togliere un punto già passato non cambia dove si sta andando", async () => {
  const r = await runInGame(`
    ${MONDO}
    chart.z = 1;
    pianoClick(200, 0); pianoClick(600, 0); pianoClick(900, 0);
    piano.i = 2;                       // si sta andando al terzo punto
    const prima = { ...piano.pts[piano.i] };
    pianoTogli(0);                     // si cancella il primo, ormai alle spalle
    report({ prima, dopo: { ...piano.pts[piano.i] }, i: piano.i, restano: piano.pts.length });
  `);

  assert.deepEqual(r.dopo, r.prima, "il punto attivo resta lo stesso punto");
  assert.equal(r.i, 1, "l'indice scala insieme alla lista");
  assert.equal(r.restano, 2, "e i punti sono uno di meno");
});

test("la rotta sopravvive al ritorno al via, non al cambio di carta", async () => {
  const r = await runInGame(`
    mapMode = "ionio"; newWorld("mantova");
    chart.z = 1;
    pianoClick(boat.x + 400, boat.y); pianoClick(boat.x + 900, boat.y);
    piano.i = 1;
    resetBoat();
    const dopoReset = { punti: piano.pts.length, i: piano.i };
    newWorld("mantova");
    report({ dopoReset, dopoCarta: piano.pts.length });
  `);

  assert.equal(r.dopoReset.punti, 2, "riportare al via non cancella il lavoro sulla carta");
  assert.equal(r.dopoReset.i, 0, "ma si riparte dal primo punto, come si riparte dal porto");
  assert.equal(r.dopoCarta, 0, "un'altra carta rende quei punti privi di senso");
});

test("il gioco gira e disegna con una rotta segnata, in mare e sulla carta", async () => {
  const r = await runInGame(`
    helpEl.classList.remove("on"); tut.on = false;
    mapMode = "ionio"; newWorld("mantova");
    chart.z = 1;
    // tre punti davanti alla prua, il primo abbastanza vicino da passarci
    const d = dv(boat.h);
    for (const L of [90, 700, 1500]) pianoClick(boat.x + d.x*L, boat.y + d.y*L);
    seconds(30);
    toggleChart(); seconds(2); toggleChart();
    report({
      nan: [boat.x, boat.y, piano.da.x, piano.da.y, pianoResta()].some(Number.isNaN),
      passato: piano.i, punti: piano.pts.length, resta: pianoResta()
    });
  `);

  assert.ok(!r.nan, "nessun NaN con la rotta disegnata");
  assert.ok(r.passato >= 1, `il primo punto va passato navigandoci sopra (${r.passato})`);
  assert.ok(r.resta > 0, "e le miglia che restano sono un numero sensato");
});
