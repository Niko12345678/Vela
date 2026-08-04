/* LA CARRIERA E IL SALVATAGGIO PORTATILE.
 *
 * Due cose diverse che stanno insieme perché la seconda serve alla prima:
 * una carriera che vive solo nell'archivio di un browser è una carriera che
 * si perde cambiando telefono.
 *
 * Qui si collauda quello che *decide* qualcosa — chi può accettare un
 * carico, quanto viene pagato, cosa succede a chi tocca il fondo, e se un
 * codice di salvataggio sopravvive al viaggio di andata e ritorno — non il
 * disegno del pannello, che si esercita comunque perché carRender() gira
 * contro il DOM finto della harness.
 *
 * La carta è quella vera del Ionio, che il gioco carica da sé all'avvio:
 * gli incarichi hanno bisogno di porti veri e di distanze vere.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

/* Apre una carriera senza passare dai pannelli. Sblocca anche il tutorial e
   l'aiuto, che all'avvio sono aperti e fermerebbero il ciclo. */
const APRI = `
  helpEl.classList.remove("on"); tut.on = false;
  carrieraInizia();
`;

test("le offerte di un porto sono le stesse ogni volta che le si chiede", async () => {
  const r = await runInGame(`
    ${APRI}
    const a = offerteDi("Preveza", 7);
    const b = offerteDi("Preveza", 7);
    const c = offerteDi("Preveza", 8);
    const d = offerteDi("Sami", 7);
    report({
      a: JSON.stringify(a), b: JSON.stringify(b),
      cambiaSeme: JSON.stringify(c) !== JSON.stringify(a),
      cambiaPorto: JSON.stringify(d) !== JSON.stringify(a),
      quante: a.length,
      destinazioni: a.map(o => o.a),
      partenze: a.map(o => o.da)
    });
  `);

  assert.equal(r.a, r.b, "stesso porto e stesso seme: stesse tre offerte");
  assert.ok(r.cambiaSeme, "col seme successivo il porto offre altro");
  assert.ok(r.cambiaPorto, "un altro porto offre altro");
  assert.equal(r.quante, 3, "tre offerte per porto");
  assert.ok(!r.destinazioni.includes("Preveza"), "nessuno paga per portare roba dov'è già");
  assert.equal(new Set(r.destinazioni).size, 3, "tre destinazioni diverse");
  assert.deepEqual(r.partenze, ["Preveza", "Preveza", "Preveza"], "tutte partono da qui");
});

test("la paga cresce con la distanza e col carico, la fretta paga di più", async () => {
  const r = await runInGame(`
    ${APRI}
    // le tre offerte sono una vicina, una di mezzo e una lontana: il prezzo
    // al miglio deve restare confrontabile, il totale no
    const off = offerteDi("Preveza", 3);
    const perMiglio = off.map(o => o.paga / o.nmi);
    const ordinate = off.map(o => o.nmi);
    // stessa tratta, due carichi: il grosso paga di più
    const p0 = portoDi("Preveza"), p1 = portoDi("Sami");
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y), nmi = nm(dist);
    const leggero = nmi * (NOLO_FISSO + NOLO_TON * 1);
    const pesante  = nmi * (NOLO_FISSO + NOLO_TON * 8);
    report({ perMiglio, ordinate, leggero, pesante,
             limiti: off.map(o => o.limite), nmis: off.map(o => o.nmi) });
  `);

  assert.ok(r.ordinate[0] < r.ordinate[2], "la prima offerta è più vicina della terza");
  assert.ok(r.pesante > r.leggero * 2, "otto tonnellate pagano molto più di una");
  for (const p of r.perMiglio) assert.ok(p > 100 && p < 1000, "paga al miglio in un ordine sensato: " + p);
  r.limiti.forEach((l, i) => {
    // il tempo concesso non può che crescere con la distanza da fare
    assert.ok(l > r.nmis[i] * 100, "scadenza troppo stretta per " + r.nmis[i] + " nm");
  });
});

