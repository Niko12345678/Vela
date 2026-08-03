/* Il gioco originale, spostato qui integro.
   Da qui si estrae un pezzo alla volta verso src/sim e src/render,
   con la golden test a fare da rete di sicurezza a ogni passo. */

"use strict";
/* ══════════════════ utilità ══════════════════ */
const TAU=Math.PI*2, D2R=Math.PI/180, R2D=180/Math.PI;
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
// angolo normalizzato in [-π, π)
function norm(a){a=(a+Math.PI)%TAU; if(a<0)a+=TAU; return a-Math.PI;}
// convenzione bussola: 0 = Nord (su), 90 = Est (destra)
function dv(a){return {x:Math.sin(a), y:-Math.cos(a)};}
function angOf(x,y){return Math.atan2(x,-y);}
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* ══════════════════ costanti fisiche ══════════════════ */
/* `K` sono i parametri di UNA barca, e si scambiano con setBarca(): la
   flotta sta in src/data/barche.json, che l'host carica prima del gioco —
   src/main.js nel browser, la harness nei test. Il glossario delle
   costanti è in src/data/barche.js.

   `crociera11` è la barca di riferimento: è quella che la golden test
   collauda, ed è il valore di partenza. Cambiare i suoi numeri significa
   cambiare il contratto della simulazione.                              */
const FLOTTA=globalThis.VELA_BARCHE;
if(!FLOTTA||!FLOTTA.barche) throw new Error("flotta non caricata: manca globalThis.VELA_BARCHE");
const BARCA_BASE="crociera11";
let barcaId=BARCA_BASE;
let K=FLOTTA.barche[BARCA_BASE].k;
let MARK_R=45;

/* Scambia la barca. Il corredo cambia con lo scafo, quindi lo stato che
   non ha più senso va riportato a posto: i terzaroli oltre le mani
   disponibili, e lo spinnaker su una barca che non ce l'ha.            */
function setBarca(id){
  if(!FLOTTA.barche[id]) return false;
  barcaId=id; K=FLOTTA.barche[id].k;
  boat.reef=Math.min(boat.reef,K.REEF.length-1);
  if(!K.SAIL_SPI&&boat.spi){boat.spi=false;boat.jibFurled=false;}
  boat.jib=clamp(boat.jib,0,boat.spi?90*D2R:80*D2R);
  return true;
}
function barcaCorrente(){ return FLOTTA.barche[barcaId]; }

/* ══════════════════ mondo procedurale ══════════════════ */
/* Coste reali del Mar Ionio (Natural Earth 10m, interpolate con spline).
   Comprende la costa della Grecia continentale, ritagliata sul bordo della carta.
   Skorpios, troppo piccola per quel dato, è ricostruita alla sua posizione.
   Forme e posizioni relative sono vere; le distanze sono ridotte 1:6,
   altrimenti una traversata durerebbe ore.                              */
/* La carta arriva da src/data/ionian.json, che l'host carica prima del
   gioco: in browser lo fa src/main.js, nei test la harness. Qui non si
   può usare import — la harness esegue questo file dentro una
   new Function, dove una dichiarazione import è un errore di sintassi. */
const IONIO=globalThis.VELA_CARTE&&globalThis.VELA_CARTE.ionio;
if(!IONIO) throw new Error("carta del Ionio non caricata: manca globalThis.VELA_CARTE.ionio");

let world=null;

function mkIsland(pts,name){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(let i=0;i<pts.length;i+=2){
    if(pts[i]<x0)x0=pts[i]; if(pts[i]>x1)x1=pts[i];
    if(pts[i+1]<y0)y0=pts[i+1]; if(pts[i+1]>y1)y1=pts[i+1];
  }
  const hw=clamp(Math.min(x1-x0,y1-y0)*0.13,18,150);   // ampiezza delle secche
  return {n:name||"",l:null,p:pts,x0,y0,x1,y1,hw};
}

/* Distanza con segno dalla costa: positiva a terra, negativa in mare.
   Serve sia per l'incaglio sia per posizionare le boe.                 */
function landDepth(islands,x,y){
  let best=-1e9;
  for(const is of islands){
    if(x<is.x0-400||x>is.x1+400||y<is.y0-400||y>is.y1+400) continue;
    const p=is.p, n=p.length>>1;
    let d2=1e18, inside=false;
    for(let i=0,j=n-1;i<n;j=i++){
      const xi=p[2*i],yi=p[2*i+1],xj=p[2*j],yj=p[2*j+1];
      if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
      const dx=xj-xi, dy=yj-yi;
      let t=((x-xi)*dx+(y-yi)*dy)/(dx*dx+dy*dy||1);
      t=t<0?0:(t>1?1:t);
      const ax=x-(xi+t*dx), ay=y-(yi+t*dy), dd=ax*ax+ay*ay;
      if(dd<d2) d2=dd;
    }
    const v=(inside?1:-1)*Math.sqrt(d2);
    if(v>best) best=v;
  }
  return best;
}
/* Direzione del mare aperto: gradiente della distanza dalla costa. */
function seaward(islands,x,y,e){
  e=e||4;
  const gx=landDepth(islands,x+e,y)-landDepth(islands,x-e,y);
  const gy=landDepth(islands,x,y+e)-landDepth(islands,x,y-e);
  const L=Math.hypot(gx,gy)||1;
  return {x:-gx/L,y:-gy/L};
}

/* Ombra di vento. Una costa alta ferma il vento per chilometri sottovento:
   nel Ionio vero è la cosa che decide una traversata. Per poterlo calcolare
   centinaia di volte per fotogramma approssimo ogni terra con pochi dischi,
   e proietto da ciascuno un cono che si allarga e si esaurisce col tempo.  */
function buildShade(islands){
  const shade=[];
  for(const is of islands){
    const mn=Math.min(is.x1-is.x0,is.y1-is.y0);
    const step=Math.max(80,mn/5);
    let got=0;
    for(let x=is.x0;x<=is.x1;x+=step)
      for(let y=is.y0;y<=is.y1;y+=step){
        const d=landDepth([is],x,y);
        if(d>step*0.35){
          const r=Math.min(d,step*1.5);
          shade.push({x,y,r,L:r*6.5+420});
          got++;
        }
      }
    if(!got){                                   // isolotti: un disco solo
      const r=Math.max(45,mn/2);
      shade.push({x:(is.x0+is.x1)/2,y:(is.y0+is.y1)/2,r,L:r*6.5+420});
    }
  }
  return shade;
}

function genWorld(seedStr){
  const rng=mulberry32(hashStr(seedStr));
  const SIZE=6000, islands=[], seeds=[];
  const target=13+Math.floor(rng()*7);
  let guard=0;
  while(islands.length<target && guard++<3000){
    const base=70+rng()*180;
    const x=(rng()-0.5)*(SIZE-base*3), y=(rng()-0.5)*(SIZE-base*3);
    if(Math.hypot(x,y)<520+base) continue;
    let ok=true;
    for(const sd of seeds){ if(Math.hypot(x-sd.x,y-sd.y)<sd.r+base+260){ok=false;break;} }
    if(!ok) continue;
    const N=46,p1=rng()*TAU,p2=rng()*TAU,p3=rng()*TAU;
    const a1=.20+rng()*.22, a2=.10+rng()*.16, a3=.05+rng()*.10;
    const pts=[];
    for(let i=0;i<N;i++){
      const t=i/N*TAU;
      const r=base*(1+a1*Math.sin(3*t+p1)+a2*Math.sin(5*t+p2)+a3*Math.sin(7*t+p3));
      const d=dv(t); pts.push(x+d.x*r, y+d.y*r);
    }
    seeds.push({x,y,r:base*1.55});
    islands.push(mkIsland(pts));
  }
  // ancoraggi: un punto al largo di ogni costa generata
  const ports=[{n:"Mare aperto",x:0,y:0}];
  islands.slice(0,8).forEach((is,k)=>{
    const n=is.p.length>>1, i=Math.floor(rng()*n);
    const vx=is.p[2*i], vy=is.p[2*i+1];
    const cx0=(is.x0+is.x1)/2, cy0=(is.y0+is.y1)/2;
    const dx=vx-cx0, dy=vy-cy0, L=Math.hypot(dx,dy)||1;
    ports.push({n:"Cala "+String.fromCharCode(65+k),x:Math.round(vx+dx/L*190),y:Math.round(vy+dy/L*190)});
  });
  const marks=[]; guard=0;
  while(marks.length<6 && guard++<5000){
    const a=(marks.length/6)*TAU+(rng()-0.5)*0.7, d=900+rng()*1700;
    const x=Math.sin(a)*d, y=-Math.cos(a)*d;
    if(landDepth(islands,x,y)>-140) continue;
    marks.push({x,y});
  }
  return {islands,marks,ports,shade:buildShade(islands),size:SIZE,start:{x:0,y:0},name:"Arcipelago \u201C"+seedStr+"\u201D"};
}

function ionianWorld(){
  const islands=IONIO.isl.map(o=>{const is=mkIsland(o.p.slice(),o.n);is.l=o.l||null;return is;});
  return {islands,marks:IONIO.marks.map(m=>({x:m.x,y:m.y,n:m.n})),
          ports:IONIO.ports.map(o=>({n:o.n,x:o.x,y:o.y})),shade:buildShade(islands),geo:IONIO.geo,
          size:IONIO.size,start:IONIO.start,name:"Mar Ionio"};
}

/* ══════════════════ stato ══════════════════ */
const boat={x:0,y:0,vx:0,vy:0,h:0,
  trim:45*D2R, jib:35*D2R,                      // scotte: randa e fiocco
  rudder:0, rudderCmd:0, rudderTrim:0, yawRate:0,   // barra: comando, cavallino (il neutro) e pala (con inerzia)
  boomSide:1, boomDraw:Math.PI, jibDraw:Math.PI, jibSide:1, butterfly:false,
  jibFurled:false, jibBack:false, spi:false, spiLimp:false, reef:0, stuck:0, gtime:0,
  wM:{opt:0,lo:0,hi:90*D2R,maxT:90*D2R}, wJ:{opt:0,lo:0,hi:80*D2R,maxT:80*D2R},
  heel:0, luff:0, luffJ:0, aoa:0, aoaJ:0, balance:0, beta:0, grounded:0, wake:[]};
const game={paused:false,auto:false,zoom:3.4,t:0,started:false,clock:0,next:0,done:null,
            msg:"",msgT:0, pilot:0, pilotTgt:0};
let windBase=7, windDirBase=200*D2R, gusts=[], streaks=[];
let assist=0.55;   // 0.55 = mare facile, 1 = pieno
let streakVis=1;   // visibilità dei tratteggi del vento
let timeScale=2;
let mapMode="ionio";   // scala del tempo: tutto accelera insieme, le proporzioni restano

function resetBoat(){
  boat.x=world.start.x;boat.y=world.start.y;boat.vx=0;boat.vy=0;
  // parte al lasco, ma dal lato con più acqua libera davanti
  const cand=[norm(windDirBase+Math.PI*0.62),norm(windDirBase-Math.PI*0.62)];
  let bh=cand[0], bs=-1e9;
  for(const h of cand){
    const d=dv(h);
    let worst=1e9;
    for(const r of [200,400,700]) worst=Math.min(worst,-landDepth(world.islands,boat.x+d.x*r,boat.y+d.y*r));
    if(worst>bs){bs=worst;bh=h;}
  }
  boat.h=bh;
  boat.trim=45*D2R;boat.jib=35*D2R;boat.rudder=0;boat.rudderCmd=0;boat.rudderTrim=0;boat.yawRate=0;
  boat.jibFurled=false;boat.jibBack=false;boat.spi=false;boat.reef=0;boat.stuck=0;boat.gtime=0;
  game.pilot=0;boat.wake.length=0;boat.grounded=0;
  game.clock=0;game.next=0;game.started=false;game.done=null;
  // la rotta pianificata resta — è un disegno del marinaio, non uno stato
  // della barca — ma riparte dal primo punto, come si riparte dal porto
  piano.i=0;piano.da={x:boat.x,y:boat.y};
  if(world.ports) startVoyage(nearestPort(boat.x,boat.y));
  say("Al via da "+(voy?voy.from:"—"));
}
function newWorld(seedStr){
  world=mapMode==="ionio"?ionianWorld():genWorld(seedStr);
  MARK_R=clamp(world.size/130,45,150);
  pianoAzzera(true);                    // altra carta, altri punti: la rotta vecchia non vuol dire niente
  fillPorts();
  gusts=[];for(let i=0;i<14;i++)gusts.push(newGust(true));
  cam.x=boat.x;cam.y=boat.y;streaks=[];for(let i=0;i<160;i++)streaks.push(spawnStreak(true));
  resetBoat();
}
function newGust(anywhere){
  const d=dv(windDirBase+Math.PI);
  const cx=anywhere?boat.x+(Math.random()-.5)*2600:boat.x-d.x*1600+(Math.random()-.5)*1800;
  const cy=anywhere?boat.y+(Math.random()-.5)*2600:boat.y-d.y*1600+(Math.random()-.5)*1800;
  return {x:cx,y:cy,r:180+Math.random()*380,s:(0.14+Math.random()*0.32)*(0.5+assist*0.5),sh:(Math.random()-.5)*14*D2R*(0.5+assist*0.5),life:0};
}
function say(t){game.msg=t;game.msgT=3.2;}

/* campo di vento locale: base oscillante + raffiche */
let shadeDir={x:0,y:1};     // direzione in cui soffia, aggiornata una volta per fotogramma
function windAt(x,y){
  let from=windDirBase+Math.sin(game.t*0.07)*6*D2R+Math.sin(game.t*0.021+1.7)*4*D2R;
  let spd=windBase*(1+0.07*Math.sin(game.t*0.12+0.6));
  for(const g of gusts){
    const d=Math.hypot(x-g.x,y-g.y);
    if(d<g.r){const k=Math.cos(d/g.r*Math.PI/2); spd*=1+g.s*k; from+=g.sh*k;}
  }
  if(world&&world.shade){
    const dx0=shadeDir.x, dy0=shadeDir.y;
    let sh=0, lift=0;
    for(const c of world.shade){
      const dx=x-c.x, dy=y-c.y;
      const along=dx*dx0+dy*dy0;
      if(along<=0||along>c.L) continue;
      const across=Math.abs(-dx*dy0+dy*dx0);
      const w=c.r+along*0.22;
      if(across>w*1.35) continue;
      if(across<w){
        const v=(1-across/w)*(1-along/c.L);
        if(v>sh) sh=v;
      }else{
        const v=(1-(across-w)/(w*0.35))*(1-along/c.L);   // ai bordi il vento accelera
        if(v>lift) lift=v;
      }
    }
    if(sh>0) spd*=1-0.80*Math.pow(sh,0.75);
    else if(lift>0) spd*=1+0.14*lift;
  }
  return {from:norm(from),spd};
}

/* ══════════════════ fisica ══════════════════ */
/* Modello aerodinamico di una vela: identico per randa e fiocco, ma il fiocco
   ha un "solco" più stretto (stalla e fileggia prima), come un genoa vero. */
function sailAero(beta,trim,narrow){
  const alpha=Math.abs(beta)-trim;
  const c=aeroC(alpha,narrow);
  return {alpha,CL:c.CL,CD:c.CD,luff:c.luff};
}

/* Coefficienti di una vela in funzione dell'angolo d'attacco. */
function aeroC(alpha,narrow){
  if(alpha<=0) return {CL:0,CD:K.CD0*0.5,luff:0};
  const a=Math.min(alpha,Math.PI/2), stall=(narrow?25:30)*D2R;   // oltre i 90° è una lastra piatta
  let CL=K.CLmax*Math.sin(2*a);
  if(a>stall) CL*=Math.max(narrow?0.36:0.5,1-(a-stall)/((narrow?105:150)*D2R));
  let CD=K.CD0+K.CDmax*(1-Math.cos(2*a))/2;
  const luff=clamp(a/((narrow?9:7)*D2R),0,1);
  return {CL:CL*luff, CD:K.CD0+(CD-K.CD0)*luff, luff};
}

/* Spinta in avanti data dalla vela: CL·sin(beta) − CD·cos(beta).
   Cercando il massimo si scopre che l'angolo d'attacco migliore NON è fisso:
   vale ~27° di bolina e cresce fino a 90° in poppa, cioè la vela va tenuta
   via via più perpendicolare al vento man mano che si poggia.            */
function bestTrim(beta,maxT,narrow){
  const ab=Math.abs(beta), sb=Math.sin(ab), cb=Math.cos(ab), STEP=1.5*D2R;
  let best=-1e9, opt=0;
  for(let t=0;t<=maxT+1e-9;t+=STEP){
    const c=aeroC(ab-t,narrow), d=c.CL*sb-c.CD*cb;
    if(d>best){best=d;opt=t;}
  }
  const thr=best-Math.abs(best)*0.03;          // finestra al 97% della spinta
  let lo=maxT, hi=0;
  for(let t=0;t<=maxT+1e-9;t+=STEP){
    const c=aeroC(ab-t,narrow);
    if(c.CL*sb-c.CD*cb>=thr){if(t<lo)lo=t;if(t>hi)hi=t;}
  }
  if(hi<lo){lo=opt;hi=opt;}
  return {opt,lo,hi,maxT};
}
/* Polare teorico della barca: risolve l'equilibrio fra spinta velica e
   resistenza dello scafo senza far girare la simulazione. Serve come
   metro di paragone per il polare personale del giornale di bordo.   */
function polarSpeed(twaDeg,wind){
  const twa=Math.abs(twaDeg)*D2R;
  let vf=1.5, vl=0;
  for(let it=0;it<50;it++){
    const fx=wind*Math.cos(twa)+vf, fy=wind*Math.sin(twa)+vl;   // da dove viene, assi barca
    const As=Math.hypot(fx,fy);
    const beta=Math.atan2(fy,fx), ab=Math.abs(beta), sg=beta>=0?1:-1;
    const wm=bestTrim(beta,90*D2R,false), wj=bestTrim(beta,80*D2R,true);
    const cm=aeroC(ab-wm.opt,false), cj=aeroC(ab-wj.opt,true);
    let je=ab<105*D2R?1:lerp(1,0.34,clamp((ab-105*D2R)/(70*D2R),0,1));
    if(ab>145*D2R&&wj.opt>62*D2R) je=0.95;                          // fiocco a farfalla
    const q=As*As;
    const drv=c=>c.CL*Math.sin(ab)-c.CD*Math.cos(ab);
    const lat=c=>c.CL*Math.cos(ab)+c.CD*Math.sin(ab);
    let Ff=q*(K.SAIL_MAIN*drv(cm)+K.SAIL_JIB*je*drv(cj));
    let Fl=-sg*q*(K.SAIL_MAIN*lat(cm)+K.SAIL_JIB*je*lat(cj));
    const spill=1-0.35*Math.pow(clamp(Math.abs(Fl)/K.STIFF,0,1),2);   // sbandamento che sfoga
    Ff*=spill; Fl*=spill;
    let lo=0,hi=9;
    for(let k=0;k<34;k++){
      const m=(lo+hi)/2, x=Math.pow(m/K.VHULL,12), wv=1+K.WAVE*x/(1+x);
      if(K.HULL_F*m*m*wv+K.LIN_F*m<Ff) lo=m; else hi=m;
    }
    let l2=0,h2=4, aF=Math.abs(Fl);
    for(let k=0;k<28;k++){const m=(l2+h2)/2; if(K.HULL_L*m*m+K.LIN_L*m<aF) l2=m; else h2=m;}
    vf+=((lo+hi)/2-vf)*0.5;
    vl+=(Math.sign(Fl)*(l2+h2)/2-vl)*0.5;                          // scarroccio
  }
  return Math.max(0,Math.hypot(vf,vl));
  return Math.max(0,v);
}

function trimWindows(){
  boat.wM=bestTrim(boat.beta,90*D2R,false);
  boat.wJ=bestTrim(boat.beta,boat.spi?90*D2R:80*D2R,true);
}

/* Stato di regolazione di una vela. Tiene conto dei limiti della scotta:
   se sei già tutto lascato e il vento è in poppa non c'è nulla da correggere,
   la spinta per resistenza è il massimo ottenibile a quell'andatura.        */
function trimState(beta,trim,W,aback){
  if(aback) return "collo";
  const ab=Math.abs(beta), a=ab-trim, m=2*D2R;
  if(trim<=0.6*D2R && ab<22*D2R) return "stretta";     // prua troppo al vento: la scotta non basta
  if(a<7*D2R)          return "fileggia";              // vela che sbatte
  if(trim>W.hi+m)      return "lasca";                 // oltre la finestra: poca spinta
  if(trim<W.lo-m)      return trim<W.lo-14*D2R?"stallo":"cazzata";
  if(W.hi>=W.maxT-1*D2R && trim>=W.maxT-1*D2R) return "aperta";
  return "ottima";
}

/* Vela messa a collo: tenuta dal lato sopravvento. L'angolo d'attacco
   diventa |beta| + angolo di scotta, quindi tanta resistenza: spinge la
   prua sottovento e la barca all'indietro. È il modo di uscire dalla panne. */
function sailAback(beta,trim){
  const a=Math.min(Math.abs(beta)+trim,Math.PI/2);
  return {alpha:a, CL:K.CLmax*Math.sin(2*a)*0.85,
          CD:K.CD0+K.CDmax*(1-Math.cos(2*a))/2, luff:1, aback:true};
}

