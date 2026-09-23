/* Pruebas simuladas del pipeline Situación → Solución, sin navegador.
   Uso:  node scripts/test-resolver.mjs          (tabla en consola, sale con 1 si algo falla)
         node scripts/test-resolver.mjs --md     (además imprime la tabla en Markdown)
         node scripts/test-resolver.mjs --json   (además imprime el detalle en JSON)

   Carga los módulos vanilla en un mismo contexto (como index.html) y corre las
   nueve historias de la demo en Residencial Jacarandas, la misma frase en las
   tres comunidades, y las reglas de confianza y privacidad. Nadie responde de
   verdad: aquí solo se prueba lo que el sistema entiende, detecta y arma. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const args = new Set(process.argv.slice(2));

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() };
}

const FILES = [
  'js/data.js', 'js/communities/jacarandas.js', 'js/communities/los-pinos.js', 'js/communities/gracia.js',
  'js/location-service.js', 'js/matching.js', 'js/location-seed.js', 'js/state.js', 'js/verification.js', 'js/trust.js', 'js/places.js', 'js/resolver.js'
];

function makeContext(communityId) {
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
  if (communityId) ctx.localStorage.setItem('entre-todos:community', communityId);
  ctx.State.load();
  return ctx;
}

/* Corre el pipeline completo para una frase, igual que Forms.situation + Views.situation. */
function run(ctx, text) {
  const { Resolver, State } = ctx;
  const understanding = Resolver.understandSituation(text);
  const needs = Resolver.discoverNeeds(understanding);
  const situation = State.addSituation(text, understanding, needs);
  const result = Resolver.resolve(situation, State.graph());
  const sol = result.solutions[0] || null;
  const headline = understanding.kind === 'need' ? Resolver.headline(result.solutions, understanding, id => State.person(id)) : null;
  const name = id => (State.person(id) || { name: id }).name;
  return {
    text, understanding, needs, situation, result, sol, headline,
    people: sol ? sol.people.map(name) : [],
    extras: sol ? sol.extraPeople.map(name) : [],
    coverage: sol ? `${sol.coverage.covered}/${sol.coverage.total}` : '',
    gaps: sol ? sol.gaps : [],
    strategies: result.solutions.map(s => s.label),
    opportunities: result.opportunities.map(o => `${name(o.personId)}: ${o.title}`)
  };
}

const cases = [];
const add = (community, label, text, expect) => cases.push({ community, label, text, expect });

