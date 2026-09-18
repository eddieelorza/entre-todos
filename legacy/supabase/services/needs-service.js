/* ==========================================================================
   needs-service.js — Necesidades. Mapea filas de `needs` ↔ `need` (mías) y
   `errand` (pendientes de vecinos: necesidades de tipo `ride` con lugar).
   ========================================================================== */

const Needs = (() => {
  const SCENARIO_TYPE = { package: 'time', mexican: 'object', borrow: 'object', pets: 'help', move: 'help', food: 'food', trip: 'ride', generic: 'help' };

  function typeFor(intent) {
    if (!intent) return 'help';
    if (intent.kind && Resources.KIND_TO_TYPE[intent.kind]) return Resources.KIND_TO_TYPE[intent.kind];
    return SCENARIO_TYPE[intent.scenario] || 'help';
  }

  function toNeed(row) {
    const hasIntent = row.intent && row.intent.mode;
    return {
      id: row.id,
      text: row.raw_input || row.title,
      intent: hasIntent ? row.intent : Matching.interpretNeed(row.raw_input || row.title),
      status: row.status,
      waiting: Boolean(row.waiting),
      createdAt: Date.parse(row.created_at)
    };
  }

  function toErrand(row) {
    return { id: row.id, place: row.place, residentId: row.user_id, text: row.description || row.title, title: row.title };
  }

  /* Mis necesidades + pendientes abiertos (ride) de la comunidad, en una sola consulta. */
  async function listForSession(userId) {
    return DB.unwrap(await DB.client()
      .from('needs')
      .select('id, user_id, type, title, description, raw_input, intent, place, waiting, status, created_at')
      .or(`user_id.eq.${userId},and(type.eq.ride,status.eq.open)`)
      .order('created_at', { ascending: false })
      .limit(200));
  }

  async function create(need, user, community) {
    /* Un viaje ("Voy a IKEA") es efímero: no es una necesidad del usuario. */
    if (!need.intent || need.intent.mode !== 'need') return null;
    const i = need.intent;
    DB.unwrap(await DB.client().from('needs').insert({
      id: need.id,
      user_id: user.id,
      community_id: community.id,
      type: typeFor(i),
      title: i.title || i.needLabel || 'Una pequeña ayuda',
      description: i.context || null,
      raw_input: need.text,
      intent: i,
      status: 'open',
      waiting: false
    }));
  }

  async function update(id, patch) {
    const row = {};
    if (patch.waiting !== undefined) row.waiting = patch.waiting;
    if (patch.status !== undefined) row.status = patch.status;
    if (!Object.keys(row).length) return;
    DB.unwrap(await DB.client().from('needs').update(row).eq('id', id));
  }

  return { listForSession, create, update, toNeed, toErrand, typeFor };
})();
