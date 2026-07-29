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
  if(world.ports) startVoyage(nearestPort(boat.x,boat.y));
  say("Al via da "+(voy?voy.from:"—"));
}
function newWorld(seedStr){
  world=mapMode==="ionio"?ionianWorld():genWorld(seedStr);
  MARK_R=clamp(world.size/130,45,150);
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
  if(k==="p")game.paused=!game.paused;
  if(k==="m")toggleMenu();
  if(k==="l")toggleLog();
  if(k==="c")toggleChart();
  if(k==="0"&&chart.on)chartFit();
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
  if(k===" "){
    if(e.shiftKey){boat.rudderTrim=0;boat.rudderCmd=0;}
    else boat.rudderCmd=boat.rudderTrim;
    if(game.pilot){game.pilot=0;say("Autotimoniere disinserito — "+(boat.rudderTrim?"barra al cavallino":"barra dritta"));}
    else if(e.shiftKey) say("Barra dritta e cavallino azzerato");
    else if(boat.rudderTrim) say("Barra riportata al cavallino — "+barraDesc(boat.rudderTrim));
  }
});
addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=0;});
addEventListener("blur",()=>{for(const k in keys)keys[k]=0;});

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
}
/* Rotelle del mouse: verticale = randa, orizzontale = fiocco.
   Funziona anche con lo scorrimento a due dita del trackpad.        */
let wheelInv=false;
addEventListener("wheel",e=>{
  if(e.target&&e.target.closest&&e.target.closest("#settings,#help,#ask,#tut,#showm"))return;
  if(helpEl.classList.contains("on")||askEl.classList.contains("on"))return;
  e.preventDefault();
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
  if(game.paused||game.auto)return;
  const k=0.06*D2R*(wheelInv?-1:1);
  const dy=e.deltaY*u*k, dx=e.deltaX*u*k;
  const mx=boat.spi?90*D2R:80*D2R;
  if(dy){
    boat.trim=clamp(boat.trim+dy,0,90*D2R);
    if(e.shiftKey) boat.jib=clamp(boat.jib+dy,0,mx);       // shift: le due scotte insieme
  }
  if(dx) boat.jib=clamp(boat.jib+dx,0,mx);
},{passive:false});

if("ontouchstart" in window){
  document.body.classList.add("touch");
  document.querySelectorAll("#touch button").forEach(b=>{
    const k=b.dataset.k.toLowerCase();
    const on=e=>{e.preventDefault();keys[k]=1;}, off=e=>{e.preventDefault();keys[k]=0;};
    b.addEventListener("pointerdown",on);b.addEventListener("pointerup",off);
    b.addEventListener("pointercancel",off);b.addEventListener("pointerleave",off);
  });
}

/* ══════════════════ disegno ══════════════════ */
const cv=document.getElementById("cv"), ctx=cv.getContext("2d");
cv.addEventListener("pointerdown",e=>{ if(chart.on){chart.drag={x:e.offsetX,y:e.offsetY,cx:chart.x,cy:chart.y};cv.setPointerCapture(e.pointerId);} });
cv.addEventListener("pointermove",e=>{
  if(!chart.on)return;
  chart.mx=e.offsetX;chart.my=e.offsetY;
  if(chart.drag){chart.x=chart.drag.cx-(e.offsetX-chart.drag.x)/chart.z;
                 chart.y=chart.drag.cy-(e.offsetY-chart.drag.y)/chart.z;}
});
cv.addEventListener("pointerup",()=>{chart.drag=null;});
cv.addEventListener("pointerleave",()=>{chart.drag=null;chart.mx=0;});
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
    stallo:  ["rgba(226,150,110,.94)","rgba(226,102,45,1)"]
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
    ctx.fillStyle=boat.spiLimp?"rgba(226,140,90,.45)":"rgba(230,126,60,.88)";
    ctx.strokeStyle="rgba(10,36,51,.5)";ctx.lineWidth=0.4;
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