test("un carico più grosso della stiva non si carica", async () => {
  const r = await runInGame(`
    ${APRI}
    // il gozzo porta 1,2 t: si costruisce un'offerta da tre e una da mezza
    CARRIERA.offerte = [
      { da: "Preveza", a: "Sami", merce: "mattoni", ton: 3, fretta: "normale",
        paga: 5000, limite: 900, nmi: 20 },
      { da: "Preveza", a: "Kioni", merce: "posta e giornali", ton: 0.5, fretta: "normale",
        paga: 900, limite: 600, nmi: 8 }
    ];
    CARRIERA.offertePorto = voy.from; CARRIERA.offerteSeme = CARRIERA.seme;
    const troppo = accettaOfferta(0);
    const vuota  = CARRIERA.incarico === null;
    const ok     = accettaOfferta(1);
    const preso  = CARRIERA.incarico && CARRIERA.incarico.a;
    const secondo = accettaOfferta(1);   // con la stiva piena non se ne prende un altro
    report({ troppo, vuota, ok, preso, secondo, stiva: stivaBarca(barcaId) });
  `);

  assert.equal(r.stiva, 1.2, "in carriera si comincia dal gozzo");
  assert.match(r.troppo, /stiva/i, "il rifiuto dice perché");
  assert.ok(r.vuota, "l'offerta rifiutata non lascia niente a bordo");
  assert.equal(r.ok, null, "mezza tonnellata ci sta");
  assert.equal(r.preso, "Kioni", "il carico accettato è quello");
  assert.match(r.secondo, /già un carico/i, "una stiva, un carico");
});

test("consegna in orario: paga piena e cassa che cresce", async () => {
  const r = await runInGame(`
    ${APRI}
    CARRIERA.soldi = 1000;
    CARRIERA.incarico = { da: "Preveza", a: "Sami", merce: "sale", ton: 1, fretta: "normale",
                          paga: 4000, limite: 900, nmi: 20, t: 500, incagli: 0, tocca: false };
    const c = consegnaIncarico("Sami");
    const paga = c.paga, soldi = CARRIERA.soldi, stiva = CARRIERA.incarico;
    // un carico per Kioni non si sbarca a Fiskardo solo perché si passa di lì
    CARRIERA.incarico = { da:"Preveza", a:"Kioni", merce:"posta e giornali", ton:1,
                          fretta:"normale", paga:100, limite:600, nmi:8, t:0, incagli:0, tocca:false };
    const altrove = consegnaIncarico("Fiskardo");
    report({ paga, soldi, consegne: CARRIERA.consegne, stiva,
             storia: CARRIERA.storia.length, altrove });
  `);

  assert.equal(r.paga, 4000, "in orario si prende quello che era pattuito");
  assert.equal(r.soldi, 5000, "la paga entra in cassa");
  assert.equal(r.consegne, 1, "una consegna in più");
  assert.equal(r.stiva, null, "la stiva resta vuota");
  assert.equal(r.storia, 1, "la consegna finisce nello storico");
  assert.equal(r.altrove, null, "arrivare in un porto qualsiasi non paga il carico");
});

test("il ritardo scala la paga, ma non sotto un terzo", async () => {
  const r = await runInGame(`
    ${APRI}
    const prova = t => {
      CARRIERA.soldi = 0;
      CARRIERA.incarico = { da: "Preveza", a: "Sami", merce: "sale", ton: 1, fretta: "normale",
                            paga: 4000, limite: 1000, nmi: 20, t, incagli: 0, tocca: false };
      return consegnaIncarico("Sami").paga;
    };
    report({ inOrario: prova(1000), poco: prova(1250), tanto: prova(1900), tantissimo: prova(9000) });
  `);

  assert.equal(r.inOrario, 4000, "al secondo esatto della scadenza si è ancora in orario");
  assert.ok(r.poco < r.inOrario && r.poco > r.tanto, "il taglio cresce col ritardo");
  assert.equal(r.tantissimo, Math.round(4000 * 0.33), "sotto un terzo non si scende");
});