function physics(dt){
  const w=windAt(boat.x,boat.y);
  const wv=dv(w.from+Math.PI);
  const Ax=wv.x*w.spd-boat.vx, Ay=wv.y*w.spd-boat.vy;     // vento apparente (verso cui soffia)
  const As=Math.hypot(Ax,Ay);
  const flow=angOf(Ax,Ay);
  const beta=norm(norm(flow+Math.PI)-boat.h);             // angolo vento apparente / prua
  const sgn=beta>=0?1:-1, ab=Math.abs(beta);
  boat.beta=beta;
  if(game.auto){
    boat.trim=boat.wM.opt;
    if(!boat.jibBack) boat.jib=boat.wJ.opt;
  }

  const m=sailAero(beta,boat.trim,false);
  const jibUp=boat.spi||!boat.jibFurled;
  const backed=boat.jibBack&&jibUp&&!boat.spi;
  const headArea=boat.spi?K.SAIL_SPI:K.SAIL_JIB;
  const j = backed ? sailAback(beta,boat.jib) : sailAero(beta,boat.jib,true);
  boat.aoa=m.alpha; boat.aoaJ=j.alpha;
  boat.stM=trimState(beta,boat.trim,boat.wM,false);
  boat.stJ=boat.spi?(boat.spiLimp?"sventato":trimState(beta,boat.jib,boat.wJ,false))
           :(boat.jibFurled?"avvolto":trimState(beta,boat.jib,boat.wJ,backed));
  boat.luff=1-m.luff; boat.luffJ=jibUp?1-j.luff:0;

  // il fiocco resta coperto dalla randa alle andature portanti,
  // a meno che non lo si porti dall'altro lato: a farfalla
  boat.butterfly = jibUp && !boat.spi && !backed && ab>145*D2R && boat.jib>62*D2R;
  let jibEff;
  if(boat.spi){
    // lo spinnaker si gonfia solo con il vento abbastanza aperto, e resta
    // molto meno coperto dalla randa perché lavora proiettato fuori bordo
    jibEff=clamp((ab-60*D2R)/(26*D2R),0,1);
    jibEff*=ab<115*D2R?1:lerp(1,0.78,clamp((ab-115*D2R)/(65*D2R),0,1));
    boat.spiLimp=ab<66*D2R;
  }else{
    jibEff = ab<105*D2R ? 1 : lerp(1,0.34,clamp((ab-105*D2R)/(70*D2R),0,1));
    if(boat.butterfly) jibEff=0.95;
    if(backed) jibEff=1;
    if(!jibUp) jibEff=0;
    boat.spiLimp=false;
  }
  // effetto solco: le due vele ben regolate insieme rendono più della somma
  const inGroove=x=>x>7*D2R&&x<26*D2R;
  const slot=(jibUp&&!backed&&!boat.spi&&inGroove(m.alpha)&&inGroove(j.alpha))?1.08:1;

  const q=As*As;
  const mainArea=K.SAIL_MAIN*K.REEF[boat.reef];
  const Lm=q*mainArea*m.CL*slot, Dm=q*mainArea*m.CD;
  const Lj=q*headArea*j.CL*jibEff, Dj=q*headArea*j.CD*jibEff;
  const ld=dv(flow+sgn*Math.PI/2), fd=dv(flow);
  const fwd=dv(boat.h), lat=dv(boat.h+Math.PI/2);
  const proj=(L,D)=>{
    const Fx=L*ld.x+D*fd.x, Fy=L*ld.y+D*fd.y;
    return {f:Fx*fwd.x+Fy*fwd.y, l:Fx*lat.x+Fy*lat.y};
  };
  const Fm=proj(Lm,Dm), Fj=proj(Lj,Dj);
  let Ff=Fm.f+Fj.f, Fl=Fm.l+Fj.l;

  // momento di imbardata: la randa tira a poppavia del centro di deriva
  // (fa orzare), il fiocco a proravia (fa puggiare)
  const Tm=Fm.l*K.ARM_M, Tj=Fj.l*K.ARM_J;
  boat.balance=clamp((Tj-Tm)*sgn/(Math.abs(Tm)+Math.abs(Tj)+40),-1,1);

  const heelT=clamp(Math.abs(Fl)/K.STIFF,0,1);
  boat.heel=lerp(boat.heel,clamp(Fl/K.STIFF,-1,1),1-Math.exp(-3*dt));
  const spill=1-0.35*heelT*heelT;                            // troppo sbandata = vento sfogato
  Ff*=spill; Fl*=spill;

  let vf=boat.vx*fwd.x+boat.vy*fwd.y, vl=boat.vx*lat.x+boat.vy*lat.y;
  const x=Math.pow(Math.abs(vf)/K.VHULL,12), wave=1+K.WAVE*x/(1+x);   // muro dell'onda
  const Hf=-Math.sign(vf)*K.HULL_F*vf*vf*wave-K.LIN_F*vf;
  const Hl=-Math.sign(vl)*K.HULL_L*vl*vl-K.LIN_L*vl;
  const drag=boat.grounded>0?0.55:1;                          // incagliato: si striscia
  vf+=(Ff*drag+Hf)/K.MASS*dt;
  vl+=(Fl*drag+Hl)/K.MASS*dt;
  boat.vx=vf*fwd.x+vl*lat.x; boat.vy=vf*fwd.y+vl*lat.y;

  // ─ barra: la pala insegue il comando con la sua inerzia
  boat.rudder+=(boat.rudderCmd-boat.rudder)*(1-Math.exp(-dt/0.30));
  // le vele imbardano; alle andature veloci lo scafo tiene la rotta molto meglio
  // Senza abbrivio la deriva non ha presa: la barca scarroccia invece di ruotare.
  // Il fiocco a collo fa eccezione, perché spinge la prua di forza anche da fermo.
  const yawSpd=backed?1:clamp(0.20+Math.abs(vf)*0.55,0,1);
  const yawSail=(Tj-Tm)*K.YAW*assist*yawSpd/(1+Math.abs(vf)*0.35);
  boat.yawSail=yawSail*R2D;   // °/s dovuti alle sole vele
  // La pala morde in proporzione all'acqua che le scorre sopra: con abbrivio
  // la barca risponde bene, quasi ferma non risponde quasi per niente.
  const av=Math.abs(vf), sv=Math.sign(vf);
  const rEff=sv*(Math.min(av,3.6)+1.0*clamp((av-0.7)/0.5,0,1));
  const yawTgt=boat.rudder*rEff*K.RUDDER+yawSail;
  boat.yawRate+=(yawTgt-boat.yawRate)*(1-Math.exp(-dt/K.YAWTAU));   // massa che ruota
  boat.h=norm(boat.h+boat.yawRate*dt);

  // il fiocco a collo si libera da solo quando la prua è caduta
  if(backed && ab>65*D2R && Math.hypot(boat.vx,boat.vy)>1.0){
    boat.jibBack=false; say("Prua caduta — fiocco liberato");
  }
  // riconosce la panne e suggerisce la manovra
  const spNow=Math.hypot(boat.vx,boat.vy);
  if(spNow<0.35 && ab<52*D2R){
    boat.stuck+=dt;
    if(boat.stuck>3 && game.msgT<=0)
      say(jibUp?"In panne — premi B: fiocco a collo per far cadere la prua":"In panne — issa il fiocco (F) e mettilo a collo (B)");
  } else boat.stuck=0;
  boat.x+=boat.vx*dt; boat.y+=boat.vy*dt;

  // boma e fiocco sul lato sottovento (a farfalla, o a collo sopravvento)
  if(ab>4*D2R) boat.boomSide=sgn;
  boat.jibSide=(boat.butterfly||backed)?-boat.boomSide:boat.boomSide;
  const tgtM=Math.PI+boat.trim*boat.boomSide, tgtJ=Math.PI+boat.jib*boat.jibSide;
  boat.boomDraw+=norm(tgtM-boat.boomDraw)*(1-Math.exp(-9*dt));
  boat.jibDraw +=norm(tgtJ-boat.jibDraw )*(1-Math.exp(-7*dt));

  // ─ collisione con la terra
  const dep=landDepth(world.islands,boat.x,boat.y);
  if(dep>-K.PESCAGGIO){
    const nv=seaward(world.islands,boat.x,boat.y);
    const nx=nv.x, ny=nv.y;
    boat.x+=nx*(dep+K.PESCAGGIO)*Math.min(1,dt*10); boat.y+=ny*(dep+K.PESCAGGIO)*Math.min(1,dt*10);
    const into=boat.vx*nx+boat.vy*ny;
    if(into<0){boat.vx-=into*nx*1.6;boat.vy-=into*ny*1.6;}
    const kd=Math.exp(-2.2*dt); boat.vx*=kd; boat.vy*=kd;   // attrito sul fondo, indipendente dal passo
    if(boat.grounded<=0) say("Incagliato! Lasca le vele e vira per liberarti");
    boat.grounded=0.8;
    boat.gtime+=dt;
  } else {boat.grounded=Math.max(0,boat.grounded-dt); boat.gtime=Math.max(0,boat.gtime-dt*2);}

  // ─ limite del mondo
  const R=world.size*0.52, d0=Math.hypot(boat.x,boat.y);
  if(d0>R){const k=(d0-R)/220;
    boat.vx-=boat.x/d0*k*dt*30; boat.vy-=boat.y/d0*k*dt*30;
    if(game.msgT<=0) say("Fuori dalle acque della carta — rientra");}

  // ─ scia
  const sp=Math.hypot(boat.vx,boat.vy);
  if(sp>0.25 && (boat.wake.length===0 || Math.hypot(boat.x-boat.wake[0].x,boat.y-boat.wake[0].y)>3.5))
    boat.wake.unshift({x:boat.x,y:boat.y,s:sp});
  if(boat.wake.length>90) boat.wake.pop();

  // ─ regata
  if(!game.started && sp>0.6){game.started=true;}
  if(game.started && !game.done) game.clock+=dt;
  if(!game.done && world.marks[game.next]){
    const mk=world.marks[game.next];
    if(Math.hypot(boat.x-mk.x,boat.y-mk.y)<MARK_R){
      game.next++;
      if(game.next>=world.marks.length){game.done=game.clock; say("Percorso completato in "+fmtT(game.clock));}
      else say((mk.n?mk.n+" girata":"Boa "+game.next+" girata")+" — avanti a "+(world.marks[game.next].n||("n° "+(game.next+1))));
    }
  }
}

/* Autotimoniere: 1 = mantiene la rotta bussola, 2 = mantiene l'angolo
   col vento apparente, come un autotimoniere a vento vero.            */
function autopilot(dt){
  if(!game.pilot)return;
  if(game.pilot===1){
    // richiamo elastico: la barra torna piano al centro se non la tieni
    const L=keys["arrowleft"]||keys["a"], R=keys["arrowright"]||keys["d"];
    if(!L&&!R) boat.rudderCmd-=(boat.rudderCmd-boat.rudderTrim)*Math.min(1,1.9*dt);   // torna al cavallino, non al centro
    return;
  }
  // un pilota che continua a governare con la barca ferma ti impedisce di ripartire
  if(boat.stuck>2){game.pilot=0;boat.rudderCmd=0;
    say("Autotimoniere disinserito: la barca è ferma, riprendi tu la barra");return;}
  let err;
  if(game.pilot===2) err=norm(game.pilotTgt-boat.h);
  else err=norm(boat.beta-game.pilotTgt);
  boat.rudderCmd=clamp(err*3.4-boat.yawRate*6.5,-1,1);
}
function fmtT(s){const m=Math.floor(s/60);return String(m).padStart(2,"0")+":"+String(Math.floor(s%60)).padStart(2,"0")+"."+String(Math.floor(s*10%10));}

/* ─ cavallino ─
   Per non cambiare rotta serve tenere la barra ferma FUORI dal centro: di
   bolina un quarto di barra, con vento fresco quasi metà. Con le sole
   frecce (1,15 per secondo) quel valore non si riesce né a centrare né a
   ritrovare dopo una correzione, e sembra che la barca non tenga la rotta.
   Il cavallino è il neutro della barra: `,` e `.` lo spostano fine, la
   barra ci va insieme, e da lì in poi i comandi tornano lì invece che al
   centro. Non è una forza in più — la fisica non lo vede nemmeno. */
const barraDesc=v=>Math.round(Math.abs(v)*100)+"% a "+(v>0?"dritta":"sinistra");
function setCavallino(v){
  const nv=clamp(v,-1,1);
  boat.rudderCmd=clamp(boat.rudderCmd+(nv-boat.rudderTrim),-1,1);
  boat.rudderTrim=nv;
}
/* Rimettere dritta la barra: la chiamano Spazio (tastiera) e il doppio
   click del tasto destro (mouse), che devono fare la stessa identica cosa.
   Con `azzera` (Maiusc+Spazio) sparisce anche il cavallino; senza, la barra
   torna al cavallino e non al centro geometrico — è la regola di tutta la
   barca, altrimenti ogni raddrizzata cancellerebbe la regolazione. */
function centraBarra(azzera){
  if(azzera){boat.rudderTrim=0;boat.rudderCmd=0;}
  else boat.rudderCmd=boat.rudderTrim;
  if(game.pilot){game.pilot=0;say("Autotimoniere disinserito — "+(boat.rudderTrim?"barra al cavallino":"barra dritta"));}
  else if(azzera) say("Barra dritta e cavallino azzerato");
  else if(boat.rudderTrim) say("Barra riportata al cavallino — "+barraDesc(boat.rudderTrim));
}

/* ══════════════════ tratteggi del vento ══════════════════ */
/* Ogni tratteggio segue il vento LOCALE: dentro una raffica si allunga,
   si schiarisce, si ispessisce e accelera. Sono il modo principale per
   leggere forza e direzione senza guardare gli strumenti.            */
const SEG=3;
function viewRadius(){return Math.max(VW,VH)/2/game.zoom*1.35;}
function spawnStreak(anywhere){
  const R=viewRadius(), d=dv(windDirBase+Math.PI), n=dv(windDirBase+Math.PI/2);
  let x,y;
  if(anywhere){
    const a=Math.random()*TAU, r=Math.sqrt(Math.random())*R;
    x=cam.x+Math.cos(a)*r; y=cam.y+Math.sin(a)*r;
  }else{                                   // rientra dal bordo sopravvento
    const u=(Math.random()*2-1)*R*1.15;
    x=cam.x-d.x*R+n.x*u; y=cam.y-d.y*R+n.y*u;
  }
  return {x,y,dx:d.x,dy:d.y,len:20,b:0,spd:windBase,ph:Math.random()};
}
function updateWind(dt){
  shadeDir=dv(windDirBase+Math.PI);
  // raffiche alla deriva sottovento
  const gd=dv(windDirBase+Math.PI);
  for(let i=0;i<gusts.length;i++){
    const g=gusts[i];
    g.x+=gd.x*windBase*0.55*dt; g.y+=gd.y*windBase*0.55*dt; g.life+=dt;
    if(Math.hypot(g.x-cam.x,g.y-cam.y)>viewRadius()+2200) gusts[i]=newGust(false);
  }
  // densità adattata all'inquadratura
  const R=viewRadius();
  const target=clamp(Math.round(R*R*0.0027*(0.55+streakVis*0.45)),80,460);
  while(streaks.length<target) streaks.push(spawnStreak(streaks.length>0?false:true));
  while(streaks.length>target) streaks.pop();

  for(let i=0;i<streaks.length;i++){
    const s=streaks[i];
    const w=windAt(s.x,s.y);
    const d=dv(w.from+Math.PI);
    s.dx=d.x; s.dy=d.y;
    s.len=6+w.spd*2.5;                              // più vento = tratto più lungo
    const r=w.spd/windBase;                          // fascia relativa: 0 calma, 2 raffica piena
    s.b=r<1.06?0:(r<1.24?1:2);
    s.spd=w.spd;
    s.x+=d.x*w.spd*0.95*dt; s.y+=d.y*w.spd*0.95*dt; // e scorre più in fretta
    if(Math.hypot(s.x-cam.x,s.y-cam.y)>R*1.12) streaks[i]=spawnStreak(false);
  }
}

/* ══════════════════ input ══════════════════ */
const keys=Object.create(null);
function cyclePilot(){
  game.pilot=(game.pilot+1)%4;
  if(game.pilot===1) say("Barra con richiamo al centro — torna dritta se la molli");
  else if(game.pilot===2){game.pilotTgt=boat.h;say("Autotimoniere su ROTTA "+String(Math.round((boat.h*R2D+360)%360)).padStart(3,"0")+"°");}
  else if(game.pilot===3){
    const sg=boat.beta>=0?1:-1;
    let t=boat.beta;
    if(Math.abs(t)<38*D2R){t=sg*38*D2R;say("Autotimoniere a VENTO — 30° è dentro la zona morta, imposto 38°");}
    else say("Autotimoniere a VENTO — mantiene "+Math.round(Math.abs(t*R2D))+"° apparenti");
    game.pilotTgt=t;
  }
  else say("Autotimoniere disinserito — barra libera");
}
addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(["arrowleft","arrowright","arrowup","arrowdown"," "].includes(k))e.preventDefault();
  if(askEl.classList.contains("on")){
    if(k==="enter"||k==="y"||k==="s")askClose(true);
    else if(k==="escape"||k==="n")askClose(false);
    return;
  }
  if(e.repeat)return;
  keys[k]=1;
  comando(k,e.shiftKey);
});
addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=0;});
addEventListener("blur",()=>{for(const k in keys)keys[k]=0;});

/* I comandi a colpo singolo, staccati dall'ascoltatore della tastiera
   perché non è più lei sola a darli: la pulsantiera dei joystick manda qui
   le stesse lettere, e un collaudo può chiamarli senza recapitare eventi.
   Quello che si tiene premuto — frecce, Q/E, virgola e punto — sta invece
   in input(), che lo legge fotogramma per fotogramma. */
function comando(k,shift){
  if(k==="p")game.paused=!game.paused;
  if(k==="m")toggleMenu();
  if(k==="l")toggleLog();
  if(k==="c")toggleChart();
  if(k==="0"&&chart.on)chartFit();
  // sulla carta si cancella la rotta: Canc toglie l'ultimo punto,
  // Maiusc+Canc l'intera linea. Fuori dalla carta non c'è niente da segnare
  if(chart.on&&(k==="backspace"||k==="delete")){
    if(shift||!piano.pts.length)pianoAzzera();
    else{pianoTogli(piano.pts.length-1);
         say(piano.pts.length?"Ultimo punto tolto — ne restano "+piano.pts.length:"Rotta cancellata");}
  }
  if(k==="h")toggleHelp();
  if(k==="r")askConfirm("Riportare la barca al via? La regata in corso e il cronometro ripartono da zero.",resetBoat);
  if(k==="z")cyclePilot();
  if(k==="x"){
    boat.reef=(boat.reef+1)%K.REEF.length;
    say(boat.reef?("Randa terzarolata: "+boat.reef+"ª mano, superficie al "+Math.round(K.REEF[boat.reef]*100)+"%")
                 :"Randa a tutto ferro");
  }
  if(k==="g"){
    if(!K.SAIL_SPI){say(barcaCorrente().nome+": niente spinnaker a bordo");return;}
    boat.spi=!boat.spi;boat.jibBack=false;
    if(boat.spi){boat.jibFurled=true;boat.jib=clamp(boat.jib,30*D2R,90*D2R);
      say("Spinnaker a riva — vale solo alle andature portanti");}
    else{boat.jibFurled=false;boat.jib=clamp(boat.jib,0,80*D2R);say("Spinnaker ammainato, fiocco issato");}
  }
  if(k==="f"){boat.jibFurled=!boat.jibFurled;if(boat.jibFurled)boat.jibBack=false;
    say(boat.jibFurled?"Fiocco avvolto — la barca orza di più, lasca la randa":"Fiocco issato");}
  if(k==="b"){
    if(boat.jibFurled)say("Il fiocco è avvolto — premi F per issarlo");
    else{boat.jibBack=!boat.jibBack;say(boat.jibBack?"Fiocco a collo — la prua cade sottovento":"Fiocco liberato");}
  }
  if(k==="n"){document.getElementById("seed").value=Math.random().toString(36).slice(2,8);newWorld(document.getElementById("seed").value);}
  if(k==="t"){game.auto=!game.auto;say(game.auto?"Regolazione vele AUTOMATICA":"Regolazione vele manuale");}
  if(k==="+"||k==="=")game.zoom=clamp(game.zoom*1.25,1.1,9);
  if(k==="-"||k==="_")game.zoom=clamp(game.zoom/1.25,1.1,9);
  if(k==="k"){
    if(game.pilot>=2) say("Governa l'autotimoniere: Z per riprendere la barra");
    else{
      boat.rudderTrim=boat.rudderCmd;
      say(Math.abs(boat.rudderTrim)<0.02?"Cavallino azzerato — la barra è dritta"
          :"Cavallino preso a "+barraDesc(boat.rudderTrim)+" — la barra torna qui, non al centro");
    }
  }
  if(k===" ") centraBarra(shift);
}

