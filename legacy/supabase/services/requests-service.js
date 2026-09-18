/* ==========================================================================
   requests-service.js — Solicitudes entre vecinos.
   Una fila de `requests` se ve en la app como una `connection` activa:
   kind = request (yo pido) | helping (yo ayudo), según quién soy en la fila.
   ========================================================================== */

const Requests = (() => {
  const SELECT = 'id, need_id, requester_id, helper_id, resource_id, message, status, created_at, updated_at, need:needs(id, title, type, intent, user_id, place), resource:resources(id, title, type, icon)';

  function toConnection(row, me) {
    const mine = row.requester_id === me;
    const need = row.need || {};
    const intent = need.intent || {};
    const resource = row.resource || {};
    let status = row.status === 'pending' ? 'sent' : row.status;
    if (row.status === 'completed' && mine && intent.doneStatus === 'returned') status = 'returned';
    return {
      id: row.id,
      kind: mine ? 'request' : 'helping',
      status,
      needId: row.need_id,
      errandId: mine ? undefined : row.need_id,
      residentId: mine ? row.helper_id : row.requester_id,
      offerId: row.resource_id || undefined,
      title: (mine && intent.title) || need.title || resource.title || 'Una ayuda',
      icon: intent.icon || resource.icon || (need.type === 'ride' ? '🛒' : '🤝'),
      message: row.message || '',
      when: (intent.when && intent.when.short) || '',
      completeLabel: mine ? intent.completeLabel : undefined,
      doneStatus: mine ? intent.doneStatus : undefined,
      type: need.type || resource.type || 'help',
      createdAt: Date.parse(row.created_at),
      updatedAt: Date.parse(row.updated_at)
    };
  }

  async function listMine() {
    return DB.unwrap(await DB.client()
      .from('requests')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(200));
  }

  async function create(conn, user) {
    const helping = conn.kind === 'helping';
    DB.unwrap(await DB.client().from('requests').insert({
      id: conn.id,
      need_id: helping ? (conn.errandId || conn.needId) : conn.needId,
      requester_id: helping ? conn.residentId : user.id,
      helper_id: helping ? user.id : conn.residentId,
      resource_id: conn.offerId || null,
      message: conn.message || null,
      status: conn.status === 'accepted' ? 'accepted' : 'pending'
    }));
  }

  async function setStatus(id, status) {
    DB.unwrap(await DB.client().from('requests').update({ status }).eq('id', id));
  }

  const accept = id => setStatus(id, 'accepted');
  const decline = id => setStatus(id, 'declined');
  const cancel = id => setStatus(id, 'cancelled');

  return { listMine, create, accept, decline, cancel, setStatus, toConnection };
})();