test("chi tocca il fondo bagna la merce, e ogni incaglio conta una volta sola", async () => {
  const r = await runInGame(`
    ${APRI}
    CARRIERA.incarico = { da: "Preveza", a: "Sami", merce: "farina", ton: 1, fretta: "normale",
                          paga: 4000, limite: 1000, nmi: 20, t: 0, incagli: 0, tocca: false };
    // un incaglio lungo dieci secondi resta un incaglio
    boat.grounded = 0.8;
    for (let i = 0; i < 500; i++) incaricoAvanza(0.02);
    const dopoUno = CARRIERA.incarico.incagli;
    boat.grounded = 0; incaricoAvanza(0.02);
    boat.grounded = 0.8; incaricoAvanza(0.02);
    const dopoDue = CARRIERA.incarico.incagli;
    const tempo = CARRIERA.incarico.t;
    CARRIERA.soldi = 0;
    const c = consegnaIncarico("Sami");
    report({ dopoUno, dopoDue, tempo, paga: c.paga, perso: c.perso });
  `);

  assert.equal(r.dopoUno, 1, "dieci secondi sugli scogli sono un incaglio solo");
  assert.equal(r.dopoDue, 2, "riprendere il mare e reincagliarsi ne fa due");
  assert.ok(Math.abs(r.tempo - 10.04) < 0.1, "il cronometro dell'incarico corre anche da fermi");
  assert.ok(Math.abs(r.perso - 0.36) < 1e-9, "due incagli, 36% di merce persa");
  assert.equal(r.paga, Math.round(4000 * 0.64), "la paga scende con la merce persa");
});

test("le barche si comprano, e senza soldi non si comprano", async () => {
  const r = await runInGame(`
    ${APRI}
    CARRIERA.soldi = 1000;
    const povero = compraBarca("crociera11");
    const prima = CARRIERA.barche.slice();
    CARRIERA.soldi = 40000;
    const ricco = compraBarca("crociera11");
    const dopo = CARRIERA.barche.slice();
    const doppione = compraBarca("crociera11");
    const inventata = compraBarca("caravella");
    report({ povero, prima, ricco, dopo, resto: CARRIERA.soldi, doppione, inventata,
             prezzo: prezzoBarca("crociera11") });
  `);

  assert.match(r.povero, /Mancano/, "senza cassa il cantiere dice quanto manca");
  assert.deepEqual(r.prima, ["gozzo"], "e non consegna niente");
  assert.equal(r.ricco, null, "con la cassa piena la barca è tua");
  assert.deepEqual(r.dopo, ["gozzo", "crociera11"], "entra in flotta");
  assert.equal(r.resto, 40000 - r.prezzo, "il prezzo esce dalla cassa");
  assert.match(r.doppione, /già/i, "non si compra due volte");
  assert.match(r.inventata, /sconosciuta/i, "una barca che non esiste non si compra");
});

test("in carriera si naviga solo su quello che si è comprato", async () => {
  const r = await runInGame(`
    ${APRI}
    cambiaBarca("cutter15");
    const dopoNonTua = barcaId;
    compraBarca("cutter15");   // fallisce per i soldi, quindi resta non tua
    CARRIERA.soldi = 200000; compraBarca("cutter15");
    cambiaBarca("cutter15");
    const dopoTua = barcaId;
    // col carico a bordo non si cambia scafo nemmeno fra le proprie
    CARRIERA.incarico = { da:"Preveza", a:"Sami", merce:"sale", ton:1, fretta:"normale",
                          paga:1000, limite:900, nmi:20, t:0, incagli:0, tocca:false };
    cambiaBarca("gozzo");
    const colCarico = barcaId;
    // fuori dalla carriera la flotta è di nuovo tutta a disposizione
    CARRIERA.incarico = null; CARRIERA.attiva = false;
    cambiaBarca("regata12");
    report({ dopoNonTua, dopoTua, colCarico, libera: barcaId });
  `);

  assert.equal(r.dopoNonTua, "gozzo", "il cutter non comprato non si imbarca");
  assert.equal(r.dopoTua, "cutter15", "comprato, ci si sale");
  assert.equal(r.colCarico, "cutter15", "con la stiva piena non si cambia barca");
  assert.equal(r.libera, "regata12", "senza carriera si prova quello che si vuole");
});

