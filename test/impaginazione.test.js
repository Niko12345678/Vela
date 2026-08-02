/* L'IMPAGINAZIONE DEGLI STRUMENTI — che ci stiano, su qualunque schermo.
 *
 * Gli strumenti sono disegnati a coordinate fisse pensate per una finestra
 * da computer. Su un telefono in verticale, alla lettera, la rosa dei venti
 * finisce sopra il pannello della velocità e la carta ridotta sotto le
 * scotte: è esattamente quello che si vedeva. `hudBox()` decide scala e
 * ingombri, e qui si controlla che quelle scatole non si tocchino e non
 * escano dallo schermo — comprese le larghezze vere di un telefono piccolo
 * e di uno tenuto per il lungo.
 *
 * Il pannello in basso ha in più un vincolo che sul computer non esiste:
 * deve stare SOPRA i joystick, altrimenti si legge sotto le dita.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInGame } from "./harness.js";

const MONDO = `world = { islands: [], marks: [{x:1e9,y:1e9}], ports: [], shade: [],
                         size: 9000, start: {x:0,y:0}, name: "test" };`;

/* Misura le scatole degli strumenti per una finestra data.
   `strumenti` è il pannello in alto a sinistra: 196 px a partire da 14,
   le uniche due misure fisse rimaste. */
const MISURA = `
const misura = (w,h,joyOn) => {
  VW=w; VH=h; joyAttiva(joyOn);
  const b=hudBox();
  return { hs:b.hs, W:b.W, H:b.H, stretto:b.stretto, cartina:b.cartina,
           rosaSin:b.rx-b.rosa-14, strumentiDx:14+196,
           panDx:b.bx+b.bw, panSu:b.by, panGiu:b.by+b.bh,
           fondo:b.fondo, inset:joyInset() };
};
`;

test("gli strumenti stanno dentro lo schermo, dal telefono al monitor", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${MISURA}
    const desktop=misura(1440,820,false);
    const telefono=misura(390,844,true);
    const piccolo=misura(320,568,true);
    const orizzontale=misura(844,390,true);
    const senzaJoy=misura(390,844,false);
    joyAttiva(false); VW=1440; VH=820;
    report({ desktop, telefono, piccolo, orizzontale, senzaJoy });
  `);

  // sul computer non cambia niente: stessa scala, stesse scatole di prima
  assert.equal(r.desktop.hs, 1, "sul monitor gli strumenti restano a grandezza naturale");
  assert.equal(r.desktop.cartina, true, "e la carta ridotta resta al suo posto");
  assert.equal(r.desktop.panGiu, 820 - 14, "il pannello in basso sta dov'era");

  for (const [nome, s] of Object.entries(r)) {
    assert.ok(s.rosaSin > s.strumentiDx,
      `${nome}: la rosa dei venti non deve accavallarsi agli strumenti ` +
      `(comincia a ${s.rosaSin.toFixed(0)}, gli strumenti finiscono a ${s.strumentiDx})`);
    assert.ok(s.panDx <= s.W + 0.5,
      `${nome}: il pannello delle scotte non deve uscire a destra (${s.panDx.toFixed(0)} su ${s.W.toFixed(0)})`);
    assert.ok(s.panSu > 148,
      `${nome}: e non deve salire sugli strumenti (comincia a ${s.panSu.toFixed(0)})`);
  }

  // su schermo stretto la carta ridotta sparisce: non ci sta, e la carta
  // intera è a un pulsante di distanza
  assert.equal(r.telefono.stretto, true, "un telefono in verticale è schermo stretto");
  assert.equal(r.telefono.cartina, false, "e lì la carta ridotta non si disegna");
  assert.equal(r.piccolo.cartina, false, "nemmeno su un telefono piccolo");
  assert.equal(r.orizzontale.cartina, false,
    "e nemmeno col telefono per il lungo, dove in colonna non ci sta sotto la rosa");
  assert.equal(r.desktop.stretto, false, "un monitor no");

  // il pannello in basso sta sopra i joystick, e senza joystick torna in fondo
  assert.ok(r.telefono.panGiu * r.telefono.hs <= 844 - r.telefono.inset + 0.5,
    "col joystick acceso gli strumenti si alzano sopra la fascia dei pad");
  assert.ok(r.senzaJoy.inset === 0 && r.senzaJoy.panGiu * r.senzaJoy.hs > 844 - 40,
    "spenti i joystick, il pannello torna in fondo allo schermo");
  assert.ok(r.orizzontale.inset < r.telefono.inset,
    "col telefono per il lungo la fascia dei pad è più bassa, come nel foglio di stile");
});

test("un fotogramma di strumenti su un telefono non esce dallo schermo", async () => {
  const r = await runInGame(`
    ${MONDO}
    ${MISURA}
    VW=390; VH=844; joyAttiva(true);
    game.msgT=0; game.paused=false; boat.stuck=0; boat.gtime=0; game.auto=false;
    // tutti i pannelli accesi insieme: regata, traversata e rotta pianificata
    voy={from:"Preveza",to:null,t:12,dist:300,moving:true,ghost:null,delta:null};
    piano.pts=[{x:100,y:100}]; piano.i=0; piano.da={x:0,y:0};
    const box=hudBox();
    // il canvas della harness è un guscio vuoto: qui gli si mettono due
    // orecchie per sentire dove finiscono i rettangoli disegnati
    const rett=[];
    ctx.fillRect=(x,y,w,h)=>rett.push([x,y,w,h]);
    drawHUD();
    const finiti=rett.every(q=>q.every(Number.isFinite));
    // i pannelli, non i segnetti delle scale: un pannello è largo e alto
    const pannelli=rett.filter(q=>q[2]>=100&&q[3]>=30);
    const fuori=pannelli.filter(q=>q[0]<-0.5||q[1]<-0.5
      ||(q[0]+q[2])*box.hs>VW+0.5||(q[1]+q[3])*box.hs>VH+0.5);
    const sottoLeDita=pannelli.filter(q=>(q[1]+q[3])*box.hs>VH-joyInset()+0.5);
    // e non devono nemmeno accavallarsi fra loro: la traversata sopra la
    // regata è esattamente il pasticcio da cui è partita questa modifica
    const coppie=[];
    for(let i=0;i<pannelli.length;i++) for(let j=i+1;j<pannelli.length;j++){
      const a=pannelli[i], b=pannelli[j];
      if(a[0]<b[0]+b[2]-0.5 && b[0]<a[0]+a[2]-0.5
       && a[1]<b[1]+b[3]-0.5 && b[1]<a[1]+a[3]-0.5) coppie.push([a,b]);
    }
    report({ finiti, quanti:pannelli.length, fuori, sottoLeDita, coppie });
  `);

  assert.equal(r.finiti, true, "nessuna coordinata NaN negli strumenti");
  assert.ok(r.quanti >= 5, `i pannelli si disegnano davvero (${r.quanti})`);
  assert.deepEqual(r.fuori, [], "nessun pannello esce dallo schermo del telefono");
  assert.deepEqual(r.sottoLeDita, [], "e nessuno finisce sotto i joystick");
  assert.deepEqual(r.coppie, [], "e nessuna coppia di pannelli si sovrappone");
});
