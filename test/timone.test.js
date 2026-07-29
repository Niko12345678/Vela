/* IL CAVALLINO — il neutro spostato della barra.
 *
 * Il problema che risolve, misurato: per non cambiare rotta la barra va
 * tenuta FUORI dal centro — un quarto di barra di bolina con 14 nodi,
 * quasi metà con 24. Con le sole frecce (1,15 al secondo) quel valore non
 * si centra e non si ritrova dopo una correzione, e la barca sembra non
 * tenere la rotta.
 *
 * Qui si collauda che spostando il neutro la rotta si tenga davvero a mani
 * ferme, e che la regolazione sia più fine delle frecce. La fisica non
 * conosce il cavallino: è solo il punto a cui tornano i comandi, quindi la
 * golden test non ne risente e non deve risentirne.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 9000, start: {x:0,y:0}, name: "test" };`;

test("col cavallino la rotta si tiene a mani ferme, senza il cavallino no", async () => {
  const r = await runInGame(`
    ${MONDO}
    // porta a regime di bolina con l'autotimoniere, che trova da sé quanta
    // barra serve, poi molla tutto e guarda dove finisce la prua
    const prova = (usaCavallino, twa, wind) => {
      windBase = wind; windDirBase = 0; gusts = []; streaks = [];
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=twa*D2R;boat.heel=0;boat.yawRate=0;
      boat.stuck=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;boat.spi=false;
      boat.reef=0;boat.rudderTrim=0;game.auto=true;game.pilot=2;game.pilotTgt=boat.h;
      game.t=0;game.msgT=99;
      for (let i=0;i<9000;i++){ trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t+=1/60; }
      const serve = boat.rudderCmd;              // quanta barra teneva l'autotimoniere
      game.pilot = 0;                            // mani lontane dalla barra
      boat.rudderTrim = usaCavallino ? serve : 0;
      boat.rudderCmd = boat.rudderTrim;
      const h0 = boat.h;
      for (let i=0;i<60*60;i++){ trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t+=1/60; }
      return { serve, deriva: Math.abs(norm(boat.h-h0))*R2D };
    };
    report({ con: prova(true,45,7), senza: prova(false,45,7),
             conForte: prova(true,45,12), senzaForte: prova(false,45,12) });
  `);

  // il problema esiste: di bolina serve parecchia barra, e di più col vento fresco
  assert.ok(r.con.serve > 0.15,
    `di bolina deve servire barba fuori centro, altrimenti il cavallino non serve a niente (${r.con.serve.toFixed(3)})`);
  assert.ok(r.conForte.serve > r.con.serve,
    `col vento fresco ne deve servire di più: ${r.con.serve.toFixed(3)} -> ${r.conForte.serve.toFixed(3)}`);

  // e il cavallino lo risolve
  assert.ok(r.con.deriva < 15,
    `col cavallino la prua deve restare lì per un minuto (derivata di ${r.con.deriva.toFixed(1)}°)`);
  assert.ok(r.senza.deriva > r.con.deriva * 3,
    `a barra dritta invece deve straorzare: ${r.con.deriva.toFixed(1)}° col cavallino, ${r.senza.deriva.toFixed(1)}° senza`);
  assert.ok(r.conForte.deriva < r.senzaForte.deriva,
    "vale anche col vento fresco, dove il problema è peggiore");
});

test("il cavallino si regola più fine delle frecce e si porta dietro la barra", async () => {
  const r = await runInGame(`
    ${MONDO}
    windBase = 7; windDirBase = 0; gusts = []; streaks = [];
    game.auto = true; game.pilot = 0;
    const premi = (tasto, secondi) => {
      for (const t in keys) keys[t] = 0;
      keys[tasto] = 1;
      for (let i=0;i<Math.round(secondi*60);i++) input(1/60);
      keys[tasto] = 0;
    };
    boat.rudderCmd = 0; boat.rudderTrim = 0;
    premi(".", 1); const cavallino1s = { trim: boat.rudderTrim, cmd: boat.rudderCmd };
    boat.rudderCmd = 0; boat.rudderTrim = 0;
    premi("arrowright", 1); const freccia1s = { trim: boat.rudderTrim, cmd: boat.rudderCmd };

    // la barra si sposta insieme al cavallino, anche partendo storta
    boat.rudderCmd = 0.5; boat.rudderTrim = 0;
    setCavallino(0.2);
    const insieme = { trim: boat.rudderTrim, cmd: boat.rudderCmd };

    // col richiamo al centro (pilota 1) la barra torna al cavallino, non a zero
    boat.rudderTrim = 0.3; boat.rudderCmd = 0.9; game.pilot = 1;
    for (const t in keys) keys[t] = 0;
    for (let i=0;i<60*4;i++) autopilot(1/60);
    const richiamo = boat.rudderCmd;
    game.pilot = 0;

    // e non si può spingere il neutro oltre la barra tutta
    boat.rudderTrim = 0; boat.rudderCmd = 0; setCavallino(5);
    const limite = boat.rudderTrim;
    report({ cavallino1s, freccia1s, insieme, richiamo, limite });
  `);

  assert.ok(r.cavallino1s.trim > 0.15 && r.cavallino1s.trim < 0.3,
    `un secondo di cavallino deve valere ~0,22 (ottenuto ${r.cavallino1s.trim.toFixed(3)})`);
  assert.ok(r.freccia1s.cmd > r.cavallino1s.trim * 3,
    `la freccia deve restare molto più grossolana: ${r.freccia1s.cmd.toFixed(3)} contro ${r.cavallino1s.trim.toFixed(3)}`);
  assert.equal(r.freccia1s.trim, 0, "le frecce non toccano il cavallino: sono la correzione momentanea");
  assert.ok(Math.abs(r.cavallino1s.cmd - r.cavallino1s.trim) < 1e-9,
    "muovendo il cavallino da barra dritta, la barra ci va insieme");
  assert.ok(Math.abs(r.insieme.cmd - 0.7) < 1e-9,
    `la barra si sposta dello stesso scarto del cavallino: attesi 0,7, ottenuto ${r.insieme.cmd}`);
  assert.ok(Math.abs(r.richiamo - 0.3) < 0.02,
    `col richiamo al centro la barra deve tornare al cavallino (0,3), non a zero: ottenuto ${r.richiamo.toFixed(3)}`);
  assert.equal(r.limite, 1, "il cavallino non va oltre la barra tutta");
});