function input(dt){
  const L=keys["arrowleft"]||keys["a"], R=keys["arrowright"]||keys["d"];
  if(game.pilot>=2){
    // con l'autotimoniere inserito il timone corregge la ROTTA IMPOSTATA
    const r=26*D2R*dt;
    if(L&&!R) game.pilotTgt=norm(game.pilotTgt-r);
    if(R&&!L) game.pilotTgt=norm(game.pilotTgt+r);
  }else{
    // la barra resta dove la lasci (frizione inserita) e si muove con inerzia
    if(L&&!R) boat.rudderCmd=clamp(boat.rudderCmd-1.15*dt,-1,1);
    else if(R&&!L) boat.rudderCmd=clamp(boat.rudderCmd+1.15*dt,-1,1);
  }
  // cavallino: cinque volte più fine delle frecce, e sposta il neutro con sé
  if(game.pilot<2){
    const ct=0.22*dt;
    if(keys[","]&&!keys["."]) setCavallino(boat.rudderTrim-ct);
    else if(keys["."]&&!keys[","]) setCavallino(boat.rudderTrim+ct);
  }
  if(!game.auto){
    const rate=50*D2R*dt, both=!!keys["shift"];
    const IN=keys["arrowup"]||keys["w"], OUT=keys["arrowdown"]||keys["s"];
    if(IN){boat.trim=clamp(boat.trim-rate,0,90*D2R); if(both)boat.jib=clamp(boat.jib-rate,0,80*D2R);}
    if(OUT){boat.trim=clamp(boat.trim+rate,0,90*D2R); if(both)boat.jib=clamp(boat.jib+rate,0,80*D2R);}
    const mx=boat.spi?90*D2R:80*D2R;
    if(keys["q"])boat.jib=clamp(boat.jib-rate,0,mx);
    if(keys["e"])boat.jib=clamp(boat.jib+rate,0,mx);
  }
  joyInput(dt);
}

/* Rotelle del mouse: verticale = randa, orizzontale = fiocco.
   Con Alt — o col tasto destro tenuto premuto, per governare con una mano
   sola — si muove invece la barra del timone.
   Funziona anche con lo scorrimento a due dita del trackpad.

   `wheelStep` è il passo di uno scatto, scelto nel menù: 1 è quello di
   sempre (~6° di scotta per scatto), 0.1 è un decimo. Serve perché la
   fascia verde dell'ottimo è larga pochi gradi e con lo scatto pieno la si
   scavalca a ogni tentativo. Moltiplica tutto quello che si regola con la
   rotella — scotte, barra, cavallino, rotta impostata — ma NON lo zoom.

   Le costanti per scatto pieno (a 100 px di scatto, il valore usuale):
   scotte 6°, barra 0,25 di corsa, cavallino 0,05 (un quinto della barra,
   come `,` `.` stanno alle frecce), rotta impostata 5°.               */
let wheelInv=false, wheelStep=1;
const W_SCOTTA=0.06*D2R, W_BARRA=0.0025, W_CAVALLINO=0.0005, W_ROTTA=0.05*D2R;

function rotella(e){
  const u=e.deltaMode===1?16:(e.deltaMode===2?400:1);      // righe o pagine -> pixel
  if(chart.on){                                            // sulla carta: zoom sul cursore
    const p=c2w(e.offsetX!==undefined?e.offsetX:VW/2,e.offsetY!==undefined?e.offsetY:VH/2);
    const f=Math.pow(0.9988,e.deltaY*u);
    chart.z=clamp(chart.z*f,Math.min(VW,VH)*0.30/world.size,0.9);
    const q=c2w(e.offsetX!==undefined?e.offsetX:VW/2,e.offsetY!==undefined?e.offsetY:VH/2);
    chart.x+=p.x-q.x; chart.y+=p.y-q.y;
    return;
  }
  if(e.ctrlKey){                                           // ctrl+rotella = zoom della carta
    game.zoom=clamp(game.zoom*Math.pow(0.9988,e.deltaY*u),1.1,9);return;
  }
  if(game.paused)return;
  const s=e.deltaY*u*wheelStep*(wheelInv?-1:1);            // scatto normalizzato, in pixel
  // Alt oppure il tasto destro tenuto premuto: `buttons` dice quali bottoni
  // sono giù *durante* lo scatto, quindi non serve ricordarselo da soli
  if(e.altKey||(e.buttons&2)){     // si governa, e vale anche a vele automatiche
    if(!s)return;
    // il timone va al contrario delle scotte: rotella IN SU a dritta, IN GIÙ
    // a sinistra, come la ruota del timone che si gira dalla parte in cui si
    // vuole andare. Vale per tutto quello che governa — barra, cavallino e
    // rotta impostata — perché è lo stesso gesto e deve far accostare la
    // barca sempre dalla stessa parte.
    const g=-s;
    if(game.pilot>=2) game.pilotTgt=norm(game.pilotTgt+g*W_ROTTA);   // sposta la rotta impostata
    else if(e.shiftKey) setCavallino(boat.rudderTrim+g*W_CAVALLINO); // Alt+Maiusc = il neutro
    else boat.rudderCmd=clamp(boat.rudderCmd+g*W_BARRA,-1,1);
    return;
  }
  if(game.auto)return;
  const dy=s*W_SCOTTA, dx=e.deltaX*u*wheelStep*(wheelInv?-1:1)*W_SCOTTA;
  const mx=boat.spi?90*D2R:80*D2R;
  if(dy){
    boat.trim=clamp(boat.trim+dy,0,90*D2R);
    if(e.shiftKey) boat.jib=clamp(boat.jib+dy,0,mx);       // shift: le due scotte insieme
  }
  if(dx) boat.jib=clamp(boat.jib+dx,0,mx);
}
addEventListener("wheel",e=>{
  if(e.target&&e.target.closest&&e.target.closest("#settings,#help,#ask,#tut,#showm"))return;
  if(helpEl.classList.contains("on")||askEl.classList.contains("on"))return;
  e.preventDefault();
  rotella(e);
},{passive:false});
// senza questo, il tasto destro usato come modificatore apre il menù del
// browser sopra il mare; sui pannelli del menù resta invece disponibile
addEventListener("contextmenu",e=>{ if(e.target&&e.target.id==="cv")e.preventDefault(); });

/* Doppio click del tasto destro sul mare: barra dritta, come Spazio.
   Il tasto destro è già il modificatore del timone — tenuto premuto si
   governa con la rotella — quindi chi governa col mouse ha lì sotto il dito
   anche il modo di raddrizzare, senza tornare alla tastiera.
   I due click si contano a mano: `dblclick` il browser lo manda solo per il
   tasto sinistro. La finestra è quella di sistema (~350 ms) e il tempo lo
   dà l'evento, non l'orologio, così la funzione resta collaudabile. */
const DOPPIO_MS=350;
let ultimoDestro=-1e9;
function clickDestro(e){
  if(e.button!==2)return false;
  const doppio=e.timeStamp-ultimoDestro<=DOPPIO_MS;
  ultimoDestro=doppio?-1e9:e.timeStamp;      // il terzo click non fa una seconda coppia
  if(!doppio||chart.on||game.paused)return false;
  const conPilota=game.pilot;
  centraBarra(false);
  // centraBarra tace quando non c'è niente da dire; qui una conferma serve,
  // perché il gesto è del mouse e non si vede se è stato inteso
  if(!conPilota&&!boat.rudderTrim) say("Barra dritta");
  return true;
}
addEventListener("mousedown",e=>{ if(e.target&&e.target.id==="cv") clickDestro(e); });

/* ══════════════════ comandi a dito ══════════════════
   In fondo allo schermo: a sinistra il pad del TIMONE, a destra due
   MANOPOLE, una per scotta. Nascono per il telefono, dove i sei pulsanti
   di prima erano tutto o niente e coprivano mezzo mare, ma si accendono
   anche dal menù: chi ha un mouse senza rotella orizzontale non ha nessun
   altro modo di cazzare il fiocco a dosaggio continuo.

   I due comandi non sono della stessa natura, perché non lo sono nemmeno
   a bordo.

   Il timone è un comando di VELOCITÀ, come i tasti: quanto sposti il dito
   decide quanto in fretta si muove la barra, e mollando il pad la barra
   resta dov'è. Un joystick che tornasse al centro la raddrizzerebbe a ogni
   dito alzato, cioè il contrario della frizione inserita che questa barca
   ha di serie.

   Le scotte invece sono POSIZIONE: la manopola è un verricello, e dove sta
   lei sta la vela. Il primo pad a due assi le dava a velocità come i tasti,
   ma con la fascia verde dell'ottimo larga pochi gradi si finiva sempre per
   scavalcarla; girando, invece, ogni punto della corsa ha il suo posto
   sotto il dito e ci si torna. Due giri interi coprono tutta la corsa —
   720° di dita per 90° di scotta, otto gradi di manopola per uno di vela.
   In senso ORARIO si cazza, come si avvolge una cima sul tamburo.

   La manopola non ha uno stato suo: legge e scrive `boat.trim` e
   `boat.jib`. Così la regolazione automatica (T), i terzaroli e lo
   spinnaker la muovono da soli, e l'anello esterno mostra sempre dove sta
   davvero la vela rispetto alla finestra buona. */
const joy={on:false, timone:{x:0,id:null}};
const JOY_MORTA=0.10;              // zona morta: il dito appoggiato non governa
const JOY_ALTA=166, JOY_BASSA=128; // altezza della fascia, gemella di #joy in index.html

/* Quanto spazio si prendono i joystick in fondo allo schermo. Gli strumenti
   si alzano di altrettanto: sotto le dita non ci si legge niente. */
function joyInset(){ return joy.on?(VH<520?JOY_BASSA:JOY_ALTA):0; }

/* Zona morta e risposta quadratica. La quadratica non è un vezzo: a metà
   corsa vale un quarto, quindi il primo terzo del pad regola fine come la
   rotella a 1/5, e il fondo corsa va veloce quanto una freccia tenuta
   premuta. Con una risposta lineare la fascia verde si scavalca sempre. */
function joyAsse(v){
  const m=Math.abs(clamp(v,-1,1));
  if(m<=JOY_MORTA)return 0;
  const u=(m-JOY_MORTA)/(1-JOY_MORTA);
  return (v<0?-1:1)*u*u;
}

function joyInput(dt){
  if(!joy.on)return;
  const t=joyAsse(joy.timone.x);
  if(t){
    // stesse corse dei tasti: 1,15 di barra al secondo, 26° di rotta al secondo
    if(game.pilot>=2) game.pilotTgt=norm(game.pilotTgt+26*D2R*dt*t);
    else boat.rudderCmd=clamp(boat.rudderCmd+1.15*dt*t,-1,1);
  }
}

function joyMolla(st){
  st.x=0;st.id=null;
  const pad=st.pad;
  if(!pad)return;
  pad.classList.remove("attivo");
  joyPomo(pad,0);
}
function joyPomo(pad,dx){
  const k=pad.querySelector&&pad.querySelector(".jknob");
  if(k)k.style.transform="translate("+dx.toFixed(1)+"px,0)";
}
/* Dal dito al comando: coordinate del pad, centro 0 e bordo ±1. Il pad del
   timone ha un asse solo — il verticale non governa niente. */
function joyVettore(dx,hx){ return clamp(dx/hx,-1,1); }
function joyPad(pad,st){
  if(!pad)return;
  st.pad=pad;
  const POMO=22;                                   // mezzo pomo: il centro non arriva al bordo
  const leggi=e=>{
    const r=pad.getBoundingClientRect();
    const hx=Math.max(1,r.width/2-POMO);
    st.x=joyVettore(e.clientX-(r.left+r.width/2),hx);
    joyPomo(pad,st.x*hx);
  };
  pad.addEventListener("pointerdown",e=>{
    e.preventDefault();st.id=e.pointerId;
    if(pad.setPointerCapture)pad.setPointerCapture(e.pointerId);
    pad.classList.add("attivo");leggi(e);
  });
  pad.addEventListener("pointermove",e=>{ if(st.id===e.pointerId){e.preventDefault();leggi(e);} });
  const su=e=>{ if(st.id===null||st.id===e.pointerId) joyMolla(st); };
  pad.addEventListener("pointerup",su);
  pad.addEventListener("pointercancel",su);
  pad.addEventListener("lostpointercapture",su);
}

/* ── le manopole delle scotte ──────────────────────────────────────────
   Ognuna è una vista su un campo di `boat`: `leggi`/`scrivi` la scotta,
   `corsa` il suo fine corsa (il fiocco ne ha due, 80° e 90° con lo spi),
   `finestra` e `stato` quelli che gli strumenti disegnano già in basso a
   sinistra, così l'anello racconta la stessa storia della barra. */
const MANO_GIRI=2;                      // giri di manopola per tutta la corsa
const MANO_ARCO=MANO_GIRI*360;          // gradi di dita per l'intera corsa
const MANO_MORTO=13;                    // px: vicino al perno l'angolo è rumore
const MANO_PX=96;                       // lato di ripiego se il DOM non sa dirlo

const manopole=[
  {id:"mranda", cvId:"mrandacv",
   nome:()=>boat.reef?"RANDA "+boat.reef+"ª":"RANDA",
   leggi:()=>boat.trim, scrivi:v=>{boat.trim=v;}, corsa:()=>90*D2R,
   finestra:()=>boat.wM, stato:()=>boat.stM},
  {id:"mfiocco", cvId:"mfioccocv",
   nome:()=>boat.spi?"SPI":"FIOCCO",
   leggi:()=>boat.jib, scrivi:v=>{boat.jib=v;}, corsa:()=>boat.spi?90*D2R:80*D2R,
   finestra:()=>boat.wJ, stato:()=>boat.stJ}
];

/* Gira la manopola di `dg` gradi: in orario si cazza, come sul verricello.
   A vele automatiche non comanda, esattamente come i tasti e le rotelle. */
function manopolaGira(m,dg){
  if(!joy.on||game.auto||!dg)return;
  const corsa=m.corsa();
  m.scrivi(clamp(m.leggi()-dg/MANO_ARCO*corsa,0,corsa));
}
/* Angolo del dito attorno al perno, in gradi orari (sullo schermo la y
   cresce in giù, quindi atan2 gira già nel verso dell'orologio). */
function manoAngolo(dx,dy){ return Math.atan2(dy,dx)*R2D; }
/* Differenza fra due angoli «srotolata»: passando davanti al fondo scala
   il salto di 360° va tolto, se no mezzo grado diventa un giro al
   contrario. Ed è per questo che i giri si possono contare. */
function manoDelta(a,b){ let d=b-a; if(d>180)d-=360; else if(d<-180)d+=360; return d; }

function manopolaMolla(m){
  m.presa=false; m.id=null; m.ang=null;
  if(m.el)m.el.classList.remove("attivo");
}
function manopolaPad(m){
  const el=document.getElementById(m.id);
  m.el=el; m.cv=document.getElementById(m.cvId);
  m.presa=false; m.id=null; m.ang=null;
  if(!el||!el.addEventListener)return;
  const dito=e=>{
    const r=el.getBoundingClientRect();
    return {x:e.clientX-(r.left+r.width/2), y:e.clientY-(r.top+r.height/2)};
  };
  el.addEventListener("pointerdown",e=>{
    e.preventDefault();m.id=e.pointerId;m.presa=true;
    if(el.setPointerCapture)el.setPointerCapture(e.pointerId);
    el.classList.add("attivo");
    const d=dito(e);m.ang=manoAngolo(d.x,d.y);
  });
  el.addEventListener("pointermove",e=>{
    if(m.id!==e.pointerId)return;
    e.preventDefault();
    const d=dito(e), a=manoAngolo(d.x,d.y);
    // il pollice appoggiato sul perno fa angoli a caso: lì non si gira,
    // ma l'angolo si aggiorna lo stesso o uscendo si prende uno scatto
    if(m.ang!==null&&Math.hypot(d.x,d.y)>MANO_MORTO) manopolaGira(m,manoDelta(m.ang,a));
    m.ang=a;
  });
  const su=e=>{ if(m.id===null||m.id===e.pointerId) manopolaMolla(m); };
  el.addEventListener("pointerup",su);
  el.addEventListener("pointercancel",su);
  el.addEventListener("lostpointercapture",su);
}

/* L'anello esterno è la corsa intera della scotta srotolata su 270°, con
   le stesse fasce della barra degli strumenti: da tutta cazzata (in basso
   a sinistra) a tutta lascata (in basso a destra). Il corpo della manopola
   invece gira per davvero, due giri pieni, ed è quello che dà il dosaggio
   fine. Si ridisegna solo quando qualcosa è cambiato: sono due canvas in
   più per fotogramma. */
const MANO_A0=135, MANO_ARC=270;
function manopolaDisegna(m){
  const el=m.cv; if(!el||!el.getContext)return;
  const lato=Math.round(el.clientWidth||MANO_PX);
  if(lato<10)return;
  const v=m.leggi(), corsa=m.corsa(), W=m.finestra(), st=m.stato();
  const u=corsa>0?clamp(v/corsa,0,1):0;
  const spenta=st==="avvolto"||st==="collo"||st==="sventato";
  const firma=[lato,DPR,m.nome(),u.toFixed(5),st,game.auto?1:0,m.presa?1:0,
               W?(W.lo+","+W.hi+","+W.opt+","+W.maxT):""].join("|");
  if(firma===m.firma)return;
  m.firma=firma;
  if(el.width!==Math.round(lato*DPR)){
    el.width=Math.round(lato*DPR);el.height=Math.round(lato*DPR);
    el.style.width=lato+"px";el.style.height=lato+"px";
  }
  const g=el.getContext("2d");
  g.setTransform(DPR,0,0,DPR,0,0);
  g.clearRect(0,0,lato,lato);
  const cx=lato/2, cy=lato/2, R=lato/2-1;
  const A=q=>(MANO_A0+MANO_ARC*clamp(q,0,1))*D2R;
  const arco=(r,q0,q1,col,sp)=>{
    if(q1<=q0)return;
    g.beginPath();g.lineWidth=sp;g.strokeStyle=col;
    g.arc(cx,cy,r,A(q0),A(q1));g.stroke();
  };
  const raggio=(q,r0,r1,col,sp)=>{
    const a=A(q), c=Math.cos(a), s=Math.sin(a);
    g.beginPath();g.lineWidth=sp;g.strokeStyle=col;
    g.moveTo(cx+c*r0,cy+s*r0);g.lineTo(cx+c*r1,cy+s*r1);g.stroke();
  };

  // le tacche, che sono quello che si guarda mentre si gira
  const rt=R-1;
  for(let i=0;i<=36;i++){
    const grossa=i%6===0;
    raggio(i/36,rt-(grossa?8:5),rt,
           grossa?"rgba(243,234,212,.45)":"rgba(243,234,212,.22)",grossa?1.6:1);
  }
  // le fasce: troppo cazzata, finestra buona, troppo lascata
  const ra=R-12;
  if(W&&!spenta){
    const q=x=>W.maxT>0?clamp(x/W.maxT,0,1):0;
    arco(ra,0,q(W.lo),"rgba(226,102,45,.26)",5);
    arco(ra,q(W.lo),q(W.hi),"rgba(127,196,122,.45)",5);
    arco(ra,q(W.hi),1,"rgba(232,177,61,.28)",5);
    raggio(q(W.opt),ra-3,ra+3,"rgba(127,196,122,.95)",1.4);
  }else{
    arco(ra,0,1,"rgba(243,234,212,.09)",5);
  }
  // dove sta la scotta adesso
  raggio(u,ra-6,ra+6,spenta?"rgba(243,234,212,.35)":C("--chart"),2.6);

  // il corpo, che gira due giri interi da tutta cazzata a tutta lascata
  const ri=R*0.56;
  const gr=g.createRadialGradient(cx-ri*0.4,cy-ri*0.5,ri*0.1,cx,cy,ri);
  gr.addColorStop(0,"rgba(30,74,97,.98)");
  gr.addColorStop(1,"rgba(8,32,46,.98)");
  g.beginPath();g.fillStyle=gr;g.arc(cx,cy,ri,0,TAU);g.fill();
  g.beginPath();g.lineWidth=1;
  g.strokeStyle=m.presa?C("--accent"):"rgba(243,234,212,.30)";
  g.arc(cx,cy,ri,0,TAU);g.stroke();
  const fi=(-90-MANO_ARCO*u)*D2R;                     // cazzando gira in orario
  g.beginPath();
  g.fillStyle=game.auto?C("--accent"):(spenta?"rgba(243,234,212,.35)":C("--chart"));
  g.arc(cx+Math.cos(fi)*ri*0.6,cy+Math.sin(fi)*ri*0.6,ri*0.17,0,TAU);g.fill();

  // gradi al centro, nome nello spicchio libero in basso
  g.textAlign="center";g.textBaseline="middle";
  g.fillStyle=spenta?"rgba(243,234,212,.4)":C("--chart");
  g.font=Math.round(lato*0.15)+"px ui-monospace,monospace";
  g.fillText(Math.round(v*R2D)+"°",cx,cy+ri*0.02);
  g.font="8px ui-monospace,monospace";
  g.fillStyle=game.auto?C("--accent"):C("--chart-dim");
  g.fillText(game.auto?"AUTO":m.nome(),cx,cy+R*0.82);
}

const joyEl=document.getElementById("joy"), padsEl=document.getElementById("jpads");
joyPad(document.getElementById("jtimone"),joy.timone);
manopole.forEach(manopolaPad);
// la pulsantiera manda gli stessi comandi della tastiera: sul telefono è
// l'unico modo di dare C, Z, T e compagnia
document.querySelectorAll("#jaz button").forEach(b=>{
  b.addEventListener("click",e=>{e.preventDefault();b.blur&&b.blur();comando(b.dataset.k);});
});

