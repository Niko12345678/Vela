/* La panne: quando ci si finisce dentro, e quando invece no.
 *
 * Questo file nasce da un reclamo preciso — «di bolina stretta è sempre
 * facilissimo andare in panne ed è frustrante» — e serve a tenerlo risolto.
 * La panne deve restare possibile e restare severa: è una delle poche cose
 * che il simulatore insegna davvero. Quello che non deve succedere è
 * finirci dentro *navigando normalmente*, che è quello che succedeva con
 * poco vento.
 *
 * I numeri "prima" citati nei messaggi sono misurati sul codice di allora,
 * non stimati: servono a far capire, a chi vedrà questo test diventare
 * rosso, di quanto ci si sta riavvicinando al difetto.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `
  world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
            size: 9000, start: {x:0,y:0}, name: "test" };
  gusts = []; streaks = []; windDirBase = 0;
`;

/* Partenza da fermo di bolina, con l'autotimoniere su rotta bussola:
   il modo normale di lasciare un porto. */
const PARTENZA = `
  function partenza(vento, sec){
    windBase = vento;
    boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=45*D2R;boat.heel=0;boat.yawRate=0;
    boat.stuck=0;boat.spPrec=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;
    boat.spi=false;boat.reef=0;boat.rudder=0;boat.rudderCmd=0;boat.rudderTrim=0;
    game.auto=true; game.pilot=2; game.pilotTgt=45*D2R; game.t=0; game.msgT=99;
    for(let i=0;i<sec*60;i++){
      trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t+=1/60;
    }
    return { kn: Math.hypot(boat.vx,boat.vy)*1.94384,
             pilota: game.pilot,
             fuoriRotta: Math.abs(norm(boat.h-45*D2R))*R2D };
  }
`;

test("con poco vento la bolina si può fare: il pilota non molla la barra mentre la barca accelera", async () => {
  const r = await runInGame(MONDO + PARTENZA + `
    report({ v4: partenza(4,120), v5: partenza(5,120), v6: partenza(6,120),
             polare4: polarSpeed(45,4), polare5: polarSpeed(45,5), polare6: polarSpeed(45,6) });
  `);

  /* Il difetto: `boat.stuck` cresceva sotto i 0,35 m/s anche quando la barca
     stava semplicemente accelerando da ferma, e a due secondi l'autotimoniere
     si disinseriva *azzerando la barra*. Sotto i 6 m/s la barca non arrivava
     mai a velocità: 0,04 kn a 4 m/s, 0,34 a 5, 0,59 a 6, tutte a una
     quarantina di gradi fuori rotta. */
  for (const [nome, d, polare] of [["4 m/s", r.v4, r.polare4],
                                   ["5 m/s", r.v5, r.polare5],
                                   ["6 m/s", r.v6, r.polare6]]) {
    assert.equal(d.pilota, 2,
      `${nome}: l'autotimoniere deve restare inserito durante una partenza normale`);
    assert.ok(d.kn > polare * 0.9,
      `${nome}: dopo due minuti la barca deve andare come dice il polare, ${polare.toFixed(2)} kn (ottenuto ${d.kn.toFixed(2)}; prima della correzione erano decimi di nodo)`);
    assert.ok(d.fuoriRotta < 15,
      `${nome}: e deve tenere la rotta (ottenuto ${d.fuoriRotta.toFixed(1)}° fuori; prima ~40°)`);
  }
});

test("la panne resta un vicolo cieco: senza manovra non se ne esce", async () => {
  /* Lo specchio del contratto fissato dalla golden test, ripetuto qui perché
     è la sponda contro cui vanno verificati tutti gli interventi che rendono
     la barca più docile: nessuno di loro può rendere la panne innocua. */
  const r = await runInGame(MONDO + `
    function inPanne(collo, sec){
      windBase=7;
      boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=8*D2R;boat.yawRate=0;boat.heel=0;
      boat.stuck=0;boat.spPrec=0;boat.gtime=0;boat.trim=70*D2R;boat.jib=60*D2R;
      boat.jibFurled=false;boat.spi=false;boat.reef=0;boat.rudder=0;boat.rudderCmd=0;
      game.auto=false;game.pilot=0;game.t=0;game.msgT=99;boat.jibBack=collo;
      for(let i=0;i<sec*60;i++){
        trimWindows(); physics(1/120); physics(1/120); game.t+=1/60;
        if (Math.abs(boat.beta)>65*D2R && Math.hypot(boat.vx,boat.vy)*1.94384>1.5) return i/60;
      }
      return null;
    }
    report({ fermi: inPanne(false,150), collo: inPanne(true,60) });
  `);
  assert.equal(r.fermi, null,
    "con la prua nel vento e le mani ferme si deve restare in panne, anche dopo due minuti e mezzo");
  assert.ok(r.collo !== null && r.collo < 30,
    `col fiocco a collo se ne esce (ottenuto ${r.collo})`);
});

test("il cronometro della panne non parte mentre la barca sta accelerando", async () => {
  const r = await runInGame(MONDO + PARTENZA + `
    // 5 m/s: la partenza in cui prima compariva «In panne» dopo tre secondi
    windBase=5;
    boat.x=0;boat.y=0;boat.vx=0;boat.vy=0;boat.h=45*D2R;boat.heel=0;boat.yawRate=0;
    boat.stuck=0;boat.spPrec=0;boat.gtime=0;boat.jibBack=false;boat.jibFurled=false;
    boat.spi=false;boat.reef=0;boat.rudder=0;boat.rudderCmd=0;boat.rudderTrim=0;
    game.auto=true;game.pilot=2;game.pilotTgt=45*D2R;game.t=0;game.msgT=99;
    let stuckMax=0;
    for(let i=0;i<60*60;i++){
      trimWindows(); autopilot(1/60); physics(1/120); physics(1/120); game.t+=1/60;
      stuckMax=Math.max(stuckMax,boat.stuck);
    }
    // ma con la prua davvero dentro il vento e ferma, il cronometro deve partire
    boat.vx=0;boat.vy=0;boat.h=5*D2R;boat.stuck=0;boat.spPrec=0;boat.yawRate=0;
    game.pilot=0;game.auto=false;boat.trim=70*D2R;boat.jib=60*D2R;boat.rudderCmd=0;
    for(let i=0;i<20*60;i++){ trimWindows(); physics(1/120); physics(1/120); game.t+=1/60; }
    report({ stuckMax, stuckVero: boat.stuck });
  `);
  assert.ok(r.stuckMax < 3,
    `partendo da fermo con 5 m/s la panne non deve mai essere dichiarata (ottenuto ${r.stuckMax.toFixed(1)} s)`);
  assert.ok(r.stuckVero > 10,
    `ma in panne vera il cronometro deve correre (ottenuto ${r.stuckVero.toFixed(1)} s)`);
});