test("il codice di salvataggio va e torna identico", async () => {
  const r = await runInGame(`
    ${APRI}
    CARRIERA.soldi = 12345; CARRIERA.consegne = 7; CARRIERA.miglia = 42.5;
    CARRIERA.barche = ["gozzo", "cutter15"];
    CARRIERA.storia = [{ da:"Vathy Itaca", a:"Kioni", merce:"vino nuovo", ton:2, paga:900,
                         pattuita:1000, t:300, limite:400, perso:0, quando:1 }];
    LOG.passages = [{ from:"Preveza", to:"Sami", t:600, dist:9000, when:2 }];
    LOG.best = { "Preveza → Sami": { t:600, dist:9000, when:2, track:[[1,2,3],[4,5,6]] } };
    LOG.polar = { b3: 0.71 };

    const codice = codificaStato(true);
    const st = decodificaStato(codice);
    // e ora si applica su uno stato sporcato, per vedere che sostituisca
    CARRIERA.soldi = 0; LOG.passages = [];
    applicaStato(st);

    let rotto = null, finto = null, vuoto = null;
    try { decodificaStato(codice.slice(0, -3) + "zzz"); } catch (e) { rotto = e.message; }
    try { decodificaStato("ciao"); } catch (e) { finto = e.message; }
    try { decodificaStato(""); } catch (e) { vuoto = e.message; }

    report({
      soldi: CARRIERA.soldi, consegne: CARRIERA.consegne, miglia: CARRIERA.miglia,
      barche: CARRIERA.barche, merce: CARRIERA.storia[0].merce,
      passaggi: LOG.passages.length, polar: LOG.polar.b3,
      record: LOG.best["Preveza → Sami"].t,
      tracciaLeggera: LOG.best["Preveza → Sami"].track === undefined,
      rotto, finto, vuoto,
      // gli spazi di un copia-incolla andato storto non devono contare
      conACapo: decodificaStato(codice.slice(0, 30) + "\\n  " + codice.slice(30)).carriera.soldi
    });
  `);

  assert.equal(r.soldi, 12345, "la cassa torna com'era");
  assert.equal(r.consegne, 7);
  assert.equal(r.miglia, 42.5);
  assert.deepEqual(r.barche, ["gozzo", "cutter15"], "la flotta comprata viaggia col codice");
  assert.equal(r.merce, "vino nuovo", "gli accenti e gli spazi sopravvivono alla base64");
  assert.equal(r.passaggi, 1, "il giornale torna com'era");
  assert.equal(r.polar, 0.71);
  assert.equal(r.record, 600, "i record restano");
  assert.ok(r.tracciaLeggera, "nel codice da incollare le tracce non ci sono");
  assert.match(r.rotto, /firma/i, "un codice storpiato viene riconosciuto");
  assert.match(r.finto, /codice Vela/i, "un testo qualsiasi non è un salvataggio");
  assert.match(r.vuoto, /codice Vela/i, "e nemmeno il vuoto");
  assert.equal(r.conACapo, 12345, "a capo e spazi di un incolla malfatto non rompono niente");
});

test("il file porta anche le tracce, che nel codice non ci stanno", async () => {
  const r = await runInGame(`
    ${APRI}
    LOG.best = { "Preveza → Sami": { t:600, dist:9000, when:2,
      track: Array.from({length:160}, (_,i) => [i*10, i*7, i*3]) } };
    const leggero = codificaStato(true), pieno = codificaStato(false);
    const st = decodificaStato(pieno);
    report({ leggero: leggero.length, pieno: pieno.length,
             tracce: st.log.best["Preveza → Sami"].track.length });
  `);

  assert.ok(r.pieno > r.leggero * 3, "col tracciato il salvataggio pesa molto di più");
  assert.equal(r.tracce, 160, "nel file la traccia del fantasma c'è tutta");
});

test("uno stato che arriva da fuori viene ripulito prima di entrare", async () => {
  const r = await runInGame(`
    ${APRI}
    const sporco = carrieraSana({
      attiva: "sì", soldi: -900, consegne: "tre", miglia: null, seme: 0,
      barche: ["gozzo", "astronave", 42],
      incarico: { a: "Sami", paga: 1000, limite: -5, t: -3, ton: "due" },
      storia: [{ a: "Kioni", paga: "mille" }, null, { nonUnPorto: 1 }]
    });
    const nulla = carrieraSana(null);
    const senzaBarche = carrieraSana({ barche: ["astronave"] });
    report({
      attiva: sporco.attiva, soldi: sporco.soldi, consegne: sporco.consegne,
      miglia: sporco.miglia, seme: sporco.seme, barche: sporco.barche,
      limite: sporco.incarico.limite, tIncarico: sporco.incarico.t,
      storia: sporco.storia.length, pagaStorica: sporco.storia[0].paga,
      nullaSoldi: nulla.soldi, nullaBarche: nulla.barche, senzaBarche: senzaBarche.barche
    });
  `);

  assert.equal(r.attiva, true, "una stringa qualsiasi vale per «attiva»");
  assert.equal(r.soldi, 0, "in cassa non si scende sotto zero");
  assert.equal(r.consegne, 0, "«tre» non è un numero");
  assert.equal(r.miglia, 0);
  assert.equal(r.seme, 1, "il seme parte da uno");
  assert.deepEqual(r.barche, ["gozzo"], "le barche che non esistono cadono");
  assert.ok(r.limite >= 1, "una scadenza negativa non è una scadenza");
  assert.equal(r.tIncarico, 0, "e nemmeno un cronometro negativo");
  assert.equal(r.storia, 1, "le righe senza porto d'arrivo cadono");
  assert.equal(r.pagaStorica, 0, "una paga che non è un numero vale zero");
  assert.equal(r.nullaSoldi, 1500, "da niente esce una carriera nuova");
  assert.deepEqual(r.nullaBarche, ["gozzo"]);
  assert.deepEqual(r.senzaBarche, ["gozzo"], "senza barche valide resta il gozzo");
});