// finestra che perde il fuoco: come per i tasti, niente resta premuto
addEventListener("blur",()=>{joyMolla(joy.timone);manopole.forEach(manopolaMolla);});

function joyAttiva(on){
  joy.on=!!on;
  if(joy.on)document.body.classList.add("joy");
  else document.body.classList.remove("joy");
  joyMolla(joy.timone);manopole.forEach(manopolaMolla);
}
/* Coi pannelli aperti — giornale, aiuto, conferma — il ciclo è fermo e i
   comandi non comanderebbero niente: meglio toglierli di mezzo che
   lasciarli lì a raccogliere dita. La carta è il caso a parte: i pad non
   servono, ma la pulsantiera sì, perché è l'unico modo di richiudere la
   carta su un telefono — non c'è nessun tasto C da premere.
   Si guarda una volta per fotogramma e si scrive nel DOM solo quando
   cambia davvero. */
let joyVisto=null, padVisti=null;
function joyVista(){
  const v=joy.on&&!helpEl.classList.contains("on")
          &&!logEl.classList.contains("on")&&!askEl.classList.contains("on");
  const pad=v&&!chart.on;
  if(v!==joyVisto){
    joyVisto=v;
    if(joyEl)joyEl.style.display=v?"":"none";
  }
  if(pad!==padVisti){
    padVisti=pad;
    if(!pad){joyMolla(joy.timone);manopole.forEach(manopolaMolla);}
    if(padsEl)padsEl.style.display=pad?"":"none";
  }
  if(pad)manopole.forEach(manopolaDisegna);
}

// di serie accesi dove non c'è una tastiera; altrove si accendono dal menù
const seTocco=(typeof window!=="undefined"&&"ontouchstart" in window)
            ||(typeof matchMedia==="function"&&matchMedia("(pointer:coarse)").matches);
const joyChk=document.getElementById("joyon");
if(joyChk){
  joyChk.checked=seTocco;
  joyChk.onchange=e=>{
    joyAttiva(e.target.checked);e.target.blur();
    say(joy.on?"Comandi a dito accesi — timone a sinistra, manopole delle scotte a destra"
              :"Comandi a dito spenti");
  };
}
joyAttiva(seTocco);

/* ══════════════════ disegno ══════════════════ */
const cv=document.getElementById("cv"), ctx=cv.getContext("2d");
/* Sulla carta il tasto sinistro fa due cose che vanno distinte a mano: se
   trascini sposti la carta, se lasci dov'eri segni un punto di rotta. Il
   confine è 5 px, perché un click non è mai perfettamente fermo. */
let cliccoCarta=null;
/* Pizzico a due dita: sulla carta è l'unico modo di ingrandire senza
   rotella, e senza di lui il telefono resta bloccato all'inquadratura che
   trova. Finché ci sono due dita giù non si trascina con una sola e non si
   segna niente: il punto di rotta lo segnerebbe il dito che si alza per
   primo, dove capita. Le funzioni sono chiamate dagli ascoltatori ma
   restano richiamabili a mano, come `rotella(e)`, perché la harness non
   recapita eventi. */
const tocchi=new Map();
let pizzico=null;
function pizzicoMisura(){
  const d=[...tocchi.values()];
  return {d:Math.hypot(d[0].x-d[1].x,d[0].y-d[1].y),
          cx:(d[0].x+d[1].x)/2, cy:(d[0].y+d[1].y)/2};
}
function pizzicoMuovi(){
  if(tocchi.size<2)return;
  const s=pizzicoMisura();
  if(!pizzico){pizzico=s;return;}
  // il punto di mezzo trascina la carta...
  chart.x-=(s.cx-pizzico.cx)/chart.z;
  chart.y-=(s.cy-pizzico.cy)/chart.z;
  // ...e la distanza fra le dita la ingrandisce, tenendo fermo quel punto
  const p=c2w(s.cx,s.cy);
  chart.z=clamp(chart.z*(s.d/Math.max(1,pizzico.d)),Math.min(VW,VH)*0.30/world.size,0.9);
  const q=c2w(s.cx,s.cy);
  chart.x+=p.x-q.x;chart.y+=p.y-q.y;
  pizzico=s;
}
function cartaGiu(e){
  if(!chart.on)return;
  tocchi.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
  if(tocchi.size>=2){ pizzico=null;chart.drag=null;cliccoCarta=null;return; }
  chart.drag={x:e.offsetX,y:e.offsetY,cx:chart.x,cy:chart.y};
  cliccoCarta=e.button===0?{x:e.offsetX,y:e.offsetY}:null;
}
function cartaMuovi(e){
  if(!chart.on)return;
  chart.mx=e.offsetX;chart.my=e.offsetY;
  if(tocchi.has(e.pointerId))tocchi.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
  if(tocchi.size>=2){pizzicoMuovi();return;}
  if(chart.drag){chart.x=chart.drag.cx-(e.offsetX-chart.drag.x)/chart.z;
                 chart.y=chart.drag.cy-(e.offsetY-chart.drag.y)/chart.z;}
}
function cartaSu(e){
  const eraPizzico=tocchi.size>=2;
  tocchi.delete(e.pointerId);
  if(tocchi.size<2)pizzico=null;
  if(!eraPizzico&&chart.on&&cliccoCarta
     &&Math.hypot(e.offsetX-cliccoCarta.x,e.offsetY-cliccoCarta.y)<5){
    const p=c2w(e.offsetX,e.offsetY);pianoClick(p.x,p.y);
  }
  cliccoCarta=null;chart.drag=null;
}
cv.addEventListener("pointerdown",e=>{ cartaGiu(e); if(chart.on)cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove",cartaMuovi);
cv.addEventListener("pointerup",cartaSu);
cv.addEventListener("pointercancel",cartaSu);
cv.addEventListener("pointerleave",e=>{tocchi.delete(e.pointerId);if(tocchi.size<2)pizzico=null;
  chart.drag=null;cliccoCarta=null;chart.mx=0;});
let VW=0,VH=0,DPR=1;
function resize(){
  DPR=Math.min(devicePixelRatio||1,2);
  VW=innerWidth;VH=innerHeight;
  cv.width=VW*DPR;cv.height=VH*DPR;cv.style.width=VW+"px";cv.style.height=VH+"px";
}
addEventListener("resize",resize);resize();

const CSS=getComputedStyle(document.documentElement);
const C=n=>CSS.getPropertyValue(n).trim();

let cam={x:0,y:0};
function draw(){
  if(chart.on){drawChart();return;}
  const z=game.zoom;
  cam.x=lerp(cam.x,boat.x+boat.vx*8,0.12);
  cam.y=lerp(cam.y,boat.y+boat.vy*8,0.12);

  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle=C("--sea");ctx.fillRect(0,0,VW,VH);

  ctx.save();
  ctx.translate(VW/2,VH/2);ctx.scale(z,z);ctx.translate(-cam.x,-cam.y);
  const hw=VW/2/z, hh=VH/2/z;
  const view={x0:cam.x-hw,x1:cam.x+hw,y0:cam.y-hh,y1:cam.y+hh};

  drawWater(view,z);
  drawGusts(z);
  drawStreaks(z);
  for(const is of world.islands) drawIsland(is,view,z);
  drawMarks(z);
  drawPiano(z);
  drawGhost();
  drawWake();
  drawBoat();
  ctx.restore();

  drawHUD();
  tutHighlight();
}

function drawWater(v,z){
  // trama d'onda deterministica per tessere
  const T=90;
  ctx.strokeStyle="rgba(255,255,255,.075)";ctx.lineWidth=1.4/z;
  ctx.beginPath();
  const wv=dv(windDirBase+Math.PI+Math.PI/2);
  for(let tx=Math.floor(v.x0/T);tx<=Math.floor(v.x1/T);tx++)
    for(let ty=Math.floor(v.y0/T);ty<=Math.floor(v.y1/T);ty++){
      let h=(Math.imul(tx,374761393)^Math.imul(ty,668265263))>>>0;
      for(let k=0;k<2;k++){
        h=Math.imul(h^h>>>13,1274126177)>>>0;
        const px=tx*T+(h%1000)/1000*T, py=ty*T+((h>>>10)%1000)/1000*T;
        const len=9+((h>>>20)%100)/100*13;
        const ph=Math.sin(game.t*1.6+px*0.05+py*0.03)*0.25;
        ctx.moveTo(px-wv.x*len*(1+ph),py-wv.y*len*(1+ph));
        ctx.lineTo(px+wv.x*len,py+wv.y*len);
      }
    }
  ctx.stroke();
}
function drawGusts(z){
  for(const g of gusts){
    const gr=ctx.createRadialGradient(g.x,g.y,g.r*0.25,g.x,g.y,g.r);
    gr.addColorStop(0,"rgba(4,26,40,.42)");gr.addColorStop(1,"rgba(4,26,40,0)");
    ctx.fillStyle=gr;ctx.beginPath();ctx.arc(g.x,g.y,g.r,0,TAU);ctx.fill();
  }
}
function drawStreaks(z){
  ctx.lineCap="round";
  for(let b=0;b<3;b++){
    const base=(0.175+b*0.115)*(0.72+windBase/16*0.56)*streakVis;  // fascia = raffica, scala = vento assoluto
    for(let seg=0;seg<SEG;seg++){
      let any=false;
      ctx.beginPath();
      for(const s of streaks){
        if(s.b!==b)continue;
        any=true;
        const t0=(seg+s.ph*0.12)/SEG, t1=t0+0.66/SEG;
        ctx.moveTo(s.x+s.dx*s.len*t0,s.y+s.dy*s.len*t0);
        ctx.lineTo(s.x+s.dx*s.len*t1,s.y+s.dy*s.len*t1);
      }
      if(!any)continue;
      ctx.strokeStyle="rgba(246,240,224,"+(base*(0.34+0.66*seg/(SEG-1))).toFixed(3)+")";
      ctx.lineWidth=(1.15+b*0.75)/z;               // il vento forte "pesa" di più
      ctx.stroke();
    }
    // punta chiara in testa: toglie l'ambiguità sul verso
    ctx.beginPath();let any2=false;
    for(const s of streaks){
      if(s.b!==b)continue;any2=true;
      ctx.moveTo(s.x+s.dx*s.len,s.y+s.dy*s.len);
      ctx.arc(s.x+s.dx*s.len,s.y+s.dy*s.len,(1.25+b*0.55)/z,0,TAU);
    }
    if(any2){ctx.fillStyle="rgba(250,246,234,"+Math.min(0.95,base*1.7).toFixed(3)+")";ctx.fill();}
  }
  ctx.lineCap="butt";
}
function islandPath(is){
  const p=is.p;
  ctx.beginPath();ctx.moveTo(p[0],p[1]);
  for(let i=2;i<p.length;i+=2) ctx.lineTo(p[i],p[i+1]);
  ctx.closePath();
}
function drawIsland(is,v,z){
  if(is.x1+is.hw*3<v.x0||is.x0-is.hw*3>v.x1||is.y1+is.hw*3<v.y0||is.y0-is.hw*3>v.y1)return;
  const w=is.hw;
  ctx.lineJoin="round";ctx.lineCap="round";
  islandPath(is);
  ctx.strokeStyle="rgba(61,146,171,.28)";ctx.lineWidth=w*4.4;ctx.stroke();   // secca esterna
  ctx.strokeStyle="rgba(61,146,171,.42)";ctx.lineWidth=w*1.9;ctx.stroke();   // bassofondo
  ctx.fillStyle=C("--land");ctx.fill();
  ctx.save();ctx.clip();
  ctx.strokeStyle=C("--sand");ctx.lineWidth=w*1.5;ctx.stroke();              // spiaggia, solo dentro
  ctx.restore();
  ctx.strokeStyle="rgba(10,36,51,.45)";ctx.lineWidth=2/z;ctx.stroke();
  if(is.n && is.l){                                                           // toponimo
    ctx.fillStyle="rgba(24,54,42,.55)";
    ctx.font=clamp(Math.min(is.x1-is.x0,is.y1-is.y0)*0.09*z,10,22)/z+"px ui-monospace,monospace";
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(is.n.toUpperCase(),is.l[0],is.l[1]);
    ctx.textBaseline="alphabetic";
  }
}
function drawMarks(z){
  world.marks.forEach((m,i)=>{
    const done=i<game.next, nxt=i===game.next;
    ctx.strokeStyle=nxt?"rgba(226,102,45,.55)":"rgba(243,234,212,.18)";
    ctx.lineWidth=2/z;
    ctx.beginPath();ctx.arc(m.x,m.y,MARK_R,0,TAU);ctx.stroke();
    if(nxt){
      const p=1+Math.sin(game.t*3)*0.12;
      ctx.strokeStyle="rgba(226,102,45,.3)";ctx.beginPath();ctx.arc(m.x,m.y,MARK_R*1.5*p,0,TAU);ctx.stroke();
    }
    ctx.fillStyle=done?"rgba(127,196,122,.85)":C("--accent");
    ctx.beginPath();ctx.arc(m.x,m.y,7,0,TAU);ctx.fill();
    ctx.fillRect(m.x-1,m.y-22,2,22);
    ctx.beginPath();ctx.moveTo(m.x+1,m.y-22);ctx.lineTo(m.x+13,m.y-17);ctx.lineTo(m.x+1,m.y-12);ctx.fill();
    ctx.fillStyle="rgba(243,234,212,.9)";ctx.font=(11/z*3).toFixed(1)+"px ui-monospace,monospace";
    ctx.textAlign="center";ctx.fillText(String(i+1),m.x,m.y+26);
  });
}
function drawGhost(){
  if(!voy||!voy.ghost)return;
  const tr=voy.ghost.track;
  ctx.strokeStyle="rgba(243,234,212,.16)";ctx.lineWidth=1.6/game.zoom;ctx.setLineDash([6/game.zoom,6/game.zoom]);
  ctx.beginPath();ctx.moveTo(tr[0][0],tr[0][1]);
  for(let i=1;i<tr.length;i++)ctx.lineTo(tr[i][0],tr[i][1]);
  ctx.stroke();ctx.setLineDash([]);
  if(!voy.moving)return;
  let a=tr[0],b=tr[tr.length-1];
  for(let i=1;i<tr.length;i++){ if(tr[i][2]>=voy.t){a=tr[i-1];b=tr[i];break;} }
  const f=(b[2]-a[2])>0?clamp((voy.t-a[2])/(b[2]-a[2]),0,1):0;
  const gx=lerp(a[0],b[0],f), gy=lerp(a[1],b[1],f);
  const ang=Math.atan2(b[0]-a[0],-(b[1]-a[1]));
  ctx.save();ctx.translate(gx,gy);ctx.rotate(ang);
  ctx.fillStyle="rgba(243,234,212,.30)";ctx.strokeStyle="rgba(243,234,212,.5)";ctx.lineWidth=0.4;
  const L=K.LOA;
  ctx.beginPath();ctx.moveTo(0,-L*0.55);ctx.lineTo(L*0.17,L*0.45);ctx.lineTo(-L*0.17,L*0.45);ctx.closePath();
  ctx.fill();ctx.stroke();ctx.restore();
}
function drawWake(){
  if(boat.wake.length<3)return;
  ctx.lineCap="round";
  for(let i=1;i<boat.wake.length;i++){
    const a=(1-i/boat.wake.length);
    ctx.strokeStyle="rgba(255,255,255,"+(a*0.16*clamp(boat.wake[i].s/3,0,1)).toFixed(3)+")";
    ctx.lineWidth=1+a*3.4;
    ctx.beginPath();ctx.moveTo(boat.wake[i-1].x,boat.wake[i-1].y);ctx.lineTo(boat.wake[i].x,boat.wake[i].y);ctx.stroke();
  }
  ctx.lineCap="butt";
}
function drawBoat(){
  const L=K.LOA, B=L*0.32;
  ctx.save();
  ctx.translate(boat.x,boat.y);ctx.rotate(boat.h);
  const hs=1-Math.abs(boat.heel)*0.28;                 // sbandamento visto dall'alto
  ctx.save();ctx.scale(hs,1);ctx.translate(boat.heel*B*0.5,0);

  // scafo
  ctx.beginPath();
  ctx.moveTo(0,-L*0.55);
  ctx.bezierCurveTo(B*0.62,-L*0.24, B*0.5,L*0.22, B*0.38,L*0.45);
  ctx.lineTo(-B*0.38,L*0.45);
  ctx.bezierCurveTo(-B*0.5,L*0.22,-B*0.62,-L*0.24,0,-L*0.55);
  ctx.closePath();
  ctx.fillStyle="#f4efe2";ctx.fill();
  ctx.strokeStyle="rgba(10,36,51,.55)";ctx.lineWidth=0.35;ctx.stroke();
  // pozzetto
  ctx.fillStyle="#c9b98f";
  ctx.beginPath();ctx.ellipse(0,L*0.22,B*0.24,L*0.16,0,0,TAU);ctx.fill();
  ctx.restore();

  // randa (albero a -0.12L)
  // ── vele: stessa costruzione per randa e fiocco  // ── vele: stessa costruzione per randa e fiocco
  // Il colore della vela dice la regolazione: ambra = fileggia, bianco-verde =
  // ottima, arancio = in stallo, azzurro = a collo (messa lì apposta).
  const SAILCOL={
    collo:   ["rgba(150,196,224,.88)","rgba(96,168,214,1)"],
    lasca:   ["rgba(240,226,190,.62)","rgba(232,177,61,.85)"],
    fileggia:["rgba(232,199,116,.42)","rgba(232,177,61,.95)"],
    stretta: ["rgba(232,199,116,.42)","rgba(232,177,61,.95)"],
    ottima:  ["rgba(238,252,236,.96)","rgba(127,196,122,1)"],
    aperta:  ["rgba(238,252,236,.96)","rgba(127,196,122,1)"],   // in poppa è giusto così
    cazzata: ["rgba(243,238,225,.92)","rgba(196,192,176,.9)"],
    stallo:  ["rgba(226,150,110,.94)","rgba(226,102,45,1)"],
    sventato:["rgba(240,226,190,.45)","rgba(232,177,61,.70)"]   // solo spinnaker
  };
  const trimColor=st=>SAILCOL[st]||SAILCOL.cazzata;
  function sail(ox,oy,ang,len,side,luff,st){
    const col=trimColor(st);
    const d=dv(ang), cx=ox+d.x*len, cy=oy+d.y*len;
    const camber=(1-luff)*0.22+0.05;
    const bulge=dv(ang+side*Math.PI/2);
    const mx=(ox+cx)/2+bulge.x*len*camber, myy=(oy+cy)/2+bulge.y*len*camber;
    ctx.fillStyle=col[0];
    ctx.beginPath();ctx.moveTo(ox,oy);
    if(luff>0.5){                                    // fileggia: il bordo sbatte
      const f=Math.sin(game.t*22+len)*0.16*luff;
      ctx.quadraticCurveTo(mx+f*len,myy+f*len*0.3,cx,cy);
      ctx.quadraticCurveTo(mx-f*len,myy-f*len*0.3,ox,oy);
    }else{
      ctx.quadraticCurveTo(mx,myy,cx,cy);ctx.lineTo(ox,oy);
    }
    ctx.closePath();ctx.fill();
    ctx.strokeStyle=col[1];ctx.lineWidth=0.42;ctx.stroke();   // bordo colorato = spia
    ctx.strokeStyle="rgba(10,36,51,.75)";ctx.lineWidth=0.42;  // boma / punta di scotta
    ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(cx,cy);ctx.stroke();

    // filetti segnavento: sottovento verde, sopravvento rosso.
    // Dritti indietro = flusso attaccato. Sollevati = fileggia. Che vorticano = stallo.
    const bx0=ox+d.x*len*0.42, by0=oy+d.y*len*0.42;
    const per=dv(ang+side*Math.PI/2), tl=len*0.15;
    const jit=Math.sin(game.t*16+len*3);
    for(const lee of [1,-1]){
      let dir=ang+jit*0.05;
      if(luff>0.5 && lee<0) dir=ang+side*(1.55+jit*0.45);       // sopravvento si alza
      else if(st==="stallo" && lee>0) dir=ang-side*(1.9+jit*0.55); // sottovento vortica
      const dd=dv(dir);
      const px=bx0+per.x*0.5*lee, py=by0+per.y*0.5*lee;
      ctx.strokeStyle=lee>0?"rgba(110,224,110,.95)":"rgba(238,88,70,.95)";
      ctx.lineWidth=0.3;
      ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+dd.x*tl,py+dd.y*tl);ctx.stroke();
    }
  }
  const my=-L*0.12;
  if(boat.spi){                                      // spinnaker: grande, tondo, colorato
    const ang=boat.jibDraw, side=boat.boomSide, len=L*0.52;
    const d=dv(ang), cx=d.x*len, cy=-L*0.55+d.y*len;
    const bulge=dv(ang+side*Math.PI/2);
    const f=boat.spiLimp?Math.sin(game.t*14)*0.12:0;
    const c1=(-L*0.55+cy)/2+bulge.x*len*(0.42+f), c2=0;
    // Il corpo resta arancione — è l'identità dello spi — ma il bordo fa da
    // spia della regolazione come sulle altre vele: prima era un filo scuro
    // fisso, e lo spinnaker era l'unica vela il cui colore non diceva niente.
    const molle=boat.stJ==="sventato"||boat.stJ==="fileggia";
    ctx.fillStyle=molle?"rgba(226,140,90,.45)":"rgba(230,126,60,.88)";
    ctx.strokeStyle=trimColor(boat.stJ)[1];ctx.lineWidth=0.55;
    ctx.beginPath();ctx.moveTo(0,-L*0.55);
    ctx.quadraticCurveTo(cx/2+bulge.x*len*(0.55+f),(-L*0.55+cy)/2+bulge.y*len*(0.55+f),cx,cy);
    ctx.quadraticCurveTo(cx/2+bulge.x*len*(0.16+f),(-L*0.55+cy)/2+bulge.y*len*(0.16+f),0,-L*0.55);
    ctx.closePath();ctx.fill();ctx.stroke();
  }else if(boat.jibFurled){                          // fiocco avvolto sullo strallo
    ctx.strokeStyle="rgba(214,205,182,.95)";ctx.lineWidth=1.1;
    ctx.beginPath();ctx.moveTo(0,-L*0.55);ctx.lineTo(0,-L*0.40);ctx.stroke();
  }else{
    sail(0,-L*0.55,boat.jibDraw,L*0.40,boat.jibSide,boat.luffJ,boat.stJ);
  }
  sail(0,my,boat.boomDraw,L*0.44*(0.72+0.28*K.REEF[boat.reef]),boat.boomSide,boat.luff,boat.stM);
  ctx.fillStyle="#3a3a33";ctx.beginPath();ctx.arc(0,my,0.55,0,TAU);ctx.fill();
  // timone: barra a dritta -> la pala devia a dritta, la poppa va a sinistra,
  // la prua accosta a dritta. Prima era disegnata al contrario.
  const rd=dv(Math.PI-boat.rudder*0.55);
  ctx.strokeStyle="rgba(10,36,51,.7)";ctx.lineWidth=0.5;
  ctx.beginPath();ctx.moveTo(0,L*0.45);ctx.lineTo(rd.x*L*0.16,L*0.45+rd.y*L*0.16);ctx.stroke();
  ctx.restore();
}

/* ══════════════════ strumenti ══════════════════ */
function pointOfSail(twa){
  const a=Math.abs(twa*R2D);
  if(a<32)return"NEL VENTO";
  if(a<52)return"BOLINA STRETTA";
  if(a<72)return"BOLINA LARGA";
  if(a<105)return"TRAVERSO";
  if(a<140)return"LASCO";
  if(a<168)return"GRAN LASCO";
  return"POPPA";
}
function panel(x,y,w,h){
  ctx.fillStyle="rgba(8,32,46,.80)";ctx.fillRect(x,y,w,h);
  ctx.strokeStyle="rgba(243,234,212,.22)";ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);
}
function label(t,x,y){ctx.fillStyle=C("--chart-dim");ctx.font="10px ui-monospace,monospace";
  ctx.textAlign="left";ctx.fillText(t,x,y);}
