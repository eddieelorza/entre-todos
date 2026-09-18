/* Pruebas de Place Capabilities (js/places.js) y su entrada al resolver.
   Uso: node scripts/test-places.mjs
   El lugar también puede ayudar: recepción 24 h, área de paquetes,
   bicicletero, salón común, elevador de carga… */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = resolve(new URL('..', import.meta.url).pathname);

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() };
}

const FILES = [
  'js/data.js', 'js/communities/jacarandas.js', 'js/communities/los-pinos.js', 'js/communities/gracia.js',
  'js/location-service.js', 'js/matching.js', 'js/location-seed.js', 'js/state.js', 'js/verification.js', 'js/trust.js', 'js/places.js', 'js/resolver.js'
];

function makeContext() {
  const window = {};
  const ctx = {
    window,
    document: { readyState: 'complete', addEventListener() {}, querySelector: () => null, head: { appendChild() {} }, dispatchEvent() {} },
    navigator: { geolocation: { getCurrentPosition(ok, fail) { setTimeout(() => fail({ code: 1, message: 'denied' }), 0); } }, permissions: { query: async () => ({ state: 'denied' }) } },
    localStorage: memoryStorage(), sessionStorage: memoryStorage(),
    console, setTimeout, clearTimeout, Date, Math, Number, JSON, Promise, Error, Array, Object, Set, Map, String, Boolean, RegExp, CustomEvent: class {}
  };
  window.localStorage = ctx.localStorage;
  window.sessionStorage = ctx.sessionStorage;
  vm.createContext(ctx);
  for (const f of FILES) {
    const src = readFileSync(resolve(root, f), 'utf8').replace(/^const (\w+) = /m, 'var $1 = window.$1 = ');
    vm.runInContext(src, ctx, { filename: f });
  }
  ctx.State.load();
  return ctx;
}

function run(ctx, text) {
  const { Resolver, State } = ctx;
  const understanding = Resolver.understandSituation(text);
  const needs = Resolver.discoverNeeds(understanding);
  const situation = State.addSituation(text, understanding, needs);
  const result = Resolver.resolve(situation, State.graph());
  return { understanding, needs, result, sol: result.solutions[0] || null, headline: Resolver.headline(result.solutions, understanding, id => State.person(id)) };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('catálogo: cada edificio declara capacidades de lugar distintas', () => {
  const { Places } = makeContext();
  const a = Places.forBuilding('torre-a').map(x => x.type);
  const b = Places.forBuilding('torre-b').map(x => x.type);
  assert.equal(a.join(','), 'reception,packages,bikes');
  assert.equal(b.join(','), 'hall,parking,kids');
  assert.ok(Places.all().length >= 18, `amenities: ${Places.all().length}`);
  assert.equal(Places.distanceLabel(Places.buildingOf('central')), 'tu edificio');
  assert.match(Places.distanceLabel(Places.buildingOf('torre-a')), /^Torre A · \d+ m$/);
});

test('"Llega mi paquete" → recepción / área de paquetes complementan a la persona disponible', () => {
  const ctx = makeContext();
  const r = run(ctx, 'Mañana llega mi paquete entre 2 y 5 y estaré en la oficina.');
  assert.ok(r.sol, 'hay solución');
  assert.equal(r.sol.steps[0] && r.sol.steps[0].personId, 'mariana', 'Mariana sigue recibiendo el paquete');
  const types = r.sol.placeSteps.map(p => p.type);
  assert.ok(types.includes('reception') || types.includes('packages'), `lugares: ${types}`);
  assert.ok(r.sol.placeSteps.every(p => !p.covers), 'el lugar complementa, no sustituye a Mariana');
  assert.match(r.sol.placeSteps[0].because, /Torre A · \d+ m/);
  assert.equal(r.sol.coverage.covered, 1);
});

test('"Necesito espacio para reunirnos" → el salón común cubre la necesidad sin personas', () => {
  const ctx = makeContext();
  const r = run(ctx, 'Necesito un espacio para reunirnos el sábado, somos 20.');
  assert.equal(r.understanding.scenario, 'space');
  assert.ok(r.sol, 'hay solución aunque nadie tenga un salón');
  const cover = r.sol.placeSteps.find(p => p.covers);
  assert.ok(cover && (cover.type === 'hall' || cover.type === 'roof'), `cubre: ${JSON.stringify(r.sol.placeSteps.map(p => [p.type, p.covers]))}`);
  assert.equal(r.sol.gaps.length, 0, 'el espacio ya no es un hueco');
  assert.equal(r.sol.coverage.covered, 1);
  assert.match(r.headline, /El lugar mismo puede resolverlo/);
});

test('"Se me rompió la bici" → el bicicletero ayuda junto a las personas con bici', () => {
  const ctx = makeContext();
  const r = run(ctx, 'Se me rompió la bici y mañana la necesito.');
  const all = r.result.solutions.flatMap(s => s.placeSteps);
  assert.ok(all.some(p => p.type === 'bikes'), `lugares: ${all.map(p => p.type)}`);
  assert.ok(r.result.solutions.every(s => s.steps.length), 'las personas siguen resolviendo');
});

test('"Ayuda para bajar algo pesado" → mismo edificio + elevador de carga + manos', () => {
  const ctx = makeContext();
  const r = run(ctx, 'Necesito ayuda para bajar un ropero pesado el domingo, no puedo solo.');
  assert.equal(r.understanding.scenario, 'moving');
  assert.ok(r.sol && r.sol.steps.length, 'hay manos');
  const lift = r.sol.placeSteps.find(p => p.type === 'elevators');
  assert.ok(lift, `lugares: ${r.sol.placeSteps.map(p => p.type)}`);
  assert.equal(lift.placeId, 'central', 'primero el elevador de tu propio edificio');
  assert.match(lift.because, /tu edificio/);
});

test('privacidad: los lugares nunca traen coordenadas ni departamentos', () => {
  const ctx = makeContext();
  const r = run(ctx, 'Mañana llega mi paquete entre 2 y 5 y estaré en la oficina.');
  r.sol.placeSteps.forEach(p => {
    assert.ok(!/\d+\.\d{3,}/.test(p.because), p.because);
    assert.ok(!/depto|departamento|#\s*\d/i.test(p.because), p.because);
  });
});

let failed = 0;
for (const { name, fn } of tests) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (err) { failed += 1; console.log(`✗ ${name}\n  ${err.message}`); }
}
console.log(failed ? `\n${failed} prueba(s) fallaron` : `\n${tests.length} pruebas pasaron`);
process.exit(failed ? 1 : 0);
