/* LA RIPRESA DELLA SESSIONE.
 *
 * Ricaricare la pagina non deve costare la navigazione in corso: si
 * riparte dal punto in cui si era, sulla stessa barca, con la stessa
 * traversata aperta e la stessa rotta tracciata a mano.
 *
 * Quello che si collauda qui è il giro completo — `salvaSessione()` scrive
 * nell'archivio, `riprendiSessione()` rilegge — e soprattutto il filtro in
 * entrata: quel testo può essere vecchio di dieci versioni o scritto a
 * mano da chi si diverte a rompere le cose, e una barca fuori dalla carta
 * è peggio di una barca in porto.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const APRI = `helpEl.classList.remove("on"); tut.on = false;`;

test("dopo un ricaricamento si riparte da dove si era, sulla stessa barca", async () => {
  const r = await runInGame(`
    ${APRI}
    sessPronta = true;
    cambiaBarca("regata12");
    boat.x = 1200; boat.y = -800; boat.h = 1.1; boat.vx = 2; boat.vy = -1;
    boat.reef = 1; boat.trim = 0.5;
    piano.pts.push({ x: 2000, y: -1500 }, { x: 2600, y: -900 });
    voy.from = "Preveza"; voy.t = 321; voy.dist = 4567;
    voy.track = [[0,0,0],[600,-400,120]];
    destPorto = "Sami"; setRitmo(4, false);
    salvaSessione();
    const grezzo = JSON.parse(localStorage.getItem("vela:sessione"));

    // il ricaricamento: si torna al via, con la barca di partenza
    cambiaBarca("gozzo"); resetBoat(); destPorto = null; setRitmo(1, false);
    const primaX = boat.x;

    caricaSessione().then(ripresa => report({
      ripresa, primaX, barca: barcaId,
      x: boat.x, y: boat.y, h: boat.h, vx: boat.vx, reef: boat.reef,
      punti: piano.pts.length, primoPunto: piano.pts[0],
      da: voy.from, t: voy.t, dist: voy.dist, traccia: voy.track.length,
      dest: destPorto, ritmo: timeScale, carta: grezzo.carta.modo,
      aiuto: helpEl.classList.contains("on")
    }));
  `);

  assert.equal(r.primaX !== 1200, true, "il ricaricamento simulato riporta davvero al via");
  assert.ok(r.ripresa, "la sessione archiviata viene ripresa");
  assert.equal(r.barca, "regata12", "si risale sulla stessa barca");
  assert.equal(r.x, 1200, "e nello stesso punto di mare");
  assert.equal(r.y, -800);
  assert.equal(Math.round(r.h * 100) / 100, 1.1, "con la stessa prua");
  assert.equal(r.vx, 2, "e l'abbrivio che aveva");
  assert.equal(r.reef, 1, "i terzaroli restano presi");
  assert.equal(r.punti, 2, "la rotta tracciata a mano non si perde");
  assert.deepEqual(r.primoPunto, { x: 2000, y: -1500 });
  assert.equal(r.da, "Preveza", "la traversata è ancora quella");
  assert.equal(r.t, 321, "col suo cronometro dov'era");
  assert.equal(r.dist, 4567, "e le miglia già fatte");
  assert.equal(r.traccia, 2, "la traccia percorsa torna indietro");
  assert.equal(r.dest, "Sami", "il porto d'arrivo scelto resta scelto");
  assert.equal(r.ritmo, 4, "e anche il ritmo di gioco");
  assert.equal(r.carta, "ionio");
  assert.equal(r.aiuto, false, "chi riprende una navigazione non si ritrova la guida davanti");
});

test("una sessione che non si può credere viene lasciata perdere", async () => {
  const r = await runInGame(`
    ${APRI}
    const alVia = { x: boat.x, y: boat.y };
    const fuoriCarta = riprendiSessione({ v:1, scafo:{ x: 1e9, y: 1e9 } });
    const dopoFuori = boat.x;
    const vecchia = riprendiSessione({ v:0, scafo:{ x: 500, y: 500 } });
    const niente = riprendiSessione(null);
    const testo = riprendiSessione("VELA1.qualcosa");
    const dopoTutto = boat.x;

    // una barca che non esiste più: la sessione vale, lo scafo no
    const buona = riprendiSessione({ v:1, barca:"astronave", scafo:{ x: 700, y: 300 } });
    report({ alViaX: alVia.x, dopoFuori, dopoTutto, fuoriCarta, vecchia, niente, testo,
             buona, barca: barcaId, x: boat.x, y: boat.y });
  `);

  assert.equal(r.fuoriCarta, false, "una posizione fuori dalla carta non è una posizione");
  assert.equal(r.vecchia, false, "una sessione di un'altra versione non si interpreta");
  assert.equal(r.niente, false);
  assert.equal(r.testo, false, "e nemmeno una stringa qualsiasi");
  assert.equal(r.dopoFuori, r.alViaX, "la barca non si è mossa dal via");
  assert.equal(r.dopoTutto, r.alViaX);
  assert.ok(r.buona, "il resto della sessione resta buono");
  assert.equal(r.barca, "crociera11", "una barca che non esiste lascia quella che c'è");
  assert.equal(r.x, 700, "ma la posizione si riprende lo stesso");
  assert.equal(r.y, 300);
});

test("in carriera non si riprende il mare su una barca che non è tua", async () => {
  const r = await runInGame(`
    ${APRI}
    carrieraInizia();                      // si comincia dal gozzo
    const ripresa = riprendiSessione({ v:1, barca:"regata12", scafo:{ x: 400, y: 200 } });
    const nonTua = barcaId;
    CARRIERA.barche.push("regata12");
    riprendiSessione({ v:1, barca:"regata12", scafo:{ x: 400, y: 200 } });
    report({ ripresa, nonTua, tua: barcaId });
  `);

  assert.ok(r.ripresa, "la sessione si riprende comunque");
  assert.equal(r.nonTua, "gozzo", "ma il dodici da regata non comprato resta in banchina");
  assert.equal(r.tua, "regata12", "comprato, ci si risale dopo il ricaricamento");
});

test("la traversata ripresa arriva in porto e la consegna si chiude", async () => {
  const r = await runInGame(`
    ${APRI}
    carrieraInizia();
    const dest = portoDi("Nydri");
    CARRIERA.incarico = { da:"Preveza", a:"Nydri", merce:"olio", ton:1, fretta:"normale",
                          paga:2500, limite:5000, nmi:12, t:100, incagli:0, tocca:false };
    CARRIERA.soldi = 0;
    // la sessione riprende a un passo dal porto d'arrivo, col cronometro avviato
    const ripresa = riprendiSessione({ v:1, barca:"gozzo",
      scafo:{ x: dest.x - 400, y: dest.y }, traversata:{ da:"Preveza", t:600, dist:9000 } });
    const tPrima = voy.t;
    boat.x = dest.x; boat.y = dest.y;
    voyUpdate(0.1);
    report({ ripresa, tPrima, soldi: CARRIERA.soldi, consegne: CARRIERA.consegne,
             nuovaDa: voy.from, t: voy.t });
  `);

  assert.ok(r.ripresa);
  assert.equal(r.tPrima, 600, "il cronometro della traversata riprende dov'era");
  assert.ok(r.soldi > 0, "arrivando si viene pagati come se non ci fosse stato il ricaricamento");
  assert.equal(r.consegne, 1);
  assert.equal(r.nuovaDa, "Nydri", "e da lì comincia la traversata dopo");
  assert.equal(r.t, 0);
});