function value(t,x,y,col,size){ctx.fillStyle=col||C("--chart");
  ctx.font=(size||16)+"px ui-monospace,monospace";ctx.textAlign="left";ctx.fillText(t,x,y);}

/* ── impaginazione degli strumenti ──
   Gli strumenti sono disegnati a coordinate fisse, pensate per la finestra
   di un computer. Su un telefono in verticale quelle stesse coordinate si
   accavallano: la rosa dei venti finisce sopra il pannello della velocità,
   la carta ridotta sotto le scotte, e i pulsanti di comando sopra tutto.

   Invece di ritoccare cento coordinate si stringe il contesto e si finge
   una finestra più larga: `hudScala()` è il fattore, e dentro `drawHUD()`
   VW e VH sono da lì in poi quelle FINTE. Chi disegna in coordinate di
   schermo vere dentro quella scala — la freccia della boa fuori campo —
   deve dividere per la scala, ed è l'unico posto dove serve ricordarsene.

   Il minimo di 0,72 non è arbitrario: sotto quella soglia le scritte da
   10 px diventano illeggibili, quindi da lì in giù non si stringe più ma
   si toglie roba — rosa più piccola e carta ridotta via, che a quelle
   larghezze non ci sta comunque. */
function hudScala(){ return clamp(Math.min(VW/760,VH/560),0.72,1); }
/* La soglia di «schermo stretto» è in pixel VERI e non finti perché la
   divide con il foglio di stile: sotto i 640 px il menù diventa una fascia
   e il pulsante ☰ passa in alto a destra, dove la rosa deve fargli posto.
   Se cambia qui, cambia la @media di index.html. La usa anche la carta
   nautica, che di suo non passa da hudBox(). */
function schermoStretto(){ return VW<640; }
function hudBox(){
  const hs=hudScala();
  const W=VW/hs, H=VH/hs;               // schermo in unità degli strumenti
  const stretto=schermoStretto();
  const rosa=stretto?56:76;
  const bh=178, bw=stretto?clamp(W-28,306,470):306;
  const fondo=H-joyInset()/hs;          // sopra i joystick, dove le dita non arrivano
  const ry=rosa+26+(stretto?42:0);      // la rosa scende sotto il pulsante ☰
  // la carta ridotta si disegna solo se ci sta davvero: nella colonna di
  // destra deve entrare tutta sotto la scritta del vento apparente, e col
  // telefono per il lungo quello spazio non c'è
  const cartina=!stretto && fondo-(ry+rosa+40) > 196;
  return {hs,W,H,fondo,stretto,
          rosa,rx:W-(rosa+26),ry,
          bx:14,by:fondo-bh-14,bw,bh,              // scotte, bilanciamento e timone
          cartina};
}

function drawHUD(){
  const box=hudBox();
  ctx.save();ctx.scale(box.hs,box.hs);
  const VW=box.W, VH=box.H;             // finestra finta: vedi hudBox()
  const w=windAt(boat.x,boat.y);
  const sp=Math.hypot(boat.vx,boat.vy), kn=sp*1.94384;
  const twa=norm(norm(w.from)-boat.h);
  const hdg=(norm(boat.h)*R2D+360)%360;

  /* ── strumenti, in alto a sinistra */
  const px=14,py=14,pw=196,ph=126;
  panel(px,py,pw,ph);
  label("VELOCITÀ",px+12,py+20);
  value(kn.toFixed(1),px+12,py+46,C("--chart"),26);
  label("kn",px+12+ctx.measureText(kn.toFixed(1)).width+6,py+46);
  label("ROTTA",px+112,py+20);
  value(String(Math.round(hdg)).padStart(3,"0")+"°",px+112,py+44,C("--chart"),18);
  ctx.fillStyle="rgba(243,234,212,.15)";ctx.fillRect(px+12,py+58,pw-24,1);
  label("VENTO REALE",px+12,py+76);
  if(w.spd>windBase*1.10||w.spd<windBase*0.72){
    const om=w.spd<windBase*0.72;
    ctx.fillStyle=om?C("--warn"):C("--accent");ctx.font="10px ui-monospace,monospace";
    ctx.textAlign="right";ctx.fillText(om?"IN OMBRA":"RAFFICA",px+pw-12,py+76);ctx.textAlign="left";}
  value(String(Math.round((w.from*R2D+360)%360)).padStart(3,"0")+"°  "+(w.spd*1.94384).toFixed(0)+" kn",px+12,py+94,C("--chart"),13);
  label("ANDATURA",px+12,py+112);
  ctx.fillStyle=Math.abs(twa*R2D)<32?C("--warn"):C("--good");
  ctx.font="12px ui-monospace,monospace";ctx.textAlign="right";
  ctx.fillText(pointOfSail(twa),px+pw-12,py+112);

  /* ── rosa dei venti, in alto a destra */
  const cxr=box.rx, cyr=box.ry, R=box.rosa;
  ctx.save();ctx.translate(cxr,cyr);
  // rk: la rosa dei venti si rimpicciolisce tutta insieme sugli schermi
  // stretti — tacche, freccia e barchetta in proporzione al raggio
  const rk=R/76;
  ctx.fillStyle="rgba(8,32,46,.80)";ctx.beginPath();ctx.arc(0,0,R+14*rk,0,TAU);ctx.fill();
  ctx.strokeStyle="rgba(243,234,212,.22)";ctx.lineWidth=1;ctx.stroke();
  // corona graduata orientata a prua
  ctx.save();ctx.rotate(-boat.h);
  for(let a=0;a<360;a+=10){
    const p=dv(a*D2R), big=a%90===0;
    ctx.strokeStyle=big?"rgba(243,234,212,.75)":"rgba(243,234,212,.3)";
    ctx.lineWidth=big?1.6:1;
    ctx.beginPath();ctx.moveTo(p.x*R,p.y*R);ctx.lineTo(p.x*(R-(big?11:6)*rk),p.y*(R-(big?11:6)*rk));ctx.stroke();
  }
  ctx.fillStyle="rgba(243,234,212,.8)";ctx.font=(rk<1?9:10)+"px ui-monospace,monospace";
  ctx.textAlign="center";ctx.textBaseline="middle";
  ["N","E","S","W"].forEach((s,i)=>{const p=dv(i*90*D2R);ctx.fillText(s,p.x*(R-22*rk),p.y*(R-22*rk));});
  // freccia vento reale (da dove viene)
  const wp=dv(w.from);
  ctx.strokeStyle=C("--accent");ctx.lineWidth=2.5*rk;
  ctx.beginPath();ctx.moveTo(wp.x*(R-2),wp.y*(R-2));ctx.lineTo(wp.x*22*rk,wp.y*22*rk);ctx.stroke();
  ctx.fillStyle=C("--accent");
  const wn=dv(w.from+Math.PI/2);
  ctx.beginPath();ctx.moveTo(wp.x*20*rk,wp.y*20*rk);
  ctx.lineTo(wp.x*34*rk+wn.x*7*rk,wp.y*34*rk+wn.y*7*rk);
  ctx.lineTo(wp.x*34*rk-wn.x*7*rk,wp.y*34*rk-wn.y*7*rk);ctx.closePath();ctx.fill();
  // settore proibito
  ctx.fillStyle="rgba(232,177,61,.12)";
  ctx.beginPath();ctx.moveTo(0,0);
  ctx.arc(0,0,R,w.from-Math.PI/2-35*D2R,w.from-Math.PI/2+35*D2R);ctx.closePath();ctx.fill();
  ctx.restore();
  // vento apparente (relativo alla prua, quindi fuori dalla rotazione)
  const ap=dv(norm(boat.beta));
  ctx.strokeStyle="rgba(243,234,212,.55)";ctx.lineWidth=1.4;ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.moveTo(ap.x*(R-6),ap.y*(R-6));ctx.lineTo(0,0);ctx.stroke();ctx.setLineDash([]);
  // barchetta al centro con la vela
  const pr=18*rk, pp=10*rk, pl=6*rk;
  ctx.fillStyle="rgba(243,234,212,.9)";
  ctx.beginPath();ctx.moveTo(0,-pr);ctx.lineTo(pl,pp);ctx.lineTo(-pl,pp);ctx.closePath();ctx.fill();
  const bp=dv(boat.boomDraw), jp=dv(boat.jibDraw);
  ctx.lineWidth=2.5*rk;
  ctx.strokeStyle=boat.luff>0.5?C("--warn"):C("--good");
  ctx.beginPath();ctx.moveTo(0,-4*rk);ctx.lineTo(bp.x*17*rk,-4*rk+bp.y*17*rk);ctx.stroke();
  ctx.lineWidth=1.8*rk;
  ctx.strokeStyle=boat.luffJ>0.5?C("--warn"):C("--good");
  ctx.beginPath();ctx.moveTo(0,-pr);ctx.lineTo(jp.x*13*rk,-pr+jp.y*13*rk);ctx.stroke();
  ctx.textBaseline="alphabetic";
  ctx.restore();
  ctx.fillStyle=C("--chart-dim");ctx.font="9px ui-monospace,monospace";ctx.textAlign="center";
  ctx.fillText("VENTO APP "+Math.round(Math.abs(boat.beta*R2D))+"°"+(boat.beta>0?" DRITTA":" SIN"),cxr,cyr+R+22*rk+8);

  /* ── regolazione / timone / sbandamento, in basso a sinistra */
  const bw=box.bw, bh=box.bh, bx=box.bx, by=box.by;
  panel(bx,by,bw,bh);
  const gw=bw-24, gx=bx+12;
  function sailGauge(name,y,trimRad,W,st,extra){
    label(name,gx,y);
    const TXT={
      collo:   ["A COLLO — LA PRUA CADE","#6ea8d6"],
      avvolto: ["AVVOLTO (F)",C("--chart-dim")],
      sventato:["SVENTATO — POGGIA O AMMAINA",C("--warn")],
      fileggia:["FILEGGIA — CAZZA",C("--warn")],
      stretta: ["PRUA TROPPO AL VENTO — POGGIA",C("--warn")],
      ottima:  ["OTTIMA",C("--good")],
      aperta:  ["TUTTA APERTA — SPINTA MASSIMA",C("--good")],
      cazzata: ["UN PO' CAZZATA — LASCA",C("--chart")],
      lasca:   ["TROPPO LASCATA — CAZZA",C("--warn")],
      stallo:  ["IN STALLO — LASCA",C("--accent")]
    };
    // La regolazione automatica (T) tocca trim e jib da sola: senza un avviso
    // persistente qui, frecce e rotella sembrano rotte perché non cambiano niente.
    const auto=game.auto&&st!=="collo"&&st!=="avvolto"&&st!=="sventato";
    const t=auto?["AUTOMATICA — T TORNA AL MANUALE",C("--accent")]:(TXT[st]||TXT.cazzata);
    ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";
    ctx.fillStyle=t[1];ctx.fillText((extra||"")+t[0],gx+gw,y);ctx.textAlign="left";

    const gy=y+7;
    if(st==="avvolto"||st==="collo"||st==="sventato"){
      ctx.fillStyle="rgba(243,234,212,.07)";ctx.fillRect(gx,gy,gw,11);
      if(st==="collo"){ctx.fillStyle="rgba(110,168,214,.30)";ctx.fillRect(gx,gy,gw,11);}
      return;
    }
    // La barra è la POSIZIONE DELLA SCOTTA, da tutta cazzata (sx) a tutta lascata (dx).
    // La fascia verde è dove dovrebbe stare adesso: basta portarci sopra il segno.
    const lo=W.lo*R2D, hi=W.hi*R2D, maxTdeg=W.maxT*R2D;
    const X=v=>gx+gw*clamp(v,0,maxTdeg)/maxTdeg;
    ctx.fillStyle="rgba(226,102,45,.26)";ctx.fillRect(gx,gy,X(lo)-gx,11);          // troppo cazzata
    ctx.fillStyle="rgba(127,196,122,.40)";ctx.fillRect(X(lo),gy,X(hi)-X(lo),11);   // finestra buona
    ctx.fillStyle="rgba(232,177,61,.28)";ctx.fillRect(X(hi),gy,gx+gw-X(hi),11);    // troppo lascata
    ctx.fillStyle="rgba(127,196,122,.9)";ctx.fillRect(X(W.opt*R2D)-0.5,gy,1,11);   // ottimo
    ctx.fillStyle=C("--chart");ctx.fillRect(X(trimRad*R2D)-1.5,gy-3,3,17);
    ctx.font="9px ui-monospace,monospace";ctx.fillStyle="rgba(243,234,212,.35)";
    ctx.fillText("CAZZATA",gx+2,gy+9.5);
    ctx.textAlign="right";ctx.fillText("LASCATA",gx+gw-2,gy+9.5);ctx.textAlign="left";
  }
  sailGauge(boat.reef?"RANDA · "+boat.reef+"ª MANO":"RANDA",by+18,boat.trim,boat.wM,boat.stM);
  sailGauge(boat.spi?"SPINNAKER":"FIOCCO",by+52,boat.jib,boat.wJ,boat.stJ,boat.butterfly?"A FARFALLA · ":"");

  // bilanciamento: da che parte tira la barca quando molli la barra
  label("BILANCIAMENTO",gx,by+88);
  const bal=boat.balance, sens=Math.abs(boat.yawSail||0)>0.5;   // °/s: sotto è ininfluente
  let btxt,bcol;
  if(!sens){btxt="NEUTRO — TIENE LA ROTTA";bcol=C("--good");}
  else if(bal>0.30){btxt="ORZA — CAZZA IL FIOCCO";bcol=C("--warn");}
  else if(bal<-0.30){btxt="PUGGIA — CAZZA LA RANDA";bcol=C("--warn");}
  else{btxt="NEUTRO — TIENE LA ROTTA";bcol=C("--good");}
  ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";ctx.fillStyle=bcol;
  ctx.fillText(btxt,gx+gw,by+88);ctx.textAlign="left";
  const by2=by+95;
  ctx.fillStyle="rgba(243,234,212,.10)";ctx.fillRect(gx,by2,gw,9);
  ctx.fillStyle="rgba(127,196,122,.30)";ctx.fillRect(gx+gw*0.35,by2,gw*0.30,9);
  ctx.fillStyle=C("--chart");ctx.fillRect(gx+gw/2+bal*gw/2-1.5,by2-3,3,15);
  ctx.font="9px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
  ctx.fillText("FIOCCO",gx,by2+22);ctx.textAlign="right";ctx.fillText("RANDA",gx+gw,by2+22);ctx.textAlign="left";

  // barra: comando (fantasma) e pala reale
  label("TIMONE",gx,by+140);
  const rx=gx+58, rw2=Math.min(104,gw-178);
  ctx.strokeStyle="rgba(243,234,212,.25)";ctx.beginPath();
  ctx.moveTo(rx,by+136);ctx.lineTo(rx+rw2,by+136);ctx.stroke();
  ctx.fillStyle="rgba(243,234,212,.25)";ctx.fillRect(rx+rw2/2-.5,by+132,1,8);
  ctx.fillStyle="rgba(243,234,212,.35)";ctx.fillRect(rx+rw2/2+boat.rudderCmd*rw2/2-1,by+129,2,14);
  ctx.fillStyle=C("--chart");ctx.fillRect(rx+rw2/2+boat.rudder*rw2/2-1.5,by+131,3,10);
  // cavallino: il neutro a cui tornano i comandi, sotto la scala
  if(Math.abs(boat.rudderTrim)>0.005){ctx.fillStyle=C("--accent");
    ctx.fillRect(rx+rw2/2+boat.rudderTrim*rw2/2-1,by+143,2,5);}
  label("SBAND.",gx+gw-120,by+140);
  ctx.fillStyle=Math.abs(boat.heel)>0.7?C("--accent"):C("--chart");
  ctx.font="13px ui-monospace,monospace";ctx.textAlign="right";
  ctx.fillText(Math.round(Math.abs(boat.heel)*32)+"°",gx+gw,by+141);ctx.textAlign="left";

  // col cavallino inserito la riga dice quello: un neutro spostato senza
  // segnale fisso è esattamente l'inganno già corretto per le vele automatiche
  const cavOn=!game.pilot&&Math.abs(boat.rudderTrim)>0.005;
  label(cavOn?"CAVALLINO":(game.pilot===1?"BARRA":"AUTOTIMONIERE"),gx,by+164);
  ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";
  if(cavOn){ctx.fillStyle=C("--accent");
    ctx.fillText(Math.round(Math.abs(boat.rudderTrim)*100)+"% "+(boat.rudderTrim>0?"DRITTA":"SIN")
      +"  ·  MAIUSC+SPAZIO AZZERA",gx+gw,by+164);}
  else if(game.pilot===1){ctx.fillStyle=C("--chart");
    ctx.fillText("RICHIAMO AL CENTRO",gx+gw,by+164);}
  else if(game.pilot===2){ctx.fillStyle=C("--good");
    ctx.fillText("ROTTA "+String(Math.round((game.pilotTgt*R2D+360)%360)).padStart(3,"0")+"°",gx+gw,by+164);}
  else if(game.pilot===3){ctx.fillStyle=C("--good");
    ctx.fillText("VENTO "+Math.round(Math.abs(game.pilotTgt*R2D))+"° "+(game.pilotTgt>0?"DRITTA":"SIN"),gx+gw,by+164);}
  else{ctx.fillStyle=C("--chart-dim");ctx.fillText("SPENTO  ·  Z PER INSERIRE",gx+gw,by+164);}
  ctx.textAlign="left";
  /* ── carta ridotta, in basso a destra — su schermo stretto non ci sta e
     non si disegna: la carta intera è a un tasto (C) o a un pulsante */
  if(box.cartina){
  const ms=168, mx=VW-ms-14, my2=box.fondo-ms-14;
  panel(mx,my2,ms,ms);
  const k=ms/(world.size*1.06), c=world.size*0.53-0;
  ctx.save();ctx.beginPath();ctx.rect(mx,my2,ms,ms);ctx.clip();
  ctx.translate(mx,my2);ctx.scale(k,k);ctx.translate(c,c);
  ctx.fillStyle="rgba(61,146,171,.30)";
  for(const is of world.islands){islandPath(is);ctx.fill();}
  const mr=world.size/120;
  world.marks.forEach((m,i)=>{
    ctx.fillStyle=i<game.next?C("--good"):(i===game.next?C("--accent"):"rgba(243,234,212,.35)");
    ctx.beginPath();ctx.arc(m.x,m.y,mr,0,TAU);ctx.fill();
  });
  if(piano.pts.length){                                 // la rotta pianificata, per intero
    ctx.strokeStyle="rgba(127,196,122,.65)";ctx.lineWidth=1.6/k;
    ctx.beginPath();
    piano.pts.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.stroke();
  }
  ctx.fillStyle=C("--chart");
  ctx.save();ctx.translate(boat.x,boat.y);ctx.rotate(boat.h);
  const bs=world.size/40;
  ctx.beginPath();ctx.moveTo(0,-bs);ctx.lineTo(bs*0.6,bs*0.73);ctx.lineTo(-bs*0.6,bs*0.73);ctx.closePath();ctx.fill();
  ctx.restore();ctx.restore();
  }

  /* ── regata, in alto a destra sotto la rosa */
  const ry=14, tw=176;
  const tp=VW-14-176-232 > 240 ? VW-14-176-232 : px;   // sotto gli strumenti se non c'è spazio
  const ryy=tp===px ? py+ph+10 : ry;
  panel(tp,ryy,tw,64);
  label("REGATA",tp+12,ryy+18);
  ctx.textAlign="left";
  value(game.done?fmtT(game.done):fmtT(game.clock),tp+12,ryy+44,game.done?C("--good"):C("--chart"),20);
  ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");ctx.textAlign="right";
  ctx.fillText(game.done?"COMPLETATA":"BOA "+(game.next+1)+"/"+world.marks.length,tp+tw-12,ryy+44);
  if(!game.done && world.marks[game.next]){
    const m=world.marks[game.next];
    const d=Math.hypot(m.x-boat.x,m.y-boat.y);
    const br=(angOf(m.x-boat.x,m.y-boat.y)*R2D+360)%360;
    ctx.textAlign="left";ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
    ctx.fillText("RILEV "+String(Math.round(br)).padStart(3,"0")+"°   "+(d<1000?Math.round(d)+" m":(d/1000).toFixed(2)+" km"),tp+12,ryy+58);
    // freccia sul bordo se la boa è fuori campo. Qui si mescolano due
    // sistemi: la boa sta in coordinate di schermo VERE, gli strumenti in
    // quelle finte di hudBox(), quindi lo zoom va diviso per la scala.
    const zh=game.zoom/box.hs;
    const sx=VW/2+(m.x-cam.x)*zh, sy=VH/2+(m.y-cam.y)*zh;
    if(sx<40||sx>VW-40||sy<40||sy>VH-40){
      const a=Math.atan2(sy-VH/2,sx-VW/2);
      const ex=VW/2+Math.cos(a)*Math.min(VW/2-46,VH/2-46), ey=VH/2+Math.sin(a)*Math.min(VW/2-46,VH/2-46);
      ctx.save();ctx.translate(ex,ey);ctx.rotate(a);
      ctx.fillStyle=C("--accent");ctx.globalAlpha=.85;
      ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-8,8);ctx.lineTo(-8,-8);ctx.closePath();ctx.fill();
      ctx.restore();
    }
  }

  /* ── traversata in corso */
  if(voy&&voy.moving){
    // sotto gli strumenti, e sotto la regata quando anche lei è finita a
    // sinistra per mancanza di spazio: prima i due pannelli si sovrapponevano
    const tw2=176, tx=14, ty=py+ph+10+(tp===px?74:0);
    panel(tx,ty,tw2,voy.ghost?62:46);
    label("TRAVERSATA",tx+12,ty+16);
    ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
    ctx.fillText(fmtT(voy.t).split(".")[0],tx+tw2-12,ty+16);ctx.textAlign="left";
    ctx.font="11px ui-monospace,monospace";ctx.fillStyle=C("--chart");
    ctx.fillText(voy.from,tx+12,ty+34);
    ctx.textAlign="right";ctx.fillStyle=C("--chart-dim");
    ctx.fillText(nm(voy.dist).toFixed(2)+" nm",tx+tw2-12,ty+34);ctx.textAlign="left";
    if(voy.ghost){
      ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
      ctx.fillText("→ "+voy.ghost.to,tx+12,ty+52);
      if(voy.delta!==null){
        const d=voy.delta;
        ctx.fillStyle=d<0?C("--good"):C("--accent");ctx.textAlign="right";
        ctx.fillText((d<0?"−":"+")+Math.abs(d).toFixed(0)+" s",tx+tw2-12,ty+52);ctx.textAlign="left";
      }else{
        ctx.fillStyle="rgba(243,234,212,.3)";ctx.textAlign="right";
        ctx.fillText("fuori rotta",tx+tw2-12,ty+52);ctx.textAlign="left";
      }
    }
  }

  /* ── rotta pianificata: il punto verso cui si va e quanto se ne è fuori */
  if(piano.pts.length){
    const tw3=176, tx=14;
    let ty=py+ph+10;                                   // sotto gli strumenti
    if(tp===px) ty+=74;                                // dove è finita anche la regata
    if(voy&&voy.moving) ty+=(voy.ghost?62:46)+10;
    const arrivato=piano.i>=piano.pts.length;
    panel(tx,ty,tw3,arrivato?46:62);
    label("ROTTA",tx+12,ty+16);
    ctx.textAlign="right";ctx.font="10px ui-monospace,monospace";ctx.fillStyle=C("--chart-dim");
    ctx.fillText(Math.min(piano.i+1,piano.pts.length)+"/"+piano.pts.length,tx+tw3-12,ty+16);
    ctx.textAlign="left";
    if(arrivato){
      ctx.font="11px ui-monospace,monospace";ctx.fillStyle=C("--good");
      ctx.fillText("PERCORSA TUTTA",tx+12,ty+34);
    }else{
      const p=piano.pts[piano.i];
      const d=Math.hypot(p.x-boat.x,p.y-boat.y);
      const br=(angOf(p.x-boat.x,p.y-boat.y)*R2D+360)%360;
      ctx.font="11px ui-monospace,monospace";ctx.fillStyle=C("--chart");
      ctx.fillText("RIL "+String(Math.round(br)).padStart(3,"0")+"°",tx+12,ty+34);
      ctx.textAlign="right";ctx.fillStyle=C("--chart-dim");
      ctx.fillText(nm(d).toFixed(2)+" nm",tx+tw3-12,ty+34);ctx.textAlign="left";
      // lo scarto è in metri VERI, come le miglia: la carta è ridotta 1:6
      const s=pianoScarto();
      ctx.font="10px ui-monospace,monospace";
      if(s===null){ctx.fillStyle="rgba(243,234,212,.3)";ctx.fillText("SCARTO —",tx+12,ty+52);}
      else{
        const mr=Math.abs(s)*SCALE_GEO;
        ctx.fillStyle=mr>400?C("--warn"):C("--good");
        ctx.fillText("SCARTO "+(mr<1852?Math.round(mr)+" m":nm(Math.abs(s)).toFixed(2)+" nm")
          +(mr<20?"":(s>0?" A DRITTA":" A SINISTRA")),tx+12,ty+52);
      }
    }
  }

  /* ── in panne: istruzioni che restano finché servono */
  if((boat.stuck>2.5||boat.gtime>2.5) && !game.paused){
    const ag=boat.gtime>2.5;
    // a metà schermo, ma mai addosso al pannello delle scotte: su un
    // telefono il fondo si alza e i due si sovrapporrebbero
    const pw2=Math.min(330,VW-28), px2=VW/2-pw2/2, py2=Math.min(VH*0.60,box.by-106);
    panel(px2,py2,pw2,96);
    ctx.textAlign="left";ctx.font="11px ui-monospace,monospace";
    ctx.fillStyle=C("--accent");
    ctx.fillText(ag?"INCAGLIATO — COME LIBERARSI":"IN PANNE — COME RIPARTIRE",px2+14,py2+22);
    ctx.font="11px ui-monospace,monospace";ctx.fillStyle=C("--chart");
    const steps=ag?[
      "1.  Lasca tutto: le vele ti spingono a riva   (\u2193)",
      "2.  Fiocco a collo   (B): la prua gira al largo",
      "3.  Poi cazza e scappa via di bolina"
    ]:[
      "1.  Lasca la randa tutta   (\u2193)",
      "2.  Fiocco a collo   (B)",
      "3.  Barra tutta da un lato e aspetta"
    ];
    steps.forEach((t,i)=>{
      const done=(i===1&&boat.jibBack);
      ctx.fillStyle=done?C("--good"):C("--chart");
      ctx.fillText(done?t.replace(/^\d\./,"\u2713 "):t,px2+14,py2+44+i*17);
    });
  }

  /* ── messaggi */
  if(game.msgT>0){
    ctx.globalAlpha=clamp(game.msgT,0,1);
    ctx.textAlign="center";ctx.font="13px ui-monospace,monospace";
    const tw2=ctx.measureText(game.msg).width+28;
    // gli avvisi stanno sopra i joystick; su schermo stretto anche sopra il
    // pannello delle scotte, che lì è largo quanto lo schermo e li
    // nasconderebbe sotto la scala del timone
    const my3=box.stretto?box.by-38:box.fondo-64;
    ctx.fillStyle="rgba(8,32,46,.88)";ctx.fillRect(VW/2-tw2/2,my3,tw2,30);
    ctx.strokeStyle="rgba(226,102,45,.5)";ctx.strokeRect(VW/2-tw2/2+.5,my3+.5,tw2-1,29);
    ctx.fillStyle=C("--chart");ctx.fillText(game.msg,VW/2,my3+20);
    ctx.globalAlpha=1;
  }
  if(game.paused){
    ctx.fillStyle="rgba(6,24,35,.55)";ctx.fillRect(0,0,VW,VH);
    ctx.fillStyle=C("--chart");ctx.font="16px ui-monospace,monospace";ctx.textAlign="center";
    ctx.fillText("IN PANNA — premi P per riprendere",VW/2,VH/2);
  }
  ctx.restore();
}

