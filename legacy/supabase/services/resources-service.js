/* ==========================================================================
   resources-service.js — Recursos: lo que un vecino puede ofrecer.
   Mapea filas de `resources` ↔ `offer` (de otros) y `shared` (míos).
   ========================================================================== */

const Resources = (() => {
  const TYPE_TO_KIND = { object: 'objeto', food: 'comida', time: 'tiempo', knowledge: 'conocimiento', help: 'ayuda', ride: 'ayuda' };
  const KIND_TO_TYPE = { objeto: 'object', comida: 'food', tiempo: 'time', conocimiento: 'knowledge', ayuda: 'help' };
  const ACTION_FOR = { object: 'borrow', food: 'take', knowledge: 'ask', time: 'help', help: 'help', ride: 'help' };

  const ASK = {
    borrow: t => `¿Me prestarías ${t} un rato?`,
    take: t => `¿Me podrías compartir un poco de ${t}?`,
    ask: () => '¿Me ayudarías con una duda?',
    help: () => '¿Crees que podrías ayudarme?'
  };
  const ASK_EN = {
    borrow: t => `Could I borrow ${t} for a bit?`,
    take: t => `Could you share some ${t} with me?`,
    ask: () => 'Could you help me with a question?',
    help: () => 'Do you think you could help me?'
  };
  const REASON = {
    borrow: t => `Tiene ${t} y puede prestarlo.`,
    take: t => `Tiene ${t} para compartir.`,
    ask: t => `Puede ayudarte: ${t}.`,
    help: t => `Puede ayudarte: ${t}.`
  };

  function lower(title) {
    const t = String(title || '');
    return t.charAt(0).toLowerCase() + t.slice(1);
  }

  /* Etiquetas de disponibilidad para el matching, derivadas del texto libre. */
  function availTags(text) {
    const t = Matching.normalize(text);
    const tags = [];
    if (/\bhoy\b|esta tarde|ahorita/.test(t)) tags.push('hoy');
    if (/\bmanana\b/.test(t) && !/por la manana|mananas|manana temprano/.test(t)) tags.push('manana');
    if (/tarde|despues de las/.test(t)) tags.push('tarde');
    if (/noche/.test(t)) tags.push('noche');
    if (/por la manana|mananas|temprano/.test(t)) tags.push('am');
    if (/fin de semana|fines de semana|sabado|domingo/.test(t)) tags.push('finde');
    return tags.length ? tags : ['any'];
  }

  function toOffer(row) {
    const kind = TYPE_TO_KIND[row.type] || 'ayuda';
    const action = ACTION_FOR[row.type] || 'help';
    const t = lower(row.title);
    return {
      id: row.id,
      ownerId: row.owner_id,
      kind, action,
      icon: row.icon || DATA.kinds[kind].icon,
      title: row.title,
      keywords: row.keywords || [],
      availTags: availTags(row.availability),
      availability: row.availability || 'Por confirmar',
      reason: row.description || REASON[action](t),
      ask: ASK[action](t),
      askEn: ASK_EN[action](t),
      nearby: true
    };
  }

  function toShared(row) {
    const kind = TYPE_TO_KIND[row.type] || 'ayuda';
    return {
      id: row.id,
      title: row.title,
      kind,
      icon: row.icon || DATA.kinds[kind].icon,
      type: DATA.kinds[kind].type,
      keywords: row.keywords || [],
      availability: row.availability || 'Por confirmar',
      action: ACTION_FOR[row.type] || 'help',
      createdAt: Date.parse(row.created_at)
    };
  }

  async function listCommunity(communityId) {
    return DB.unwrap(await DB.client()
      .from('resources')
      .select('id, owner_id, type, title, description, icon, keywords, availability, created_at')
      .eq('community_id', communityId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(500));
  }

  async function create(shared, user, community) {
    DB.unwrap(await DB.client().from('resources').insert({
      id: shared.id,
      owner_id: user.id,
      community_id: community.id,
      type: KIND_TO_TYPE[shared.kind] || 'help',
      title: shared.title,
      icon: shared.icon || null,
      keywords: shared.keywords || [],
      availability: shared.availability || null,
      status: 'active'
    }));
  }

  async function archive(id) {
    DB.unwrap(await DB.client().from('resources').update({ status: 'archived' }).eq('id', id));
  }

  return { listCommunity, create, archive, toOffer, toShared, KIND_TO_TYPE, TYPE_TO_KIND };
})();