/* ---- Las nueve historias de la demo (Jacarandas) ---- */
add('jacarandas', 'Recibir un paquete', 'Mañana llega mi paquete entre 2 y 5 y estaré en la oficina.', r => [
  ['escenario package', r.understanding.scenario === 'package'],
  ['entiende la ventana de mañana 2–5 PM', r.understanding.when.offset === 1 && r.understanding.when.from === 14 && r.understanding.when.to === 17],
  ['una sola persona', r.people.length === 1],
  /* Si mañana es martes o jueves manda la rutina de home office; si no, la disponibilidad que Mariana confirmó. Nunca un anuncio. */
  ['la razón es una rutina o disponibilidad confirmada, no un anuncio', ['routine', 'declared'].includes(r.sol.steps[0].slotSource)],
  ['titular "desde tu mismo edificio"', /desde tu mismo edificio/.test(r.headline)]
]);
add('jacarandas', 'Noche Mexicana (inglés)', "I'm from China and I've been invited to a Mexican Independence Day party. I don't know what to wear or bring.", r => [
  ['detecta inglés', r.understanding.lang === 'en'],
  ['detecta origen (China → mandarín)', Array.isArray(r.understanding.originTags) && r.understanding.originTags.includes('mandarin')],
  ['solución compuesta con 3 personas', r.people.length === 3],
  ['extra: alguien que habla su idioma', r.needs.some(n => n.recurring) && (r.extras.length > 0 || r.people.length > 3)],
  ['titular en inglés', /^We found a solution using \d people/.test(r.headline)]
]);
add('jacarandas', 'Carne asada para 12', 'Voy a hacer una carne asada para 12 personas el sábado.', r => [
  ['escenario gathering, escala 12', r.understanding.scenario === 'gathering' && r.understanding.scale === 12],
  ['detecta 8 necesidades no escritas', r.needs.length === 8],
  ['cubre 7 de 8', r.coverage === '7/8'],
  ['el hueco honesto es el carbón', r.gaps.length === 1 && r.gaps[0] === 'charcoal'],
  ['seis personas distintas', new Set(r.people).size === 6],
  ['titular "7 de las 8 cosas"', /7 de las 8 cosas/.test(r.headline)]
]);
add('jacarandas', 'Bici rota', 'Se me rompió la bici y mañana la necesito.', r => [
  ['escenario bike', r.understanding.scenario === 'bike'],
  ['tres estrategias distintas', r.strategies.length === 3],
  ['ninguna implica comprar', r.result.solutions.every(s => !s.gaps.length)],
  ['titular "3 formas"', /Hay 3 formas de resolverlo/.test(r.headline)]
]);
add('jacarandas', 'Voy a IKEA', 'Voy a IKEA mañana.', r => [
  ['es una oportunidad, no una necesidad', r.understanding.kind === 'opportunity' && r.understanding.place === 'ikea'],
  ['sin necesidades propias', r.needs.length === 0],
  ['dos vecinos esperan algo de IKEA', r.opportunities.length === 2]
]);
add('jacarandas', 'Acompañar a mi mamá', 'Mi mamá necesita ir al doctor mañana a las 10 y no tengo quién la acompañe.', r => [
  ['perfil care, sensible', r.understanding.profile === 'care' && r.understanding.sensitive === true],
  ['entiende mañana a las 10', r.understanding.when.offset === 1 && r.understanding.when.from === 10],
  ['dos necesidades: coche y compañía', r.needs.length === 2 && r.coverage === '2/2'],
  ['todos con identidad y residencia verificadas', r.sol.people.every(id => { const v = r.ctx.Verification.of(r.ctx.State.person(id)); return v.identity === 'verified' && v.community === 'verified'; })],
  ['titular "Gente en la que ya confías"', /Gente en la que ya confías/.test(r.headline)]
]);
add('jacarandas', 'Disfraz de astronauta', 'Mis hijos necesitan disfraz de astronauta para mañana.', r => [
  ['escenario costume, perfil family', r.understanding.scenario === 'costume' && r.understanding.profile === 'family'],
  ['varias familias', r.people.length >= 2],
  ['cobertura completa', r.sol.coverage.covered === r.sol.coverage.total],
  ['titular "sin comprar uno nuevo"', /sin comprar uno nuevo/.test(r.headline)]
]);
add('jacarandas', 'Vestido para una boda', 'Necesito un vestido largo talla M para una boda este sábado.', r => [
  ['escenario garment, talla M', r.understanding.scenario === 'garment' && r.understanding.size === 'M'],
  ['look armado entre varias personas', r.people.length >= 2],
  ['titular "look completo"', /look completo/.test(r.headline)]
]);
add('jacarandas', 'Hoy necesito ride', 'Hoy necesito ride al sur a las 8.', r => [
  ['escenario ride, hoy a las 8', r.understanding.scenario === 'ride' && r.understanding.when.offset === 0],
  ['una persona con trayecto compatible', r.people.length === 1 && r.coverage === '1/1']
]);

/* ---- Community Simulation Layer: la misma frase en tres comunidades ---- */
const SAME = 'Voy a hacer una comida para 10 personas el sábado.';
add('jacarandas', 'Comida para 10 · Jacarandas', SAME, r => [
  ['necesidades: mesa, sillas, bocina, manos', ['table', 'chairs', 'speaker', 'prep'].every(id => r.needs.some(n => n.id === id))],
  ['cobertura completa', r.sol.coverage.covered === r.sol.coverage.total]
]);
add('los-pinos', 'Comida para 10 · Los Pinos', SAME, r => [
  ['la estructura suprime la bocina', !r.needs.some(n => n.id === 'speaker')],
  ['la estructura inyecta necesidades propias del lugar', r.needs.some(n => n.recurring)],
  ['hay solución', Boolean(r.sol) && r.sol.steps.length >= 3]
]);
add('gracia', 'Comida para 10 · Gràcia', SAME, r => [
  ['la estructura suprime la bocina', !r.needs.some(n => n.id === 'speaker')],
  ['inyecta ingredientes / alguien local', r.needs.some(n => n.recurring)],
  ['hay solución', Boolean(r.sol) && r.sol.steps.length >= 3]
]);
add('gracia', 'Trámite del NIE · Gràcia', 'Necesito sacar el NIE y no sé por dónde empezar.', r => [
  ['escenario paperwork', r.understanding.scenario === 'paperwork'],
  ['alguien que ya pasó por el trámite', r.people.length >= 1 && r.sol.steps.some(s => s.needId === 'guide')]
]);
add('los-pinos', 'Foco fundido · Los Pinos', 'Se fundió el foco de la cocina y no alcanzo.', r => [
  ['escenario household', r.understanding.scenario === 'household'],
  ['alguien que sabe y una escalera', r.sol.steps.some(s => s.needId === 'fixer')]
]);