/* ══════════════════ interfaccia ══════════════════ */
/* Porto di partenza: la carta ne offre una ventina, tutti ancoraggi veri. */
const portEl=document.getElementById("port");
function fillPorts(){
  const ps=world.ports||[];
  portEl.innerHTML="";
  ps.forEach((o,i)=>{
    const op=document.createElement("option");
    op.value=i;op.textContent=o.n;
    if(Math.abs(o.x-world.start.x)<2&&Math.abs(o.y-world.start.y)<2)op.selected=true;
    portEl.appendChild(op);
  });
}
function startFrom(i){
  const o=(world.ports||[])[i]; if(!o)return;
  world.start={x:o.x,y:o.y};
  resetBoat();
  say("Partenza da "+o.n);
}
portEl.onchange=e=>{
  const i=parseInt(e.target.value,10);e.target.blur();
  if(game.started&&!game.done)
    askConfirm("Ripartire da "+world.ports[i].n+"? La regata in corso e il cronometro ripartono da zero.",()=>startFrom(i));
  else startFrom(i);
};

/* Flotta: la barca si sceglie dal menù. Cambiare scafo rimette al via,
   perché corredo e stato delle vele appartengono alla barca. */
const boatEl=document.getElementById("boatsel");
function fillBarche(){
  boatEl.innerHTML="";
  for(const id of FLOTTA.ordine){
    const b=FLOTTA.barche[id]; if(!b) continue;
    const op=document.createElement("option");
    op.value=id;op.textContent=b.nome;op.title=b.sommario;
    if(id===barcaId)op.selected=true;
    boatEl.appendChild(op);
  }
}
function cambiaBarca(id){
  if(!setBarca(id)){boatEl.value=barcaId;return;}
  resetBoat();
  say(barcaCorrente().nome+" — "+barcaCorrente().sommario);
}
boatEl.onchange=e=>{
  const id=e.target.value;e.target.blur();
  if(id===barcaId)return;
  if(game.started&&!game.done)
    askConfirm("Passare a "+FLOTTA.barche[id].nome+"? La regata in corso e il cronometro ripartono da zero.",
      ()=>cambiaBarca(id),()=>{boatEl.value=barcaId;});   // annullando, il menù torna alla barca vera
  else cambiaBarca(id);
};

const askEl=document.getElementById("ask");
let askCb=null, askNoCb=null;
function askConfirm(msg,cb,no){
  document.getElementById("asktxt").textContent=msg;
  askCb=cb;askNoCb=no||null;askEl.classList.add("on");
  for(const k in keys)keys[k]=0;                  // niente tasti rimasti premuti
}
function askClose(yes){
  askEl.classList.remove("on");
  const c=askCb, n=askNoCb; askCb=null; askNoCb=null;
  if(yes){ if(c)c(); } else if(n) n();
}
document.getElementById("askyes").onclick=e=>{e.currentTarget.blur();askClose(true);};
document.getElementById("askno").onclick=e=>{e.currentTarget.blur();askClose(false);};
askEl.addEventListener("pointerdown",e=>{if(e.target===askEl)askClose(false);});

const helpEl=document.getElementById("help");
let firstClose=true;
function toggleHelp(){
  helpEl.classList.toggle("on");
  if(!helpEl.classList.contains("on")&&firstClose){firstClose=false;tutStart();}
}
document.getElementById("helpb").onclick=toggleHelp;
document.getElementById("logb").onclick=e=>{e.currentTarget.blur();toggleLog();};
document.getElementById("logclose").onclick=e=>{e.currentTarget.blur();toggleLog();};
document.getElementById("logclear").onclick=e=>{e.currentTarget.blur();
  askConfirm("Cancellare tutto il giornale di bordo? Traversate, record e polare personale andranno persi.",
    ()=>{LOG={passages:[],polar:{},best:{}};saveLog();logRender();});};
const setEl=document.getElementById("settings"), showEl=document.getElementById("showm");
function toggleMenu(){
  const hid=setEl.classList.toggle("hidden");
  showEl.classList.toggle("on",hid);
  // il tutorial sale di dodici pixel quando il menù si nasconde. Una classe
  // e non uno stile in linea: su schermo stretto il foglio di stile lo
  // porta a metà schermo, e uno stile in linea vincerebbe su di lui
  document.getElementById("tut").classList.toggle("su",hid);
}
document.getElementById("hidem").onclick=e=>{e.currentTarget.blur();toggleMenu();};
// la carta a tutto schermo dal menù: su un telefono non c'è nessun C da premere
document.getElementById("chartb").onclick=e=>{e.currentTarget.blur();toggleChart();};
showEl.onclick=toggleMenu;
document.getElementById("closehelp").onclick=toggleHelp;
helpEl.addEventListener("pointerdown",e=>{if(e.target===helpEl)toggleHelp();});
addEventListener("keydown",e=>{if(e.key==="Escape"&&helpEl.classList.contains("on"))toggleHelp();});
document.getElementById("reset").onclick=e=>{e.currentTarget.blur();
  askConfirm("Riportare la barca al via? La regata in corso e il cronometro ripartono da zero.",resetBoat);};
document.getElementById("mapsel").onchange=e=>{mapMode=e.target.value;e.target.blur();
  newWorld(document.getElementById("seed").value||"vela");say(world.name);};
document.getElementById("gen").onclick=()=>{
  if(mapMode==="ionio"){mapMode="rnd";document.getElementById("mapsel").value="rnd";}
  newWorld(document.getElementById("seed").value||"vela");say(world.name);};
document.getElementById("tscale").onchange=e=>{timeScale=parseFloat(e.target.value);e.target.blur();
  say("Ritmo di gioco "+e.target.value.replace(".",",")+"×");};
document.getElementById("vis").oninput=e=>{streakVis=parseFloat(e.target.value);};
document.getElementById("winv").onchange=e=>{wheelInv=e.target.checked;e.target.blur();};
document.getElementById("wstep").onchange=e=>{
  wheelStep=parseFloat(e.target.value);e.target.blur();
  // il conto è su uno scatto da 100 px, quello usuale: serve a dire cosa si è scelto
  const gradi=(100*wheelStep*W_SCOTTA*R2D).toFixed(1).replace(".",",");
  const passo=e.target.options[e.target.selectedIndex].textContent.trim();
  say("Passo delle rotelle "+passo+" — uno scatto ≈ "+gradi+"° di scotta");
};
document.getElementById("easy").onchange=e=>{
  assist=e.target.checked?0.55:1;
  say(e.target.checked?"Mare facile — raffiche e squilibri attenuati":"Mare vero — raffiche piene");
};
document.getElementById("wind").oninput=e=>{
  windBase=parseFloat(e.target.value);
  document.getElementById("windv").textContent=windBase.toFixed(1)+" m/s";
};

/* ══════════════════ rotta pianificata ══════════════════ */
/* La rotta a matita sulla carta: una spezzata di punti segnati col mouse
   prima di partire, che poi resta tratteggiata sul mare mentre si naviga.
   Non governa niente — non è un autotimoniere, non tocca la fisica e la
   golden test non se ne accorge — serve a vedere dove si voleva passare e
   di quanto ci si sta scostando, che è esattamente quello che fa una linea
   tracciata sulla carta vera.

   `i` è il punto verso cui si sta andando: sale da solo quando ci si passa
   entro `PIANO_R`. La tratta in corso va da `da` a `pts[i]`, dove `da` è il
   punto precedente, oppure — sulla prima tratta — dov'era la barca quando
   la rotta è stata tracciata. Senza `da` lo scarto dalla rotta non
   esisterebbe fino al secondo punto, cioè proprio nel tratto in cui si
   esce dal porto e serve di più.

   Si chiama `piano` (il piano di rotta) e non `rotta` perché in tutto il
   resto del file, e nelle sonde di collaudo, *rotta* è la direzione della
   prua: due cose diverse con lo stesso nome nello stesso ambito sono un
   errore che aspetta.                                                  */
const PIANO_R=70;                  // raggio di passaggio: dentro, il punto è girato
const piano={pts:[],i:0,da:{x:0,y:0}};

function pianoAzzera(muto){
  piano.pts.length=0;piano.i=0;piano.da={x:boat.x,y:boat.y};
  if(!muto)say("Rotta cancellata");
}
function pianoTogli(k){
  if(k<0||k>=piano.pts.length)return false;
  piano.pts.splice(k,1);
  if(piano.i>k)piano.i--;                       // il punto attivo resta lo stesso punto
  if(piano.i>piano.pts.length)piano.i=piano.pts.length;
  if(!piano.pts.length)piano.da={x:boat.x,y:boat.y};
  return true;
}
/* Miglia vere che restano: dalla barca al punto attivo, poi di punto in punto. */
function pianoResta(){
  let d=0,px=boat.x,py=boat.y;
  for(let i=piano.i;i<piano.pts.length;i++){
    d+=Math.hypot(piano.pts[i].x-px,piano.pts[i].y-py);
    px=piano.pts[i].x;py=piano.pts[i].y;
  }
  return nm(d);
}
/* Un click sulla carta: sopra un punto lo toglie, altrove ne aggiunge uno in
   coda. La tolleranza è di 12 px sullo schermo a qualunque ingrandimento —
   in metri di gioco sarebbe irraggiungibile da lontano e grande come mezzo
   golfo da vicino. Sta qui, e non nell'ascoltatore, perché la harness non
   può recapitare eventi: è la stessa ragione di `rotella(e)`.          */
function pianoClick(x,y){
  const tol=12/chart.z;
  let k=-1,bd=tol;
  for(let i=0;i<piano.pts.length;i++){
    const d=Math.hypot(piano.pts[i].x-x,piano.pts[i].y-y);
    if(d<=bd){bd=d;k=i;}
  }
  if(k>=0){
    pianoTogli(k);
    say(piano.pts.length?"Punto di rotta tolto — ne restano "+piano.pts.length:"Rotta cancellata");
    return "tolto";
  }
  if(!piano.pts.length) piano.da={x:boat.x,y:boat.y};
  piano.pts.push({x:Math.round(x),y:Math.round(y)});
  say("Punto "+piano.pts.length+" segnato — "+pianoResta().toFixed(2)+" nm da qui alla fine");
  return "aggiunto";
}
/* Scarto dalla rotta: distanza dalla congiungente della tratta in corso,
   positiva se la barca è a dritta di essa. È il numero che distingue il
   seguire la linea dal puntare al punto: scarroccia tutta la traversata e
   arrivi lo stesso, ma passi dove non avevi guardato i fondali.        */
function pianoScarto(){
  const b=piano.pts[piano.i]; if(!b)return null;
  const a=piano.da, dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy);
  if(L<1)return null;
  return ((boat.y-a.y)*dx-(boat.x-a.x)*dy)/L;
}
function pianoUpdate(){
  const p=piano.pts[piano.i]; if(!p)return;
  if(Math.hypot(boat.x-p.x,boat.y-p.y)>PIANO_R)return;
  piano.da={x:p.x,y:p.y};piano.i++;
  say(piano.i>=piano.pts.length?"Ultimo punto di rotta raggiunto"
      :"Punto "+piano.i+" passato — avanti al "+(piano.i+1)+", restano "+pianoResta().toFixed(2)+" nm");
}

/* Tratteggio sul mare. Le tratte già fatte restano, spente: si vede da dove
   si è passati senza confonderle con quelle da fare. */
const PIANO_COL={fatta:"rgba(127,196,122,.20)",avanti:"rgba(127,196,122,.45)",
                 attiva:"rgba(127,196,122,.85)"};