function drawHUD(){
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
  const cxr=VW-102, cyr=102, R=76;
  ctx.save();ctx.translate(cxr,cyr);
  ctx.fillStyle="rgba(8,32,46,.80)";ctx.beginPath();ctx.arc(0,0,R+14,0,TAU);ctx.fill();
  ctx.strokeStyle="rgba(243,234,212,.22)";ctx.lineWidth=1;ctx.stroke();
  // corona graduata orientata a prua
  ctx.save();ctx.rotate(-boat.h);
  for(let a=0;a<360;a+=10){
    const p=dv(a*D2R), big=a%90===0;
    ctx.strokeStyle=big?"rgba(243,234,212,.75)":"rgba(243,234,212,.3)";
    ctx.lineWidth=big?1.6:1;
    ctx.beginPath();ctx.moveTo(p.x*R,p.y*R);ctx.lineTo(p.x*(R-(big?11:6)),p.y*(R-(big?11:6)));ctx.stroke();
  }
  ctx.fillStyle="rgba(243,234,212,.8)";ctx.font="10px ui-monospace,monospace";ctx.textAlign="center";ctx.textBaseline="middle";
  ["N","E","S","W"].forEach((s,i)=>{const p=dv(i*90*D2R);ctx.fillText(s,p.x*(R-22),p.y*(R-22));});
  // freccia vento reale (da dove viene)
  const wp=dv(w.from);
  ctx.strokeStyle=C("--accent");ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(wp.x*(R-2),wp.y*(R-2));ctx.lineTo(wp.x*22,wp.y*22);ctx.stroke();
  ctx.fillStyle=C("--accent");
  const wn=dv(w.from+Math.PI/2);
  ctx.beginPath();ctx.moveTo(wp.x*20,wp.y*20);
  ctx.lineTo(wp.x*34+wn.x*7,wp.y*34+wn.y*7);ctx.lineTo(wp.x*34-wn.x*7,wp.y*34-wn.y*7);ctx.closePath();ctx.fill();
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
  ctx.fillStyle="rgba(243,234,212,.9)";
  ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(6,10);ctx.lineTo(-6,10);ctx.closePath();ctx.fill();
  const bp=dv(boat.boomDraw), jp=dv(boat.jibDraw);
  ctx.lineWidth=2.5;
  ctx.strokeStyle=boat.luff>0.5?C("--warn"):C("--good");
  ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(bp.x*17,-4+bp.y*17);ctx.stroke();
  ctx.lineWidth=1.8;
  ctx.strokeStyle=boat.luffJ>0.5?C("--warn"):C("--good");
  ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(jp.x*13,-18+jp.y*13);ctx.stroke();
  ctx.textBaseline="alphabetic";
  ctx.restore();
  ctx.fillStyle=C("--chart-dim");ctx.font="9px ui-monospace,monospace";ctx.textAlign="center";
  ctx.fillText("VENTO APP "+Math.round(Math.abs(boat.beta*R2D))+"°"+(boat.beta>0?" DRITTA":" SIN"),cxr,cyr+R+30);

  /* ── regolazione / timone / sbandamento, in basso a sinistra */
  const bw=306, bh=178, bx=14, by=VH-bh-14;
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
  const rx=gx+58, rw2=104;
  ctx.strokeStyle="rgba(243,234,212,.25)";ctx.beginPath();
  ctx.moveTo(rx,by+136);ctx.lineTo(rx+rw2,by+136);ctx.stroke();
  ctx.fillStyle="rgba(243,234,212,.25)";ctx.fillRect(rx+rw2/2-.5,by+132,1,8);
  ctx.fillStyle="rgba(243,234,212,.35)";ctx.fillRect(rx+rw2/2+boat.rudderCmd*rw2/2-1,by+129,2,14);
  ctx.fillStyle=C("--chart");ctx.fillRect(rx+rw2/2+boat.rudder*rw2/2-1.5,by+131,3,10);
  // cavallino: il neutro a cui tornano i comandi, sotto la scala
  if(Math.abs(boat.rudderTrim)>0.005){ctx.fillStyle=C("--accent");
    ctx.fillRect(rx+rw2/2+boat.rudderTrim*rw2/2-1,by+143,2,5);}
  label("SBAND.",gx+186,by+140);
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
  /* ── carta ridotta, in basso a destra */
  const ms=168, mx=VW-ms-14, my2=VH-ms-14;
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
  ctx.fillStyle=C("--chart");
  ctx.save();ctx.translate(boat.x,boat.y);ctx.rotate(boat.h);
  const bs=world.size/40;
  ctx.beginPath();ctx.moveTo(0,-bs);ctx.lineTo(bs*0.6,bs*0.73);ctx.lineTo(-bs*0.6,bs*0.73);ctx.closePath();ctx.fill();
  ctx.restore();ctx.restore();

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
    // freccia sul bordo se la boa è fuori campo
    const sx=VW/2+(m.x-cam.x)*game.zoom, sy=VH/2+(m.y-cam.y)*game.zoom;
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
    const tw2=176, tx=14, ty=py+ph+10;
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

  /* ── in panne: istruzioni che restano finché servono */
  if((boat.stuck>2.5||boat.gtime>2.5) && !game.paused){
    const ag=boat.gtime>2.5;
    const pw2=330, px2=VW/2-pw2/2, py2=VH*0.60;
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
    ctx.fillStyle="rgba(8,32,46,.88)";ctx.fillRect(VW/2-tw2/2,VH-64,tw2,30);
    ctx.strokeStyle="rgba(226,102,45,.5)";ctx.strokeRect(VW/2-tw2/2+.5,VH-63.5,tw2-1,29);
    ctx.fillStyle=C("--chart");ctx.fillText(game.msg,VW/2,VH-44);
    ctx.globalAlpha=1;
  }
  if(game.paused){
    ctx.fillStyle="rgba(6,24,35,.55)";ctx.fillRect(0,0,VW,VH);
    ctx.fillStyle=C("--chart");ctx.font="16px ui-monospace,monospace";ctx.textAlign="center";
    ctx.fillText("IN PANNA — premi P per riprendere",VW/2,VH/2);
  }
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
  document.getElementById("tut").style.top=hid?"46px":"58px";
}
document.getElementById("hidem").onclick=e=>{e.currentTarget.blur();toggleMenu();};
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
document.getElementById("easy").onchange=e=>{
  assist=e.target.checked?0.55:1;
  say(e.target.checked?"Mare facile — raffiche e squilibri attenuati":"Mare vero — raffiche piene");
};
document.getElementById("wind").oninput=e=>{
  windBase=parseFloat(e.target.value);
  document.getElementById("windv").textContent=windBase.toFixed(1)+" m/s";
};

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
  for(const L of labels){
    if(L[0]!==null&&L[0]>40&&L[0]<VW-40){ctx.textAlign="center";ctx.fillText(L[2],L[0],14);}
    if(L[1]!==null&&L[1]>20&&L[1]<VH-20){ctx.textAlign="left";ctx.fillText(L[2],6,L[1]);}
  }

  // rosa dei venti con la direzione del vento reale
  const w=windAt(boat.x,boat.y);
  const rx=VW-78, ry=78;
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
  const bx=24, by=VH-38;
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
  ctx.fillText("SCALA DI GIOCO 1:"+SCALE_GEO+"  ·  TRASCINA PER SPOSTARE  ·  ROTELLA PER INGRANDIRE  ·  C CHIUDE  ·  0 INQUADRA TUTTO",24,46);
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
 txt:"Le <b>frecce sinistra e destra</b> muovono la barra, che <b>resta dove la lasci</b>: non torna al centro da sola. Sull'indicatore TIMONE il segno chiaro è dove l'hai messa, quello pieno è dove è arrivata la pala. <b>Spazio</b> la rimette dritta. Per gli aggiustamenti piccoli ci sono <b>,</b> e <b>.</b>, cinque volte più fini: ci torniamo fra poco, perché sono la chiave per non combattere col timone.",
 goal:"Accosta finché la rotta è cambiata di 60°",
 ok:()=>Math.abs(norm(boat.h-tut.mem.h0))>60*D2R},

{ttl:"Regolare le vele",hi:"sails",hold:2.5,
 txt:"Le due barre in basso a sinistra sono la <b>posizione delle scotte</b>: tutta cazzata a sinistra, tutta lascata a destra. La <b>fascia verde</b> è dove la scotta dovrebbe stare adesso. Porta il segno bianco dentro il verde con <b>↑↓</b> per la randa e <b>Q E</b> per il fiocco. Guarda anche le vele: diventano bianche col bordo verde quando sono giuste.",
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
  const P={
    rose:  [VW-196,10,188,188],
    instr: [10,10,204,134],
    sails: [10,VH-196,314,84],
    balance:[10,VH-118,314,48],
    rudder:[10,VH-72,314,58]
  }[key];
  if(!P)return;
  const p=0.5+0.5*Math.sin(game.t*3.2);
  ctx.strokeStyle="rgba(226,102,45,"+(0.35+0.5*p).toFixed(2)+")";
  ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.lineDashOffset=-game.t*14;
  ctx.strokeRect(P[0]+.5,P[1]+.5,P[2],P[3]);
  ctx.setLineDash([]);
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
    tutUpdate(sdt);
    if(game.msgT>0)game.msgT-=dt;                        // gli avvisi durano in tempo reale
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
