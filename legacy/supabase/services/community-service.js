/* ==========================================================================
   community-service.js — Comunidad y directorio de vecinos.

   loadSnapshot() descarga todo lo que la sesión necesita (una sola vez) y lo
   devuelve con las mismas formas que usa el modo demo, para que State y las
   vistas no distingan de dónde vienen los datos.
   ========================================================================== */

const Community = (() => {
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 1).toUpperCase();
  }

  function tone(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return (h % 5) + 1;
  }

  function memberSince(iso) {
    const d = iso ? new Date(iso) : new Date();
    return `Miembro desde ${MONTHS[d.getMonth()]}`;
  }

  function toResident(p) {
    return {
      id: p.id,
      name: p.display_name,
      initials: initials(p.display_name),
      tone: tone(p.id),
      place: p.approx_location || '',
      distance: p.approx_distance_m || 0,
      completed: p.helps_completed || 0,
      isDemo: Boolean(p.is_demo),
      verified: Boolean(p.verified_resident),
      offers: []
    };
  }

  function toUser(p, authUser) {
    const base = toResident(p);
    return Object.assign(base, {
      email: authUser.email || '',
      memberSince: memberSince(p.created_at),
      trust: ['Correo verificado', p.verified_resident ? 'Residente verificado' : 'Residente por verificar', 'Sin intercambios pendientes']
    });
  }

  async function loadSnapshot(authUser) {
    const sb = DB.client();
    const me = authUser.id;
    const profile = DB.unwrap(await sb.from('profiles').select('*').eq('id', me).maybeSingle());
    if (!profile) throw new Error('Tu perfil todavía no existe. Revisa que el trigger handle_new_user esté instalado.');
    const cid = profile.community_id;

    const [communityRow, profileRows, resourceRows, needRows, requestRows, stats] = await Promise.all([
      sb.from('communities').select('id, name, slug').eq('id', cid).single().then(DB.unwrap),
      sb.from('profiles').select('id, display_name, approx_location, approx_distance_m, helps_completed, is_demo, verified_resident, created_at').eq('community_id', cid).limit(1000).then(DB.unwrap),
      Resources.listCommunity(cid),
      Needs.listForSession(me),
      Requests.listMine(),
      Connections.getCommunityStats()
    ]);

    const byId = new Map();
    const residents = [];
    profileRows.forEach(p => {
      if (p.id === me) return;
      const r = toResident(p);
      byId.set(r.id, r);
      residents.push(r);
    });

    const shared = [];
    resourceRows.forEach(row => {
      if (row.owner_id === me) shared.push(Resources.toShared(row));
      else if (byId.has(row.owner_id)) byId.get(row.owner_id).offers.push(Resources.toOffer(row));
    });

    const needs = needRows.filter(n => n.user_id === me).map(Needs.toNeed);
    const errands = needRows.filter(n => n.user_id !== me && n.type === 'ride' && n.status === 'open').map(Needs.toErrand);
    const connections = requestRows.map(row => Requests.toConnection(row, me));

    return {
      directory: {
        community: { id: communityRow.id, name: communityRow.name, slug: communityRow.slug, residents: profileRows.length },
        user: toUser(profile, authUser),
        residents,
        errands,
        stats
      },
      needs, shared, connections
    };
  }

  async function updateProfile(userId, patch) {
    const row = {};
    if (patch.name !== undefined) row.display_name = patch.name;
    if (patch.place !== undefined) row.approx_location = patch.place || null;
    DB.unwrap(await DB.client().from('profiles').update(row).eq('id', userId));
  }

  return { loadSnapshot, updateProfile };
})();