function drawPiano(z){
  if(!piano.pts.length)return;
  ctx.lineCap="round";
  const linea=(ax,ay,bx,by,col,w,dash)=>{
    ctx.strokeStyle=col;ctx.lineWidth=w/z;
    ctx.setLineDash([dash[0]/z,dash[1]/z]);
    ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
    ctx.setLineDash([]);
  };
  for(let j=1;j<piano.pts.length;j++){
    const a=piano.pts[j-1], b=piano.pts[j];
    linea(a.x,a.y,b.x,b.y,j<piano.i?PIANO_COL.fatta:PIANO_COL.avanti,1.6,[9,7]);
  }
  const att=piano.pts[piano.i];
  if(att){
    linea(piano.da.x,piano.da.y,att.x,att.y,PIANO_COL.attiva,2.2,[10,6]);
    // il cerchio di passaggio: dice quando il punto conterà per girato
    ctx.strokeStyle="rgba(127,196,122,.30)";ctx.lineWidth=1.4/z;
    ctx.beginPath();ctx.arc(att.x,att.y,PIANO_R,0,TAU);ctx.stroke();
  }
  ctx.font=(13/z).toFixed(2)+"px ui-monospace,monospace";
  ctx.textAlign="center";
  piano.pts.forEach((p,j)=>{
    const fatto=j<piano.i, attivo=j===piano.i;
    ctx.fillStyle=fatto?PIANO_COL.fatta:(attivo?PIANO_COL.attiva:PIANO_COL.avanti);
    ctx.beginPath();ctx.arc(p.x,p.y,5/z,0,TAU);ctx.fill();
    ctx.fillStyle=fatto?"rgba(243,234,212,.28)":"rgba(243,234,212,.75)";
    ctx.fillText(String(j+1),p.x,p.y-11/z);
  });
  ctx.textAlign="left";ctx.lineCap="butt";
}

/* ══════════════════ carta nautica ══════════════════ */
/* Vista a tutto schermo con l'aspetto di una carta di navigazione: carta
   chiara, terre color sabbia, secche azzurre, reticolato in gradi veri.  */
const chart={x:0,y:0,z:1,on:false,drag:null,mx:0,my:0,has:false};
const CHART={paper:"#e6eef0",deep:"#eef5f6",shoal:"#b9d9e4",land:"#e8d7ae",
             ink:"#27505f",grid:"rgba(39,80,95,.16)",dim:"rgba(39,80,95,.55)"};
function chartFit(){
  chart.z=Math.min(VW,VH)*0.86/world.size;
  chart.x=0;chart.y=0;
}
function toggleChart(){
  chart.on=!chart.on;
  if(chart.on&&!chart.has){chartFit();chart.has=true;}
}
const c2w=(sx,sy)=>({x:(sx-VW/2)/chart.z+chart.x, y:(sy-VH/2)/chart.z+chart.y});
function dms(v,ns){
  const d0=Math.floor(Math.abs(v)), m0=(Math.abs(v)-d0)*60;
  return d0+"°"+(m0<10?"0":"")+m0.toFixed(1)+"′"+ns;
}
function drawChart(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle=CHART.deep;ctx.fillRect(0,0,VW,VH);
  const g=world.geo;
  ctx.save();
  ctx.translate(VW/2,VH/2);ctx.scale(chart.z,chart.z);ctx.translate(-chart.x,-chart.y);
  const hw=VW/2/chart.z, hh=VH/2/chart.z;
  const v={x0:chart.x-hw,x1:chart.x+hw,y0:chart.y-hh,y1:chart.y+hh};

  // reticolato: in gradi veri se la carta è georeferenziata, altrimenti metrico
  ctx.lineWidth=1/chart.z;ctx.strokeStyle=CHART.grid;
  const labels=[];
  if(g){
    const steps=[1,0.5,0.25,0.1,0.05,0.02,0.01,0.005];
    const stLon=steps.find(t=>(v.x1-v.x0)/(t*g.gx)<9)||0.005;
    const stLat=steps.find(t=>(v.y1-v.y0)/(t*g.gy)<9)||0.005;
    const lo0=g.lon0+v.x0/g.gx, lo1=g.lon0+v.x1/g.gx;
    for(let L=Math.ceil(lo0/stLon)*stLon;L<=lo1;L+=stLon){
      const x=(L-g.lon0)*g.gx;
      ctx.beginPath();ctx.moveTo(x,v.y0);ctx.lineTo(x,v.y1);ctx.stroke();
      labels.push([VW/2+(x-chart.x)*chart.z,null,dms(L,"E")]);
    }
    const la1=g.lat0-v.y0/g.gy, la0=g.lat0-v.y1/g.gy;
    for(let L=Math.ceil(la0/stLat)*stLat;L<=la1;L+=stLat){
      const y=(g.lat0-L)*g.gy;
      ctx.beginPath();ctx.moveTo(v.x0,y);ctx.lineTo(v.x1,y);ctx.stroke();
      labels.push([null,VH/2+(y-chart.y)*chart.z,dms(L,"N")]);
    }
  }else{
    const st=1000;
    for(let x=Math.ceil(v.x0/st)*st;x<=v.x1;x+=st){ctx.beginPath();ctx.moveTo(x,v.y0);ctx.lineTo(x,v.y1);ctx.stroke();}
    for(let y=Math.ceil(v.y0/st)*st;y<=v.y1;y+=st){ctx.beginPath();ctx.moveTo(v.x0,y);ctx.lineTo(v.x1,y);ctx.stroke();}
  }

  // terre, con la fascia di secche
  ctx.lineJoin="round";ctx.lineCap="round";
  for(const is of world.islands){
    if(is.x1<v.x0||is.x0>v.x1||is.y1<v.y0||is.y0>v.y1)continue;
    islandPath(is);
    ctx.strokeStyle=CHART.shoal;ctx.lineWidth=is.hw*2.6;ctx.stroke();
    ctx.fillStyle=CHART.land;ctx.fill();
    ctx.strokeStyle=CHART.ink;ctx.lineWidth=1.4/chart.z;ctx.stroke();
  }
  // scia della traversata e fantasma
  if(voy&&voy.ghost){
    ctx.strokeStyle="rgba(39,80,95,.28)";ctx.lineWidth=1.4/chart.z;
    ctx.setLineDash([7/chart.z,5/chart.z]);ctx.beginPath();
    voy.ghost.track.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));
    ctx.stroke();ctx.setLineDash([]);
  }
  if(voy&&voy.track.length>1){
    ctx.strokeStyle="#c0562a";ctx.lineWidth=1.8/chart.z;ctx.beginPath();
    voy.track.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));
    ctx.stroke();
  }
  // la rotta pianificata, tracciata come a matita: la tratta in corso piena,
  // le altre più tenui, e il cerchio di passaggio attorno al punto attivo
  if(piano.pts.length){
    ctx.lineCap="round";
    ctx.strokeStyle="rgba(30,110,70,.55)";ctx.lineWidth=1.6/chart.z;
    ctx.setLineDash([8/chart.z,6/chart.z]);
    ctx.beginPath();
    piano.pts.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.stroke();
    const att=piano.pts[piano.i];
    if(att){
      ctx.strokeStyle="rgba(30,110,70,.95)";ctx.lineWidth=2.2/chart.z;
      ctx.beginPath();ctx.moveTo(piano.da.x,piano.da.y);ctx.lineTo(att.x,att.y);ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle="rgba(30,110,70,.35)";ctx.lineWidth=1.2/chart.z;
      ctx.beginPath();ctx.arc(att.x,att.y,PIANO_R,0,TAU);ctx.stroke();
    }
    ctx.setLineDash([]);ctx.lineCap="butt";
  }
  ctx.restore();

  // ─ simboli in pixel, così restano leggibili a ogni zoom
  const S=(wx,wy)=>({x:VW/2+(wx-chart.x)*chart.z, y:VH/2+(wy-chart.y)*chart.z});
  ctx.font="10px ui-monospace,monospace";ctx.textAlign="center";ctx.textBaseline="middle";
  for(const o of (world.ports||[])){
    const q=S(o.x,o.y);
    if(q.x<-40||q.x>VW+40||q.y<-40||q.y>VH+40)continue;
    ctx.strokeStyle=CHART.ink;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.arc(q.x,q.y,4,0,TAU);ctx.stroke();
    ctx.beginPath();ctx.arc(q.x,q.y,1.4,0,TAU);ctx.fillStyle=CHART.ink;ctx.fill();
    ctx.fillStyle=CHART.dim;ctx.textAlign="left";
    ctx.fillText(o.n,q.x+8,q.y);
  }
  world.marks.forEach((m,i)=>{
    const q=S(m.x,m.y);
    const done=i<game.next, nxt=i===game.next;
    ctx.fillStyle=done?"#5c8f57":(nxt?"#d2611f":"rgba(39,80,95,.35)");
    ctx.beginPath();ctx.moveTo(q.x,q.y-7);ctx.lineTo(q.x+5,q.y+4);ctx.lineTo(q.x-5,q.y+4);ctx.closePath();ctx.fill();
    ctx.fillStyle=CHART.dim;ctx.textAlign="center";
    ctx.fillText(String(i+1),q.x,q.y+14);
  });
  // punti di rotta, numerati, con rilevamento e distanza di ogni tratta:
  // sono i due numeri che si scrivono a matita accanto alla linea
  if(piano.pts.length){
    const etichetta=(a,b2,attiva)=>{
      const dx=b2.x-a.x, dy=b2.y-a.y, d=Math.hypot(dx,dy);
      if(d*chart.z<50)return;                       // tratta corta: l'etichetta la coprirebbe
      const q=S((a.x+b2.x)/2,(a.y+b2.y)/2);
      if(q.x<-60||q.x>VW+60||q.y<-30||q.y>VH+30)return;
      const t=String(Math.round((angOf(dx,dy)*R2D+360)%360)).padStart(3,"0")+"°  "+nm(d).toFixed(2)+" nm";
      ctx.font=(attiva?10:9)+"px ui-monospace,monospace";
      const w=ctx.measureText(t).width+10;
      ctx.fillStyle="rgba(255,255,255,.72)";ctx.fillRect(q.x-w/2,q.y-8,w,16);
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.fillStyle=attiva?"#1e6e46":CHART.dim;ctx.fillText(t,q.x,q.y);
    };
    for(let j=1;j<piano.pts.length;j++) etichetta(piano.pts[j-1],piano.pts[j],j===piano.i);
    if(piano.i===0&&piano.pts[0]) etichetta(piano.da,piano.pts[0],true);
    piano.pts.forEach((p,j)=>{
      const q=S(p.x,p.y);
      if(q.x<-40||q.x>VW+40||q.y<-40||q.y>VH+40)return;
      const attivo=j===piano.i, fatto=j<piano.i;
      ctx.fillStyle="rgba(255,255,255,.85)";
      ctx.beginPath();ctx.arc(q.x,q.y,5,0,TAU);ctx.fill();
      ctx.strokeStyle=fatto?"rgba(30,110,70,.40)":"#1e6e46";ctx.lineWidth=attivo?2.2:1.2;
      ctx.stroke();
      ctx.font="9px ui-monospace,monospace";ctx.textAlign="left";ctx.textBaseline="middle";
      ctx.fillStyle=fatto?"rgba(30,110,70,.45)":"#1e6e46";
      ctx.fillText(String(j+1),q.x+8,q.y-7);
    });
    ctx.textAlign="center";
  }

  // barca, con la rotta proiettata a dieci minuti
  const b=S(boat.x,boat.y);
  const sp=Math.hypot(boat.vx,boat.vy);
  if(sp>0.3){
    const d=dv(boat.h);
    const q2=S(boat.x+d.x*sp*600,boat.y+d.y*sp*600);
    ctx.strokeStyle="rgba(192,86,42,.55)";ctx.lineWidth=1.2;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(q2.x,q2.y);ctx.stroke();ctx.setLineDash([]);
  }
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(boat.h);
  ctx.fillStyle="#c0562a";ctx.strokeStyle="#7d3315";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();
  ctx.fill();ctx.stroke();ctx.restore();

  // etichette del reticolato sui bordi
  ctx.font="9px ui-monospace,monospace";ctx.fillStyle=CHART.dim;
  // le latitudini partono più in basso su schermo stretto: lassù ci sono le
  // due righe di intestazione, e ci finivano dentro
  const yMin=schermoStretto()?72:20;
  for(const L of labels){
    if(L[0]!==null&&L[0]>40&&L[0]<VW-40){ctx.textAlign="center";ctx.fillText(L[2],L[0],14);}
    if(L[1]!==null&&L[1]>yMin&&L[1]<VH-20){ctx.textAlign="left";ctx.fillText(L[2],6,L[1]);}
  }

  // rosa dei venti con la direzione del vento reale. Su schermo stretto
  // scende, perché in alto a destra c'è il pulsante ☰ del menù
  const w=windAt(boat.x,boat.y);
  const stretto=schermoStretto();
  const rx=VW-78, ry=stretto?126:78;
  ctx.strokeStyle=CHART.dim;ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(rx,ry,34,0,TAU);ctx.stroke();
  ctx.beginPath();ctx.arc(rx,ry,26,0,TAU);ctx.stroke();
  for(let a=0;a<360;a+=30){const d=dv(a*D2R);
    ctx.beginPath();ctx.moveTo(rx+d.x*26,ry+d.y*26);ctx.lineTo(rx+d.x*34,ry+d.y*34);ctx.stroke();}
  ctx.fillStyle=CHART.ink;ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font="10px ui-monospace,monospace";ctx.fillText("N",rx,ry-42);
  const wp=dv(w.from);
  ctx.strokeStyle="#c0562a";ctx.lineWidth=2.4;
  ctx.beginPath();ctx.moveTo(rx+wp.x*24,ry+wp.y*24);ctx.lineTo(rx-wp.x*20,ry-wp.y*20);ctx.stroke();
  const wn=dv(w.from+Math.PI/2);
  ctx.fillStyle="#c0562a";ctx.beginPath();
  ctx.moveTo(rx-wp.x*20,ry-wp.y*20);
  ctx.lineTo(rx-wp.x*10+wn.x*6,ry-wp.y*10+wn.y*6);
  ctx.lineTo(rx-wp.x*10-wn.x*6,ry-wp.y*10-wn.y*6);ctx.closePath();ctx.fill();
  ctx.fillStyle=CHART.dim;ctx.font="9px ui-monospace,monospace";
  ctx.fillText("VENTO "+String(Math.round((w.from*R2D+360)%360)).padStart(3,"0")+"° "+
               (w.spd*1.94384).toFixed(0)+" kn",rx,ry+48);

  // scala grafica, in miglia vere
  const targetPx=170;
  const nmPer=1852/SCALE_GEO;                    // metri di gioco per miglio reale
  let step=[0.25,0.5,1,2,5,10,20].find(t=>t*nmPer*chart.z>targetPx*0.55)||20;
  const pxs=step*nmPer*chart.z;
  // la scala grafica sta sopra la pulsantiera dei joystick, che sulla carta
  // resta visibile perché è l'unico modo di richiuderla col dito
  const bx=24, by=VH-38-(joy.on?40:0);
  ctx.strokeStyle=CHART.ink;ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+pxs,by);ctx.stroke();
  for(let i=0;i<=4;i++){const x=bx+pxs*i/4;
    ctx.beginPath();ctx.moveTo(x,by-4);ctx.lineTo(x,by+4);ctx.stroke();}
  ctx.fillStyle=CHART.ink;ctx.textAlign="left";ctx.font="10px ui-monospace,monospace";
  ctx.fillText("0",bx-2,by+14);ctx.fillText(step+" miglia nautiche",bx+pxs+8,by);

  // lettura del cursore: rilevamento e distanza dalla barca
  if(chart.mx>0){
    const p=c2w(chart.mx,chart.my);
    const dx=p.x-boat.x, dy=p.y-boat.y;
    const dist=Math.hypot(dx,dy), brg=(angOf(dx,dy)*R2D+360)%360;
    ctx.strokeStyle="rgba(192,86,42,.45)";ctx.lineWidth=1;ctx.setLineDash([3,4]);
    ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(chart.mx,chart.my);ctx.stroke();ctx.setLineDash([]);
    const txt="RIL "+String(Math.round(brg)).padStart(3,"0")+"°   "+nm(dist).toFixed(2)+" nm";
    ctx.font="11px ui-monospace,monospace";
    const tw3=ctx.measureText(txt).width+16;
    ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(chart.mx+12,chart.my-11,tw3,22);
    ctx.strokeStyle=CHART.dim;ctx.lineWidth=1;ctx.strokeRect(chart.mx+12.5,chart.my-10.5,tw3-1,21);
    ctx.fillStyle=CHART.ink;ctx.textAlign="left";ctx.textBaseline="middle";
    ctx.fillText(txt,chart.mx+20,chart.my);
    if(g){
      const la=g.lat0-p.y/g.gy, lo=g.lon0+p.x/g.gx;
      ctx.font="9px ui-monospace,monospace";ctx.fillStyle=CHART.dim;
      ctx.fillText(dms(la,"N")+"  "+dms(lo,"E"),chart.mx+20,chart.my+18);
    }
  }

  // intestazione
  ctx.textAlign="left";ctx.textBaseline="alphabetic";
  ctx.fillStyle=CHART.ink;ctx.font="12px ui-monospace,monospace";
  ctx.fillText(world.name.toUpperCase(),24,32);
  ctx.fillStyle=CHART.dim;ctx.font="9px ui-monospace,monospace";
  // due righe di istruzioni: per esteso quando c'è larghezza, in versione
  // da telefono quando non c'è — dove per giunta si pizzica invece di
  // girare una rotella e non c'è nessun tasto C da premere
  ctx.fillText(stretto
    ? "SCALA 1:"+SCALE_GEO+"  ·  TRASCINA  ·  PIZZICA PER INGRANDIRE  ·  CARTA CHIUDE"
    : "SCALA DI GIOCO 1:"+SCALE_GEO+"  ·  TRASCINA PER SPOSTARE  ·  ROTELLA PER INGRANDIRE  ·  C CHIUDE  ·  0 INQUADRA TUTTO",24,46);
  // la riga della rotta: come si traccia, e quanto è lunga quella che c'è
  if(piano.pts.length){
    ctx.fillStyle="#1e6e46";
    ctx.fillText(stretto
      ? "ROTTA · "+piano.pts.length+" · "+pianoResta().toFixed(2)+" nm DA QUI  ·  TOCCA UN PUNTO PER TOGLIERLO"
      : "ROTTA · "+piano.pts.length+(piano.pts.length===1?" PUNTO":" PUNTI")+
        " · "+pianoResta().toFixed(2)+" nm DA QUI  ·  CLICCA SU UN PUNTO PER TOGLIERLO  ·  CANC L'ULTIMO  ·  MAIUSC+CANC TUTTA",24,60);
  }else{
    ctx.fillText(stretto
      ? "TOCCA IL MARE PER SEGNARE UN PUNTO DI ROTTA"
      : "CLICCA SUL MARE PER SEGNARE UN PUNTO DI ROTTA: LA LINEA RESTA TRATTEGGIATA ANCHE IN NAVIGAZIONE",24,60);
  }
  ctx.textBaseline="alphabetic";
}

/* ══════════════════ giornale di bordo ══════════════════ */
/* Salvataggio a strati: usa l'archivio degli artefatti se c'è, altrimenti
   quello del browser, altrimenti tiene tutto in memoria per la sessione. */
const memStore={};
let storeKind="memoria";
const store={
  async get(k){
    try{ if(window.storage&&window.storage.get){const r=await window.storage.get(k);
      storeKind="archivio";if(r&&r.value)return JSON.parse(r.value);return null;} }catch(e){storeKind="archivio";return null;}
    try{ const v=localStorage.getItem(k); storeKind="browser"; return v?JSON.parse(v):null; }catch(e){}
    return memStore[k]!==undefined?memStore[k]:null;
  },
  async set(k,v){
    memStore[k]=v;
    const t=JSON.stringify(v);
    try{ if(window.storage&&window.storage.set){await window.storage.set(k,t);return;} }catch(e){}
    try{ localStorage.setItem(k,t); }catch(e){}
  }
};

const SCALE_GEO=6;                                   // la carta è ridotta 1:6
const nm=m=>m*SCALE_GEO/1852;                        // miglia nautiche vere
const avgKn=(m,t)=>m/t*1.94384;                      // velocità media effettiva della barca
const realT=t=>{                                     // tempo che ci vorrebbe alla scala vera
  const h=Math.floor(t*SCALE_GEO/3600), mi=Math.round(t*SCALE_GEO%3600/60);
  return h?h+" h "+String(mi).padStart(2,"0"):mi+" min";
};
let LOG={passages:[],polar:{},best:{}};
let voy=null, challenge=null;

async function loadLog(){
  const d=await store.get("vela:log");
  if(d&&d.passages){LOG=d; if(!LOG.polar)LOG.polar={}; if(!LOG.best)LOG.best={};}
  logRender();
}
function saveLog(){ store.set("vela:log",LOG); }

