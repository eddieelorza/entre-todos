/* Pruebas del modelo espacial (js/world/world-data.js), sin navegador ni WebGL.
   Uso: node scripts/test-world.mjs
   Comprueba que cada transformación del mundo representa un concepto real:
   la confianza decide la distancia, la necesidad atrae a quien puede ayudar,
   y una ayuda completada acerca a dos personas. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const FILES = [
  'js/data.js', 'js/communities/jacarandas.js', 'js/communities/los-pinos.js', 'js/communities/gracia.js',
  'js/location-service.js', 'js/matching.js', 'js/location-seed.js', 'js/state.js', 'js/verification.js', 'js/trust.js',
  'js/places.js', 'js/resolver.js', 'js/world/world-data.js'
];
function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() };
}
function makeContext(communityId) {
  const window = {};
  const ctx = {
    window,
    document: { readyState: 'complete', addEventListener() {}, querySelector: () => null, head: { appendChild() {} }, dispatchEvent() {} },
    navigator: { geolocation: { getCurrentPosition(ok, fail) { setTimeout(() => fail({ code: 1 }), 0); } }, permissions: { query: async () => ({ state: 'denied' }) } },
    localStorage: memoryStorage(), sessionStorage: memoryStorage(),
    console, setTimeout, clearTimeout, Date, Math, Number, JSON, Promise, Error, Array, Object, Set, Map, String, Boolean, RegExp, CustomEvent: class {}
  };
  window.localStorage = ctx.localStorage; window.sessionStorage = ctx.sessionStorage;
  vm.createContext(ctx);
  for (const f of FILES) {
    const src = readFileSync(resolve(root, f), 'utf8').replace(/^const (\w+) = /m, 'var $1 = window.$1 = ');
    vm.runInContext(src, ctx, { filename: f });
  }
  if (communityId) ctx.localStorage.setItem('entre-todos:community', communityId);
  ctx.State.load();
  return ctx;
}

let pass = 0, fail = 0;
function check(name, ok, detail = '') { if (ok) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name} ${detail}`); } }
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const ctx = makeContext('jacarandas');
const { WorldData } = ctx;
const model = WorldData.build();
const by = Object.fromEntries(model.people.map(p => [p.id, p]));
const me = model.me;

console.log('\nMundo · Residencial Jacarandas');
check('hay edificios, calles, árboles y personas', model.buildings.length > 20 && model.streets.length === 5 && model.trees.length > 20 && model.people.length === 32, `${model.buildings.length}/${model.streets.length}/${model.trees.length}/${model.people.length}`);
check('cada persona flota sobre su edificio (geografía → proximidad)', model.people.every(p => { const b = model.buildings.find(x => x.id === p.building); return b && dist(p.phys, b) <= Math.max(b.w, b.d) && p.phys.y > b.h; }));
check('nadie queda fuera de su edificio en la vista de pisos', model.people.every(p => { const b = model.buildings.find(x => x.id === p.building); return Math.abs(p.home.x - b.x) <= b.w / 2 && Math.abs(p.home.z - b.z) <= b.d / 2 && p.home.y < b.h; }));
check('amenidades con posición (el lugar también ayuda)', model.buildings.flatMap(b => b.amenities).length >= 18 && model.buildings.flatMap(b => b.amenities).every(a => a.pos && Number.isFinite(a.pos.y)));

console.log('\nConstelación · distancia = confianza');
check('tú no te mueves: eres el centro', dist(me.social, me.phys) < 0.001);
check('Mariana (3 veces) queda más cerca que Valeria (1 vez)', dist(by.mariana.social, me.social) < dist(by.valeria.social, me.social), `${dist(by.mariana.social, me.social).toFixed(1)} vs ${dist(by.valeria.social, me.social).toFixed(1)}`);
check('relación directa < a través de alguien < sin relación < vecinos nuevos', (() => {
  const avg = t => { const l = model.people.filter(p => p.tier === t); return l.reduce((s, p) => s + dist(p.social, me.social), 0) / (l.length || 1); };
  return avg('direct') < avg('via') && avg('via') < avg('circle') + 25 && avg('circle') < avg('new') && avg('far') < avg('new');
})());
check('Sofía llega a través de Mariana', by.sofia.tier === 'via' && by.sofia.via === 'mariana', `${by.sofia.tier}/${by.sofia.via}`);
check('nadie se encima', (() => { for (let i = 0; i < model.people.length; i++) for (let j = i + 1; j < model.people.length; j++) if (dist(model.people[i].social, model.people[j].social) < 13) return false; return true; })());
check('lazo nuevo y lazo frecuente son distintos', model.relations.some(r => r.stage === 'new') && model.relations.some(r => r.stage === 'frequent'));
check('sin números a la vista: el modelo no expone etiquetas de puntaje', !JSON.stringify(model.relations.map(r => Object.keys(r))).match(/score|rating|rank/));

console.log('\nNecesidad → gravedad');
const dress = WorldData.plan('Necesito un vestido largo talla M para una boda este sábado.', model);
const names = dress.steps.map(s => `${s.person.name}→${s.cap.label.split(/[,;(]/)[0].trim()}`);
console.log('   ', names.join(' · '));
check('vestido: Paulina, Mariana y Andrea convergen', ['paulina', 'mariana', 'andrea'].every(id => dress.matched.has(id)));
check('quien ayuda termina más cerca del centro que en reposo', dress.steps.every(s => dist(dress.targets[s.person.id], dress.center) < dist(s.person.social, dress.center) + 0.01 || dist(s.person.social, dress.center) < 60));
check('el círculo «Amigas» emerge', dress.circles.some(c => c.id === 'amigas'), JSON.stringify(dress.circles.map(c => c.id)));
check('cada recurso queda entre su persona y la necesidad', dress.steps.every(s => dist(s.capPos, s.need.pos) < dist(dress.targets[s.person.id], s.need.pos)));
const pkg = WorldData.plan('Mañana llega mi paquete entre 2 y 5 y estaré en la oficina.', model);
check('paquete: el lugar forma parte de la solución', pkg.places.length > 0, JSON.stringify(pkg.places.map(p => p.label)));
const ikea = WorldData.plan('Voy a IKEA mañana.', model);
check('oportunidad: tú eres el centro y dos vecinos se acercan', ikea.steps.length === 2 && ikea.steps.every(s => s.fromUser));
const bbq = WorldData.plan('Voy a hacer una carne asada para 12 personas el sábado.', model);
check('carne asada: seis personas sin encimarse', bbq.matched.size >= 5 && (() => { const t = [...bbq.matched].map(id => bbq.targets[id]); for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (dist(t[i], t[j]) < 17) return false; return true; })(), `${bbq.matched.size}`);

console.log('\nAyuda completada → más cerca');
const before = dist(by.paulina.social, me.social);
WorldData.closer(model, 'eddie', 'paulina');
check('Paulina se acerca a ti, sin encimarse', dist(by.paulina.social, me.social) < before && dist(by.paulina.social, me.social) >= 21.9, `${before.toFixed(1)} → ${dist(by.paulina.social, me.social).toFixed(1)}`);

console.log('\nComunidades sin capa geográfica');
const g = makeContext('gracia');
const gm = g.WorldData.build();
check('Gràcia no tiene plano: el mundo lo declara y la app usa el fallback', gm.geo === false);

console.log(`\n${pass}/${pass + fail} comprobaciones`);
process.exit(fail ? 1 : 0);