test("la carriera si ritrova nell'archivio alla partita dopo", async () => {
  const r = await runInGame(`
    ${APRI}
    CARRIERA.soldi = 7777; CARRIERA.barche = ["gozzo","crociera11"];
    CARRIERA.incarico = { da:"Preveza", a:"Sami", merce:"sale", ton:1, fretta:"urgente",
                          paga:3000, limite:900, nmi:20, t:120, incagli:1, tocca:true };
    salvaCarriera();
    // com'è messo l'archivio dopo il salvataggio: le offerte non ci vanno
    const grezzo = JSON.parse(localStorage.getItem("vela:carriera"));
    CARRIERA = carrieraVuota();
    // caricaCarriera() è asincrona come loadLog(): la sonda non lo è
    caricaCarriera().then(() =>
      report({ offerteSalvate: grezzo.offerte, soldi: CARRIERA.soldi, barche: CARRIERA.barche,
               attiva: CARRIERA.attiva, dove: CARRIERA.incarico.a, t: CARRIERA.incarico.t,
               incagli: CARRIERA.incarico.incagli, tocca: CARRIERA.incarico.tocca }));
  `);

  assert.equal(r.offerteSalvate, undefined, "le offerte si ricalcolano, non si salvano");
  assert.equal(r.soldi, 7777, "la cassa torna dall'archivio");
  assert.deepEqual(r.barche, ["gozzo", "crociera11"]);
  assert.ok(r.attiva, "e la carriera è ancora aperta");
  assert.equal(r.dove, "Sami", "il carico è ancora a bordo");
  assert.equal(r.t, 120, "col suo cronometro dov'era");
  assert.equal(r.incagli, 1, "e i suoi danni");
  assert.equal(r.tocca, false, "ma non ancora incagliata: quello lo dice il mare, non l'archivio");
});

test("arrivando in porto la consegna si chiude da sé, e la carta cambiata annulla l'incarico", async () => {
  const r = await runInGame(`
    ${APRI}
    CARRIERA.soldi = 0;
    const dest = portoDi("Nydri");
    CARRIERA.incarico = { da: voy.from, a: "Nydri", merce: "olio", ton: 1, fretta: "normale",
                          paga: 2500, limite: 5000, nmi: 12, t: 100, incagli: 0, tocca: false };
    // la barca entra nel cerchio del porto: è voyUpdate a decidere l'arrivo
    voy = { from: voy.from, t: 400, dist: 8000, track: [], moving: true, ghost: null, delta: null };
    boat.x = dest.x; boat.y = dest.y; boat.vx = 1; boat.vy = 0;
    voyUpdate(0.1);
    const soldi = CARRIERA.soldi, stiva = CARRIERA.incarico, miglia = CARRIERA.miglia;

    // e ora un incarico che la carta nuova si porta via
    CARRIERA.incarico = { da:"Nydri", a:"Kioni", merce:"posta e giornali", ton:0.3,
                          fretta:"normale", paga:400, limite:600, nmi:5, t:0, incagli:0, tocca:false };
    mapMode = "rnd"; newWorld("collaudo");
    const dopoCarta = CARRIERA.incarico;
    const soldiDopo = CARRIERA.soldi;
    report({ soldi, stiva, miglia, dopoCarta, soldiDopo });
  `);

  assert.equal(r.soldi, 2500, "entrando in porto il carico si sbarca e viene pagato");
  assert.equal(r.stiva, null, "la stiva si svuota");
  assert.ok(r.miglia > 25 && r.miglia < 30, "le miglia della traversata entrano in carriera");
  assert.equal(r.dopoCarta, null, "su un'altra carta quel porto non c'è più: l'incarico decade");
  assert.equal(r.soldiDopo, 2500, "e decade senza penale, perché non è colpa del marinaio");
});

