/* ==========================================================================
   connections-service.js — Registro final de cada ayuda y métricas.
   `connections` es la tabla de la que salen las cifras de impacto.
   ========================================================================== */

const Connections = (() => {
  async function complete(conn, user, community) {
    const helping = conn.kind === 'helping';
    await Requests.setStatus(conn.id, 'completed');
    DB.unwrap(await DB.client().from('connections').upsert({
      community_id: community.id,
      need_id: conn.needId || null,
      request_id: conn.id,
      requester_id: helping ? conn.residentId : user.id,
      helper_id: helping ? user.id : conn.residentId,
      type: conn.type || 'help'
    }, { onConflict: 'request_id', ignoreDuplicates: true }));
  }

  /* Cifras de la comunidad calculadas en la base con una sola llamada. */
  async function getCommunityStats() {
    const data = DB.unwrap(await DB.client().rpc('community_stats'));
    return data || { completed: 0, reused: 0, food: 0, trips: 0, people: 0, active_helpers: 0, active_requesters: 0, members: 0 };
  }

  return { complete, getCommunityStats };
})();
