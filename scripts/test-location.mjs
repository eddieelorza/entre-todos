/* Pruebas de LocationService + Matching sin navegador.
   Uso: node scripts/test-location.mjs
   Simula window, navigator.geolocation y los storages; carga los módulos
   vanilla en un mismo contexto, igual que lo haría index.html. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = resolve(new URL('..', import.meta.url).pathname);

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() };
}

/* Geolocalización simulada: `geo.mode` decide qué responde el navegador. */
const geo = {
  mode: 'ok',
  position: { coords: { latitude: 19.4000, longitude: -99.1500, accuracy: 25 } },
  calls: 0,
  getCurrentPosition(ok, fail) {
    geo.calls += 1;
    setTimeout(() => {
      if (geo.mode === 'ok') ok(geo.position);
      else if (geo.mode === 'denied') fail({ code: 1, message: 'User denied Geolocation' });
      else fail({ code: 2, message: 'Position unavailable' });
    }, 0);
  }
};

function makeContext() {
  const window = {};
  const ctx = {
    window,
    document: { readyState: 'complete', addEventListener() {}, querySelector: () => null, head: { appendChild() {} }, dispatchEvent() {} },
    navigator: { geolocation: geo, permissions: { query: async () => ({ state: geo.mode === 'denied' ? 'denied' : 'prompt' }) } },
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    console, setTimeout, clearTimeout, Date, Math, Number, JSON, Promise, Error, Array, Object, Set, Map, String, Boolean, CustomEvent: class {}
  };
  window.localStorage = ctx.localStorage;
  window.sessionStorage = ctx.sessionStorage;
  vm.createContext(ctx);
  /* Que `const X = …` a nivel de script sea visible como window.X (como en un navegador). */
  for (const f of ['js/data.js', 'js/location-service.js', 'js/matching.js', 'js/location-seed.js']) {
    const src = readFileSync(resolve(root, f), 'utf8').replace(/^const (\w+) = /m, 'var $1 = window.$1 = ');
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ---- formatDistance ---- */
test('formatDistance: mismo edificio, metros redondeados, km, desconocido', () => {
  const { LocationService: L } = makeContext();
  assert.equal(L.formatDistance(0), 'mismo edificio');
  assert.equal(L.formatDistance(12), 'mismo edificio');
  assert.equal(L.formatDistance(78), '80 m');
  assert.equal(L.formatDistance(119), '120 m');
  assert.equal(L.formatDistance(248), '250 m');
  assert.equal(L.formatDistance(1340), '1.3 km');
  assert.equal(L.formatDistance(null), 'cerca de ti');
  assert.equal(L.formatDistance(undefined, { lang: 'en' }), 'near you');
  assert.equal(L.formatDistance(5, { lang: 'en' }), 'same building');
});

/* ---- calculateDistance ---- */
test('calculateDistance: haversine ≈ 111 m por 0.001° de latitud', () => {
  const { LocationService: L } = makeContext();
  const d = L.calculateDistance({ lat: 19.36, lng: -99.17 }, { lat: 19.361, lng: -99.17 });
  assert.ok(d > 105 && d < 117, `esperaba ~111, obtuve ${d}`);
  assert.equal(L.calculateDistance(null, { lat: 1, lng: 1 }), null);
});

/* ---- Fallbacks sin ubicación ---- */
test('distanceTo: sin GPS ni zona usa la distancia declarada de la semilla', () => {
  const { DATA, Matching } = makeContext();
  const carlos = DATA.people.find(p => p.id === 'carlos');
  assert.equal(Matching.distanceFor(carlos), 120);
});

test('distanceTo: con zona manual mide de zona a zona y misma zona = mismo edificio', () => {
  const { DATA, LocationService: L, Matching } = makeContext();
  L.setZone('torre-b');
  const carlos = DATA.people.find(p => p.id === 'carlos');
  const andrea = DATA.people.find(p => p.id === 'andrea');
  assert.equal(Matching.distanceFor(carlos), 0);
  assert.equal(Matching.distanceLabelFor(carlos), 'mismo edificio');
  const d = Matching.distanceFor(andrea);
  assert.ok(d > 250 && d < 400, `torre-b → andrea ~316 m, obtuve ${d}`);
  assert.equal(L.snapshot().source, 'zone');
  assert.equal(JSON.parse(L.snapshot().hasCoords), false);
});

/* ---- Permiso concedido ---- */
test('getCurrentLocation: concedido → coords en sesión, nunca en localStorage; ancla demo sigue al usuario', async () => {
  geo.mode = 'ok';
  const ctx = makeContext();
  const { DATA, LocationService: L, Matching } = ctx;
  assert.equal(geo.calls, 0, 'no debe pedir ubicación al cargar');
  assert.equal(await L.getLocationPermission(), 'prompt');
  const before = geo.calls;
  const coords = await L.getCurrentLocation();
  assert.equal(geo.calls, before + 1);
  assert.equal(L.snapshot().status, 'granted');
  assert.equal(L.snapshot().source, 'gps');
  assert.ok(!ctx.localStorage.getItem('entre-todos:location'), 'coords no van a localStorage');
  assert.ok(ctx.sessionStorage.getItem('entre-todos:location'), 'coords sí van a sessionStorage');
  /* Demo: reanclamos la comunidad en el usuario y las distancias salen de los offsets. */
  L.setAnchor(coords);
  const carlos = DATA.people.find(p => p.id === 'carlos');
  const d = Matching.distanceFor(carlos);
  assert.ok(d > 110 && d < 130, `carlos a ~119 m, obtuve ${d}`);
  assert.equal(Matching.distanceLabelFor(carlos), '120 m');
  const z = L.nearestZone(coords, DATA.community.zones);
  assert.equal(z && z.id, 'central');
  const s = L.toStorable();
  assert.equal(s.lat, 19.4);
  assert.equal(s.lng, -99.15);
  assert.equal(s.precision_m, 110);
});

/* ---- Permiso negado ---- */
test('getCurrentLocation: negado → rechaza con code denied, recuerda el rechazo y el matching sigue', async () => {
  geo.mode = 'denied';
  const ctx = makeContext();
  const { LocationService: L, Matching } = ctx;
  await assert.rejects(L.getCurrentLocation(), err => err.code === 'denied');
  assert.equal(L.snapshot().status, 'denied');
  assert.equal(L.snapshot().declined, true);
  assert.equal(await L.getLocationPermission(), 'denied');
  const prefs = JSON.parse(ctx.localStorage.getItem('entre-todos:location-prefs'));
  assert.equal(prefs.declined, true);
  const res = Matching.findMatches({ tags: ['paquete'], kinds: ['time'] });
  assert.ok(res.length >= 1, 'demo sigue funcionando sin ubicación');
  assert.ok(res.every(r => typeof r.distanceLabel === 'string'));
  geo.mode = 'ok';
});

/* ---- findMatches ---- */
test('findMatches: disponibilidad por rutinas + evidencia + distancia (paquete el jueves 2–5 PM)', () => {
  const { Matching } = makeContext();
  const thursday = new Date(2026, 8, 24); /* jueves */
  const res = Matching.findMatches({ tags: ['paquete', 'recibir'], kinds: ['time'], when: { date: thursday, from: 14, to: 17 } });
  assert.equal(res.length, 3);
  assert.equal(res[0].person.id, 'mariana', 'Mariana trabaja desde casa los jueves y tiene más evidencia');
  assert.ok(!res.some(r => r.person.id === 'sofia'), 'Sofía solo está por las noches: excluida (needsAvailability)');
  assert.ok(res[0].because[0].startsWith('El jueves y Mariana') || res[0].because[0].includes('jueves'), res[0].because[0]);
  assert.equal(res[0].distanceLabel, 'mismo edificio');
  assert.ok(res[0].because.every(b => !/\d+\.\d{3,}/.test(b)), 'ningún "because" contiene coordenadas');
});

test('findMatches: acepta el when heredado (tags manana/tarde) y devuelve campos de compatibilidad', () => {
  const { Matching } = makeContext();
  const res = Matching.findMatches({ keywords: ['paquete'], when: { tags: ['manana', 'tarde'] }, lang: 'es' });
  assert.ok(res.length > 0);
  assert.ok(res[0].resident && res[0].offer && res[0].reason);
});

test('findMatches: radio máximo excluye lejanos; sin radio los incluye; kinds filtra por tipo', () => {
  const { Matching } = makeContext();
  const near = Matching.findMatches({ tags: ['bici'] }, { radius: 100, limit: null });
  assert.ok(!near.some(r => r.person.id === 'rodrigo'), 'Rodrigo (350 m) fuera de 100 m');
  const all = Matching.findMatches({ tags: ['bici'] }, { radius: null, limit: null });
  assert.ok(all.some(r => r.person.id === 'rodrigo'));
  const onlyContacts = Matching.findMatches({ tags: ['bici'] }, { radius: null, limit: null, kinds: ['contact'] });
  assert.equal(onlyContacts.map(r => r.person.id).join(','), 'rodrigo');
  Matching.setDefaultRadius(100);
  assert.ok(!Matching.findMatches({ tags: ['bici'] }, { limit: null }).some(r => r.person.id === 'rodrigo'));
  Matching.setDefaultRadius(null);
  assert.ok(Matching.findMatches({ tags: ['bici'] }, { limit: null }).some(r => r.person.id === 'rodrigo'));
});

test('findMatches: solo personas de la misma comunidad y nunca el propio usuario', () => {
  const { DATA, Matching } = makeContext();
  const people = DATA.people.concat([{ id: 'x', name: 'X', communityId: 'otra', capabilities: [{ id: 'x-bici', kind: 'object', tags: ['bici'] }], distance: 10 }]);
  const res = Matching.findMatches({ tags: ['bici'] }, { people, radius: null, limit: null });
  assert.ok(!res.some(r => r.person.id === 'x'));
  const mine = Matching.findMatches({ tags: ['plantas'] }, { people: people.concat([DATA.user]), radius: null, limit: null });
  assert.ok(!mine.some(r => r.person.id === 'eddie'));
});

test('nearestPeople: ordena por cercanía usando el fallback de la semilla', () => {
  const { Matching } = makeContext();
  const list = Matching.nearestPeople();
  assert.equal(list[0].distance, 0);
  for (let i = 1; i < list.length; i += 1) assert.ok(list[i].distance >= list[i - 1].distance);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`✗ ${name}\n  ${err.message}`);
  }
}
console.log(failed ? `\n${failed} prueba(s) fallaron` : `\n${tests.length} pruebas pasaron`);
process.exit(failed ? 1 : 0);