function nearestPort(x,y){
  let b=null,bd=1e18;
  for(const o of (world.ports||[])){const d=Math.hypot(o.x-x,o.y-y); if(d<bd){bd=d;b=o;}}
  return b?b.n:"Mare aperto";
}
function decimate(tr,n){
  if(tr.length<=n) return tr;
  const out=[]; for(let i=0;i<n;i++) out.push(tr[Math.floor(i*(tr.length-1)/(n-1))]);
  return out;
}
function startVoyage(from){
  voy={from,t:0,dist:0,track:[],moving:false,ghost:null,delta:null};
  let key=null;
  if(challenge&&challenge.startsWith(from+" → ")) key=challenge;
  else{
    let bw=-1;
    for(const k in LOG.best) if(k.startsWith(from+" → ")&&LOG.best[k].when>bw){bw=LOG.best[k].when;key=k;}
  }
  if(key&&LOG.best[key]) voy.ghost={key,to:key.split(" → ")[1],...LOG.best[key]};
}
function voyUpdate(dt){
  if(!voy||!world.ports||!world.ports.length) return;
  const sp=Math.hypot(boat.vx,boat.vy);
  if(!voy.moving){ if(sp>0.7) voy.moving=true; else return; }
  voy.t+=dt; voy.dist+=sp*dt;
  const L=voy.track[voy.track.length-1];
  if(!L||Math.hypot(boat.x-L[0],boat.y-L[1])>30)
    voy.track.push([Math.round(boat.x),Math.round(boat.y),Math.round(voy.t*10)/10]);

  // polare personale: miglior rapporto velocità barca / velocità vento per settore
  const w=windAt(boat.x,boat.y);
  if(w.spd>2&&sp>0.3){
    const b="b"+Math.min(11,Math.floor(Math.abs(norm(w.from-boat.h))*R2D/15));
    const r=Math.round(sp/w.spd*1000)/1000;
    if(!LOG.polar[b]||r>LOG.polar[b]) LOG.polar[b]=r;
  }
  // confronto col fantasma: quanto tempo aveva impiegato lui per essere qui
  if(voy.ghost){
    let bd=1e18,bt=0;
    for(const q of voy.ghost.track){
      const d=(q[0]-boat.x)**2+(q[1]-boat.y)**2;
      if(d<bd){bd=d;bt=q[2];}
    }
    voy.delta=(bd<400*400)?voy.t-bt:null;
  }
  for(const o of world.ports){
    if(o.n===voy.from) continue;
    if(Math.hypot(boat.x-o.x,boat.y-o.y)<220){ arrive(o.n); return; }
  }
}
function arrive(to){
  const key=voy.from+" → "+to;
  const p={from:voy.from,to,t:voy.t,dist:voy.dist,when:Date.now()};
  const b=LOG.best[key];
  if(voy.t>30&&voy.dist>450){
    if(!b||voy.t<b.t){LOG.best[key]={t:voy.t,dist:voy.dist,when:p.when,track:decimate(voy.track,160)};p.rec=1;}
    LOG.passages.unshift(p);
    if(LOG.passages.length>80) LOG.passages.length=80;
    saveLog();
    say("Arrivato a "+to+" — "+fmtT(voy.t).split(".")[0]+" · "+nm(voy.dist).toFixed(1)+
        " nm · "+avgKn(voy.dist,voy.t).toFixed(1)+" kn di media"+(p.rec?"   ★ RECORD":""));
    logRender();
  }
  challenge=null;
  startVoyage(to);
}

/* ─ interfaccia del giornale ─ */
const logEl=document.getElementById("logbook");
logEl.addEventListener("pointerdown",e=>{if(e.target===logEl)toggleLog();});
function toggleLog(){
  logEl.classList.toggle("on");
  if(logEl.classList.contains("on")) logRender();
}
function logRender(){
  if(!logEl||!logEl.classList.contains("on")) return;
  const tot=LOG.passages.reduce((a,p)=>a+p.dist,0), tt=LOG.passages.reduce((a,p)=>a+p.t,0);
  document.getElementById("logsum").innerHTML=
    "<b>"+LOG.passages.length+"</b> traversate · <b>"+nm(tot).toFixed(1)+"</b> miglia · <b>"+
    fmtT(tt).split(".")[0]+"</b> al timone, pari a "+realT(tt)+" di navigazione vera"+
    "<span style='color:var(--chart-dim)'>   (salvataggio: "+storeKind+")</span>";
  const keys=Object.keys(LOG.best).sort();
  document.getElementById("logbest").innerHTML = keys.length? 
    "<table>"+keys.map(k=>{
      const b=LOG.best[k];
      return "<tr><td>"+k+"</td><td class='n'>"+fmtT(b.t).split(".")[0]+"</td><td class='n'>"+
        nm(b.dist).toFixed(1)+" nm</td><td class='n'>"+avgKn(b.dist,b.t).toFixed(1)+" kn</td>"+
        "<td><button data-r=\""+k+"\">Sfida</button></td></tr>";
    }).join("")+"</table>"
    : "<div class='empty'>Nessuna traversata registrata. Esci da un porto e arriva in un altro: viene salvata da sola.</div>";
  document.getElementById("logbest").querySelectorAll("button").forEach(b=>{
    b.onclick=e=>{
      const k=e.currentTarget.dataset.r;
      challenge=k;
      const from=k.split(" → ")[0];
      const i=(world.ports||[]).findIndex(o=>o.n===from);
      if(i>=0){portEl.value=i;startFrom(i);}
      toggleLog();
      say("Sfida: "+k+" — record "+fmtT(LOG.best[k].t).split(".")[0]);
    };
  });
  document.getElementById("loglast").innerHTML = LOG.passages.length?
    "<table>"+LOG.passages.slice(0,12).map(p=>
      "<tr><td>"+p.from+" → "+p.to+"</td><td class='n'>"+fmtT(p.t).split(".")[0]+
      "</td><td class='n'>"+nm(p.dist).toFixed(1)+" nm</td><td class='n'>"+
      avgKn(p.dist,p.t).toFixed(1)+" kn</td><td class='r'>"+(p.rec?"★":"")+"</td></tr>").join("")+"</table>":"";
  drawPolarChart();
}
function drawPolarChart(){
  const cv2=document.getElementById("polarcv"); if(!cv2)return;
  const g=cv2.getContext("2d"), W2=cv2.width=300, H2=cv2.height=300;
  const cx=W2/2, cy=H2/2+8, R=118;
  g.clearRect(0,0,W2,H2);
  const vmax=Math.max(7,polarSpeed(100,windBase)*1.94384*1.15);
  const rad=v=>v/vmax*R;
  g.strokeStyle="rgba(243,234,212,.14)";g.lineWidth=1;
  for(let k=2;k<=Math.floor(vmax);k+=2){
    g.beginPath();g.arc(cx,cy,rad(k),0,TAU);g.stroke();
    g.fillStyle="rgba(243,234,212,.30)";g.font="9px ui-monospace,monospace";g.textAlign="left";
    g.fillText(k+" kn",cx+3,cy-rad(k)-2);
  }
  for(let a=0;a<360;a+=30){
    const d=dv(a*D2R);
    g.strokeStyle="rgba(243,234,212,.10)";
    g.beginPath();g.moveTo(cx,cy);g.lineTo(cx+d.x*R,cy+d.y*R);g.stroke();
  }
  g.fillStyle="rgba(243,234,212,.45)";g.font="9px ui-monospace,monospace";g.textAlign="center";
  g.fillText("VENTO",cx,cy-R-10);
  // curva teorica
  g.strokeStyle="rgba(127,196,122,.85)";g.lineWidth=1.8;g.beginPath();
  for(let a=0;a<=180;a+=4){
    const v=polarSpeed(a,windBase)*1.94384, d=dv(a*D2R);
    const x=cx+d.x*rad(v), y=cy+d.y*rad(v);
    a?g.lineTo(x,y):g.moveTo(x,y);
  }
  g.stroke();
  g.save();g.scale(-1,1);g.translate(-2*cx,0);
  g.strokeStyle="rgba(127,196,122,.35)";g.beginPath();
  for(let a=0;a<=180;a+=4){
    const v=polarSpeed(a,windBase)*1.94384, d=dv(a*D2R);
    const x=cx+d.x*rad(v), y=cy+d.y*rad(v);
    a?g.lineTo(x,y):g.moveTo(x,y);
  }
  g.stroke();g.restore();
  // punti personali
  let any=false;
  for(let b=0;b<12;b++){
    const r=LOG.polar["b"+b]; if(!r)continue; any=true;
    const a=(b*15+7.5), v=r*windBase*1.94384, d=dv(a*D2R);
    g.fillStyle=C("--accent");
    g.beginPath();g.arc(cx+d.x*rad(v),cy+d.y*rad(v),3.2,0,TAU);g.fill();
  }
  g.fillStyle="rgba(243,234,212,.5)";g.font="9px ui-monospace,monospace";g.textAlign="left";
  g.fillText("— teorico a "+(windBase*1.94384).toFixed(0)+" kn di vento",10,H2-16);
  g.fillStyle=C("--accent");
  g.fillText(any?"• tuo massimo per settore":"• nessun dato tuo ancora",10,H2-4);
}

/* ══════════════════ tutorial ══════════════════ */
/* Ogni passo ha un obiettivo verificabile sullo stato della barca e mette in
   evidenza lo strumento di cui parla, così si impara guardando la cosa giusta. */
const tut={on:false,i:0,hold:0,mem:{},t:0};
const kn=()=>Math.hypot(boat.vx,boat.vy)*1.94384;
const twaNow=()=>norm(windAt(boat.x,boat.y).from-boat.h);

const TUT=[
{ttl:"Benvenuto a bordo",hi:null,manual:true,
 txt:"Undici metri, randa e fiocco. In pochi minuti vediamo <b>cosa guardare</b> per non trovarti mai fermo senza capire perché. Puoi chiudere il tutorial quando vuoi."},

{ttl:"Da dove viene il vento",hi:"rose",manual:true,
 txt:"I <b>tratteggi</b> sull'acqua scorrono nella direzione in cui soffia il vento: più sono lunghi e chiari, più è forte. Nella <b>rosa</b> in alto a destra la freccia arancione indica da dove viene, e il settore giallo è la zona in cui non puoi navigare. La rosa è orientata a prua: sta ferma la barchetta e gira il mondo."},

{ttl:"La barra",hi:"rudder",init(){tut.mem.h0=boat.h;},
 txt:"Le <b>frecce sinistra e destra</b> muovono la barra, che <b>resta dove la lasci</b>: non torna al centro da sola. Sull'indicatore TIMONE il segno chiaro è dove l'hai messa, quello pieno è dove è arrivata la pala. <b>Spazio</b> la rimette dritta. Per gli aggiustamenti piccoli ci sono <b>,</b> e <b>.</b>, cinque volte più fini: ci torniamo fra poco, perché sono la chiave per non combattere col timone. Se preferisci il mouse, <b>Alt + rotella</b> — o il <b>tasto destro premuto</b> mentre giri la rotella — muove la barra e la lascia dov'è: in su a dritta, in giù a sinistra, dalla parte in cui gireresti la ruota. Un <b>doppio click del tasto destro</b> la rimette dritta, come Spazio.",
 goal:"Accosta finché la rotta è cambiata di 60°",
 ok:()=>Math.abs(norm(boat.h-tut.mem.h0))>60*D2R},

{ttl:"Regolare le vele",hi:"sails",hold:2.5,
 txt:"Le due barre in basso a sinistra sono la <b>posizione delle scotte</b>: tutta cazzata a sinistra, tutta lascata a destra. La <b>fascia verde</b> è dove la scotta dovrebbe stare adesso. Porta il segno bianco dentro il verde con <b>↑↓</b> per la randa e <b>Q E</b> per il fiocco. Guarda anche le vele: diventano bianche col bordo verde quando sono giuste. Anche la <b>rotella</b> le regola; se lo scatto ti sembra troppo grosso, nel menù in alto abbassa il <i>passo rotelle</i> a 1/5.",
 goal:"Tieni entrambe le vele nella fascia verde per 2 secondi",
 ok:()=>boat.stM==="ottima"&&(boat.stJ==="ottima"||boat.stJ==="aperta")},

{ttl:"Il vento apparente",hi:"sails",
 txt:"Muovendoti, il vento che senti a bordo gira verso prua. Per questo la <b>fascia verde si sposta a sinistra man mano che acceleri</b>: devi cazzare ancora un po'. È il motivo per cui in barca si regola in continuazione.",
 goal:"Supera i 4,5 nodi tenendo le vele a posto",
 ok:()=>kn()>4.5},

{ttl:"Il muro del vento",hi:"sails",
 txt:"Adesso rompiamo qualcosa apposta. <b>Orza</b>, cioè gira verso il vento, e continua. Vedrai le vele diventare <b>ambra e trasparenti</b>, i filetti rossi sollevarsi, e la barca fermarsi. Entro ~35° dal vento non si naviga: si chiama essere <b>in panne</b>.",
 goal:"Fermati con la prua nel vento (sotto 1,2 nodi)",
 ok:()=>kn()<1.2&&Math.abs(boat.beta)<45*D2R},

{ttl:"Uscire dalla panne",hi:"sails",init(){tut.mem.used=false;},
 txt:"Da fermo il timone non serve a niente: senza acqua che scorre sulla pala non gira niente. La manovra vera è il <b>fiocco a collo</b>: premi <b>B</b>. Il fiocco viene tenuto dal lato sbagliato, diventa azzurro, e il vento spinge la prua sottovento. Aiuta anche lascare la randa.",
 goal:"Premi B e fai cadere la prua oltre i 65° dal vento",
 ok(){if(boat.jibBack)tut.mem.used=true;
      return tut.mem.used&&Math.abs(boat.beta)>65*D2R&&kn()>1.5;}},

{ttl:"Il bilanciamento",hi:"balance",hold:6,
 txt:"La <b>randa</b> tira a poppavia del centro della barca e la fa <b>orzare</b>; il <b>fiocco</b> tira a prua e la fa <b>puggiare</b>. La barra dell'indicatore BILANCIAMENTO dice chi sta vincendo. Portala al centro cazzando o lascando una delle due, e la barca tiene la rotta da sola. È il vero motivo per cui in barca si toccano le scotte, non il timone.<br><br>Quello che resta lo assorbe il <b>cavallino</b>: di bolina serve un quarto di barra tenuta ferma, e con <b>,</b> e <b>.</b> sposti il <i>neutro</i> lì. Da allora <b>Spazio</b> riporta la barra al cavallino, non al centro, quindi correggere una raffica non ti fa perdere la regolazione.",
 goal:"Naviga sopra i 3 nodi con bilanciamento neutro e barra quasi al centro, per 6 secondi",
 ok:()=>kn()>3&&Math.abs(boat.balance)<0.28&&Math.abs(boat.rudderCmd)<0.18},

{ttl:"Le raffiche",hi:null,
 txt:"Le <b>macchie scure</b> sull'acqua sono raffiche: dentro, i tratteggi si allungano e corrono. Ti danno più velocità ma anche più sbandamento, e spesso ruotano un po' il vento. Vederle arrivare da sopravvento ti dà il tempo di prepararti.",
 goal:"Entra dentro una raffica",
 ok:()=>windAt(boat.x,boat.y).spd>windBase*1.09},

{ttl:"Andature portanti",hi:"sails",hold:1.5,
 txt:"Più poggi, più le vele vanno tenute <b>perpendicolari al vento</b>: l'angolo migliore passa da 27° di bolina a 90° in poppa. Non esiste una regolazione buona per tutte le andature — per questo la fascia verde si sposta parecchio. Seguila e basta.",
 goal:"Porta il vento oltre i 150° con entrambe le vele nel verde",
 ok:()=>Math.abs(twaNow())>150*D2R&&(boat.stM==="aperta"||boat.stM==="ottima")
        &&(boat.stJ==="aperta"||boat.stJ==="ottima")},

{ttl:"Lo spinnaker",hi:"instr",
 txt:"Scappando davanti al vento te ne porti via una parte: il vento apparente crolla e la pressione sulle vele quasi si dimezza. Se qui la velocità non sale non è colpa della regolazione, sono le <b>vele sbagliate</b>. Premi <b>G</b>: lo spinnaker è tre volte il fiocco e resta molto meno coperto dalla randa. Si regola con <b>Q E</b>. Di bolina però si sgonfia, quindi ammainalo prima di risalire il vento.",
 goal:"Issa lo spinnaker e supera i 5,5 nodi",
 ok:()=>boat.spi&&kn()>5.5},

{ttl:"Autotimoniere",hi:"rudder",
 txt:"<b>Z</b> cambia il modo di governo in quattro passi. <b>Richiamo al centro</b>: la barra torna dritta da sola se la molli, come con un elastico. <b>Rotta</b>: mantiene la direzione bussola. <b>Vento</b>: mantiene l'angolo col vento apparente, come un autotimoniere a vento vero. <b>Barra libera</b>: resta dove la metti. Negli ultimi due le frecce spostano la rotta impostata invece di muovere la barra.",
 goal:"Inserisci l'autotimoniere con Z",
 ok:()=>game.pilot!==0},

{ttl:"Sei pronto",hi:null,manual:true,
 txt:"Riassunto: <b>colore delle vele</b> per capire se tirano, <b>fascia verde</b> per sapere dove mettere la scotta, <b>bilanciamento</b> per non combattere col timone, <b>B</b> se ti pianti. Adesso ci sono sei boe da girare in ordine, con il cronometro. <b>H</b> riapre i comandi in qualsiasi momento."}
];

const tutEl=document.getElementById("tut");
function tutRender(){
  const st=TUT[tut.i];
  document.getElementById("tutnum").textContent=(tut.i+1)+"/"+TUT.length;
  document.getElementById("tutttl").textContent=st.ttl;
  document.getElementById("tuttxt").innerHTML=st.txt;
  const g=document.getElementById("tutgoal");
  g.textContent=st.goal?"▸ "+st.goal:"";
  g.style.display=st.goal?"block":"none";
  document.getElementById("tutnext").style.display=st.manual?"inline-block":"none";
  document.getElementById("tutskip").style.display=st.manual?"none":"inline-block";
}
function tutStart(){
  tut.on=true;tut.i=0;tut.hold=0;tut.mem={};tut.t=0;
  game.auto=false;game.pilot=0;
  // Il tutorial parla della barca di riferimento: dice "undici metri" e ha
  // un passo sullo spinnaker, che sul gozzo non esiste. Ci si torna sopra.
  const cambiata=barcaId!==BARCA_BASE;
  if(cambiata){setBarca(BARCA_BASE);if(boatEl)boatEl.value=BARCA_BASE;}
  resetBoat();
  if(cambiata)say("Tutorial: si torna sullo "+barcaCorrente().nome);
  tutEl.classList.add("on");tutRender();
}
function tutNext(){
  tut.i++;tut.hold=0;tut.mem={};tut.t=0;
  if(tut.i>=TUT.length){tutQuit();return;}
  if(TUT[tut.i].init)TUT[tut.i].init();
  tutRender();
}
function tutQuit(){tut.on=false;tutEl.classList.remove("on");say("Buon vento — sei ai comandi");}
function tutUpdate(dt){
  if(!tut.on)return;
  const st=TUT[tut.i];tut.t+=dt;
  if(st.manual||!st.ok)return;
  if(st.ok()){
    tut.hold+=dt;
    if(tut.hold>=(st.hold||0.4)){say("✓ "+st.ttl);tutNext();}
  }else tut.hold=Math.max(0,tut.hold-dt*1.5);
  const g=document.getElementById("tutgoal");
  if(st.hold&&tut.hold>0.05) g.textContent="▸ "+st.goal+"   ("+Math.max(0,(st.hold-tut.hold)).toFixed(1)+" s)";
  else if(st.goal) g.textContent="▸ "+st.goal;
}
function tutHighlight(){
  if(!tut.on)return;
  const key=TUT[tut.i].hi;if(!key)return;
  // gli aloni inseguono i pannelli: stessa impaginazione, stessa scala
  const box=hudBox(), lato=2*(box.rosa+18);
  const P={
    rose:  [box.rx-box.rosa-18,box.ry-box.rosa-18,lato,lato],
    instr: [10,10,204,134],
    sails: [box.bx-4,box.by-4,box.bw+8,84],
    balance:[box.bx-4,box.by+74,box.bw+8,48],
    rudder:[box.bx-4,box.by+120,box.bw+8,58]
  }[key];
  if(!P)return;
  const p=0.5+0.5*Math.sin(game.t*3.2);
  ctx.save();ctx.scale(box.hs,box.hs);
  ctx.strokeStyle="rgba(226,102,45,"+(0.35+0.5*p).toFixed(2)+")";
  ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.lineDashOffset=-game.t*14;
  ctx.strokeRect(P[0]+.5,P[1]+.5,P[2],P[3]);
  ctx.setLineDash([]);
  ctx.restore();
}
document.getElementById("tutnext").onclick=e=>{e.currentTarget.blur();tutNext();};
document.getElementById("tutskip").onclick=e=>{e.currentTarget.blur();tutNext();};
document.getElementById("tutquit").onclick=e=>{e.currentTarget.blur();tutQuit();};
document.getElementById("tutb").onclick=e=>{e.currentTarget.blur();tutStart();};

/* ══════════════════ loop ══════════════════ */
fillBarche();
newWorld("mantova");
loadLog();
helpEl.classList.add("on");
// su schermo piccolo il menù aperto coprirebbe mezzo mare — in orizzontale
// tutto: si parte col solo ☰, che è dove il telefono se lo aspetta
if(innerWidth<640||innerHeight<560) toggleMenu();
let last=performance.now();
function frame(now){
  let dt=clamp((now-last)/1000,0,0.05);last=now;   // mai negativo: un timestamp anomalo faceva esplodere la fisica
  if(!game.paused && !chart.on && !helpEl.classList.contains("on") && !askEl.classList.contains("on")
     && !logEl.classList.contains("on")){
    const sdt=dt*timeScale;                              // il tempo simulato scorre più in fretta
    game.t+=sdt;
    input(sdt);
    autopilot(sdt);
    updateWind(sdt);
    trimWindows();
    const n=Math.max(2,Math.ceil(sdt/0.02)), sd=sdt/n;   // passi corti: la fisica resta stabile
    for(let i=0;i<n;i++) physics(sd);
    voyUpdate(sdt);
    pianoUpdate();
    tutUpdate(sdt);
    if(game.msgT>0)game.msgT-=dt;                        // gli avvisi durano in tempo reale
  }
  joyVista();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