test("rinunciare a un carico costa un quinto della paga", async () => {
  const r = await runInGame(`
    ${APRI}
    CARRIERA.soldi = 1000;
    CARRIERA.incarico = { da:"Preveza", a:"Sami", merce:"sale", ton:1, fretta:"normale",
                          paga:2000, limite:900, nmi:20, t:10, incagli:0, tocca:false };
    rinunciaIncarico();
    const dopo = CARRIERA.soldi, stiva = CARRIERA.incarico;
    // chi è in bolletta non finisce in rosso
    CARRIERA.soldi = 50;
    CARRIERA.incarico = { da:"Preveza", a:"Sami", merce:"sale", ton:1, fretta:"normale",
                          paga:2000, limite:900, nmi:20, t:10, incagli:0, tocca:false };
    rinunciaIncarico();
    report({ dopo, stiva, inBolletta: CARRIERA.soldi });
  `);

  assert.equal(r.dopo, 600, "duemila di paga, quattrocento di penale");
  assert.equal(r.stiva, null, "il carico torna a terra");
  assert.equal(r.inBolletta, 0, "la penale non porta la cassa sotto zero");
});

/* Il pannello e il riquadro sullo schermo non hanno numeri da verificare, ma
   li si fa girare lo stesso: è così che sono venuti fuori i bug di questo
   file di gioco, disegnando contro il canvas finto della harness. */
test("pannello e riquadro dell'incarico girano senza rompersi", async () => {
  const r = await runInGame(`
    ${APRI}
    CARRIERA.soldi = 50000; CARRIERA.consegne = 3; CARRIERA.miglia = 120.4;
    CARRIERA.storia = [{ da:"Preveza", a:"Sami", merce:"olio", ton:1, paga:800,
                         pattuita:1000, t:900, limite:800, perso:0.18, quando:1 }];
    carEl.classList.add("on");
    carRender();                       // carriera aperta, stiva vuota: si vedono le offerte
    const off = CARRIERA.offerte.length;
    // il gozzo non regge tutti i carichi: si prende il primo che ci sta
    let i = CARRIERA.offerte.findIndex(o => o.ton <= stivaBarca(barcaId));
    if (i < 0) { CARRIERA.offerte[0].ton = 0.5; i = 0; }
    accettaOfferta(i);
    carRender();                       // carico a bordo: si vede l'incarico
    compraBarca("crociera11");
    carRender();
    const codice = carSalvaCodice(true).slice(0, 6);
    carEl.classList.remove("on");
    // e ora il riquadro in mare, col carico a bordo e con un incaglio
    CARRIERA.incarico.incagli = 1;
    tick(20);
    const sano = Number.isFinite(boat.x) && Number.isFinite(boat.h);
    report({ off, codice, sano, dove: CARRIERA.incarico.a });
  `);

  assert.equal(r.off, 3, "il porto mostra le sue tre offerte");
  assert.equal(r.codice, "VELA1.", "il codice si genera dal pannello");
  assert.ok(r.dove, "il carico ha una destinazione");
  assert.ok(r.sano, "venti fotogrammi col riquadro dell'incarico e niente NaN");
});

test("la carriera non tocca la barca né il vento", async () => {
  const r = await runInGame(`
    helpEl.classList.remove("on"); tut.on = false;
    const prima = { x: boat.x, y: boat.y, h: boat.h, w: windBase, id: barcaId };
    // il pannello aperto ferma il ciclo, come il giornale
    toggleCar();
    const fermoAperto = (() => { const x = boat.x; tick(30); return x === boat.x; })();
    toggleCar();
    tick(30);
    const mossa = Math.hypot(boat.x - prima.x, boat.y - prima.y) > 0;
    report({ prima, mossa, fermoAperto, ventoUguale: windBase === prima.w, id: barcaId });
  `);

  assert.ok(r.fermoAperto, "col pannello della carriera aperto il tempo si ferma");
  assert.ok(r.mossa, "chiuso, la barca riparte");
  assert.ok(r.ventoUguale, "e il vento è quello di prima");
  assert.equal(r.id, "crociera11", "senza carriera aperta si resta sulla barca di riferimento");
});
