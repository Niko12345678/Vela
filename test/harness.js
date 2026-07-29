/* Fa girare il gioco vero, intero, dentro Node.
 *
 * Non è un mock della fisica: è il file di gioco reale, eseguito contro un
 * canvas e un DOM finti. Quindi il collaudo esercita davvero il disegno,
 * l'interfaccia e il ciclo principale, ed è così che sono venuti fuori tre
 * bug che a leggere il codice non si vedevano (lo smorzamento non
 * normalizzato sul passo, il dt negativo, una temporal dead zone).
 *
 * Uso:
 *   const r = await runInGame(`
 *     newWorld("x");
 *     report({ isole: world.islands.length });
 *   `);
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const GAME = join(here, "..", "src", "legacy", "game.js");
const CARTA = join(here, "..", "src", "data", "ionian.json");

const STUB = `
const __el = () => ({
  style: {}, dataset: {}, textContent: "", innerHTML: "", value: "7", checked: true,
  width: 0, height: 0,
  classList: {
    _s: new Set(),
    add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); },
    contains(c){ return this._s.has(c); },
    toggle(c, f){ const has = this._s.has(c);
      const want = f === undefined ? !has : f;
      want ? this._s.add(c) : this._s.delete(c); return want; }
  },
  addEventListener(){}, removeEventListener(){}, appendChild(){},
  querySelectorAll(){ return []; }, focus(){}, blur(){},
  getContext(){ return __ctx; }
});
const __els = {};
const __ctx = new Proxy({}, {
  get(t, k){
    if (k === "measureText") return () => ({ width: 40 });
    if (k === "createRadialGradient" || k === "createLinearGradient")
      return () => ({ addColorStop(){} });
    if (typeof k === "string" && k in t) return t[k];
    return () => {};
  },
  set(t, k, v){ t[k] = v; return true; }
});
globalThis.document = {
  createElement: __el,
  getElementById: id => __els[id] || (__els[id] = __el()),
  querySelectorAll: () => [],
  body: { classList: { add(){}, remove(){} } },
  documentElement: {}
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "#ffffff" });
globalThis.addEventListener = () => {};
globalThis.innerWidth = 1440;
globalThis.innerHeight = 820;
globalThis.devicePixelRatio = 1;
globalThis.window = globalThis.window || {};
globalThis.localStorage = {
  _d: {},
  getItem(k){ return this._d[k] ?? null; },
  setItem(k, v){ this._d[k] = String(v); },
  removeItem(k){ delete this._d[k]; }
};
let __raf = null;
globalThis.requestAnimationFrame = f => { __raf = f; };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
`;

/* Avanza di un fotogramma reale (16,7 ms di orologio).
   Il gioco applica poi la sua scala temporale interna. */
const DRIVER = `
let __now = performance.now();
// il gioco definisce già una funzione frame(): qui si chiama tick()
const tick = (n = 1) => { for (let i = 0; i < n; i++) { __now += 16.7; __raf(__now); } };
const seconds = s => tick(Math.round(s * 60));
`;

export function runInGame(probe, { timeoutMs = 120000 } = {}) {
  const game = readFileSync(GAME, "utf8");
  // La carta la passa l'host, come fa src/main.js nel browser: game.js non
  // può importarla da sé, qui gira dentro una new Function.
  const carta = `globalThis.VELA_CARTE={ionio:${readFileSync(CARTA, "utf8")}};`;
  const src = `${STUB}\n${carta}\n${game}\n${DRIVER}\n${probe}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe scaduta")), timeoutMs);
    let done = false;
    const report = v => {
      if (done) return;
      done = true; clearTimeout(timer); resolve(v);
    };
    try {
      // eslint-disable-next-line no-new-func
      new Function("report", "reject", src)(report, e => { clearTimeout(timer); reject(e); });
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}

/* Porta la barca a regime a un dato angolo dal vento, a rotta bloccata. */
export const STEADY = `
function steady(twaDeg, { wind = 7, spi = false, reef = 0, seconds = 90 } = {}) {
  windBase = wind; windDirBase = 0; gusts = []; streaks = [];
  boat.x = 0; boat.y = 0; boat.vx = 0; boat.vy = 0; boat.h = twaDeg * D2R;
  boat.heel = 0; boat.yawRate = 0; boat.stuck = 0; boat.gtime = 0;
  boat.jibBack = false; boat.jibFurled = spi; boat.spi = spi; boat.reef = reef;
  game.auto = true; game.pilot = 0; game.t = 0; game.msgT = 99;
  for (let i = 0; i < seconds * 50; i++) {
    const h = boat.h; trimWindows(); physics(0.02); boat.h = h;
  }
  return Math.hypot(boat.vx, boat.vy) * 1.94384;
}
`;