/* ---- Reglas transversales ---- */
add('jacarandas', 'Frase fuera de guion', 'Necesito un taladro para colgar una repisa.', r => [
  ['cae en un escenario conocido o en el genérico, nunca en vacío', r.needs.length >= 1],
  ['encuentra al menos una persona', r.people.length >= 1]
]);
add('jacarandas', 'Privacidad en el mensaje', 'Mañana llega mi paquete entre 2 y 5 y estaré en la oficina.', r => {
  const msg = r.ctx.Resolver.buildMessage(r.understanding, r.needs, r.ctx.State.person(r.sol.people[0]));
  return [
    ['el mensaje se dirige a la persona con contexto', /^Hola \w+ 👋 .+ ¿Podrías recibirlo por mí\?$/.test(msg)],
    ['nunca incluye departamento, teléfono ni dirección', !/(depto|departamento|tel|\+52|\d{2,3}-\d{3})/i.test(msg)]
  ];
});
add('jacarandas', 'Confianza no rompe el matching', 'Se me rompió la bici y mañana la necesito.', r => {
  const repair = r.result.solutions.find(s => s.key === 'repair');
  const mech = repair && repair.steps.find(s => s.needId === 'mechanic');
  const p = mech && r.ctx.State.person(mech.personId);
  return [['el mecánico gana por capacidad, no por relación previa', Boolean(p) && p.capabilities.some(c => c.tags.includes('reparar-bici'))]];
});

/* ---- Ejecutar ---- */
const rows = [];
let failed = 0;
for (const c of cases) {
  const ctx = makeContext(c.community);
  const r = run(ctx, c.text);
  r.ctx = ctx;
  const checks = c.expect(r);
  const ok = checks.every(([, pass]) => pass);
  if (!ok) failed += 1;
  rows.push({ ...c, r, checks, ok });
}

const communityName = id => ({ jacarandas: 'Jacarandas', 'los-pinos': 'Los Pinos', gracia: 'Gràcia' })[id];
const summary = r => r.understanding.kind !== 'need'
  ? `Oportunidad · ${r.opportunities.length} vecinos: ${r.opportunities.join(' · ')}`
  : `${r.headline} → ${r.people.join(', ')}${r.extras.length ? ` (+ ${r.extras.join(', ')})` : ''}`;

for (const row of rows) {
  console.log(`${row.ok ? '✅' : '❌'} ${row.label} [${communityName(row.community)}]`);
  console.log(`   "${row.text}"`);
  console.log(`   ${summary(row.r)}`);
  row.checks.forEach(([name, pass]) => console.log(`   ${pass ? '  ✓' : '  ✗'} ${name}`));
}
const total = rows.reduce((n, r) => n + r.checks.length, 0);
const passed = rows.reduce((n, r) => n + r.checks.filter(([, p]) => p).length, 0);
console.log(`\n${rows.length - failed}/${rows.length} historias · ${passed}/${total} comprobaciones`);

if (args.has('--md')) {
  console.log('\n| Historia | Comunidad | Necesidades | Cobertura | Personas | Comprobaciones |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const r = row.r;
    const people = r.understanding.kind !== 'need' ? r.opportunities.join(' · ') : r.people.join(', ') + (r.extras.length ? ` (+${r.extras.join(', ')})` : '');
    const cov = r.understanding.kind !== 'need' ? `${r.opportunities.length} oportunidades` : (r.strategies.length > 1 ? `${r.strategies.length} estrategias` : r.coverage);
    console.log(`| ${row.label} | ${communityName(row.community)} | ${r.needs.length} | ${cov} | ${people} | ${row.checks.filter(([, p]) => p).length}/${row.checks.length} ${row.ok ? '✅' : '❌'} |`);
  }
}

if (args.has('--json')) {
  console.log(JSON.stringify(rows.map(row => ({
    label: row.label, community: row.community, text: row.text, ok: row.ok,
    scenario: row.r.understanding.scenario, kind: row.r.understanding.kind, lang: row.r.understanding.lang,
    headline: row.r.headline, needs: row.r.needs.map(n => n.id), coverage: row.r.coverage, gaps: row.r.gaps,
    people: row.r.people, extras: row.r.extras, strategies: row.r.strategies, opportunities: row.r.opportunities,
    checks: row.checks
  })), null, 2));
}

process.exit(failed ? 1 : 0);
