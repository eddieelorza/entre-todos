/* ==========================================================================
   world/world-scene.js — Lo que se dibuja: el residencial, su gente y sus lazos.

   Todo es geometría procedural y barata (cajas, conos, listones, sprites):
   ningún modelo 3D externo. La escena no decide nada: expone piezas con un
   valor actual y un objetivo, y `step(dt)` las acerca. Quien decide los
   objetivos es el director (world.js), así cualquier transición se puede
   interrumpir a la mitad sin saltos.

     edificio.solidT   1 sólido · 0.4 cristal (se ven pisos y personas) · 0 disuelto
     persona.target    a dónde va (techo · su piso · constelación · la necesidad)
     persona.actT      cuánto importa ahora (1 relevante · 0.14 atenuada)
     listón.progressT  un lazo que se dibuja; ancho y trazo dicen si es nuevo o frecuente
     sky               0 día (geografía) · 1 atardecer (relaciones)

   API: WorldScene.create(THREE, model, { mobile, reduced }) → escena
   ========================================================================== */

const WorldScene = (() => {
  const C = {
    cream: '#F7F1E6', paper: '#FFFDF9', amarillo: '#EFB94B', amarilloSoft: '#FBEFD1', terracota: '#C55E3E',
    terracotaLight: '#E07A5A', terracotaDark: '#A64D30', verde: '#586D53', verdeDark: '#304431', sage: '#9DB58F',
    tierra: '#A9825E', ink: '#2B221B', dusk: '#2A2520'
  };
  const TONES = { 1: '#D96F4F', 2: '#5E7A59', 3: '#D9A03A', 4: '#B98D64', 5: '#7F927B' };
  const KIND_COLOR = { object: '#EFB94B', skill: '#E07A5A', knowledge: '#9DB58F', time: '#F7F1E6', route: '#F2C48D', contact: '#D9A066', food: '#F3A18A', context: '#E8D3A0', place: '#BFD3B4' };
  const BUILD = { tower: '#F3E8D5', house: '#F5EBDA', hall: '#DCE5D3', gate: '#E6D4BC', roof: '#CF8A64', park: '#CBD9C1', court: '#E6D3AE', street: '#E9DDC8', tree: '#8FAE84', trunk: '#A9825E' };
  const SEG = 20;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

  function create(THREE, model, opts = {}) {
    const mobile = Boolean(opts.mobile);
    const scene = new THREE.Scene();
    const dayColor = new THREE.Color(C.cream), goldColor = new THREE.Color('#EDC391'), emberColor = new THREE.Color('#7D583C'), duskColor = new THREE.Color(C.dusk);
    scene.background = dayColor.clone();
    scene.fog = new THREE.Fog(scene.background.getHex(), 400, 1100);
    const hemi = new THREE.HemisphereLight(0xFFF7E8, 0xD9CDB8, 1.55);
    const sun = new THREE.DirectionalLight(0xFFE6C4, 1.7);
    sun.position.set(-0.55, 1, 0.4);
    scene.add(hemi, sun);

    const disposables = [];
    const track = o => { disposables.push(o); return o; };
    function canvasTexture(size, draw) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      draw(c.getContext('2d'), size);
      const t = track(new THREE.CanvasTexture(c));
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    /* ---- Texturas compartidas ---- */
    const glowTex = canvasTexture(128, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    });
    const ringTex = canvasTexture(128, (g, s) => {
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2); g.stroke();
    });
    const shadowTex = canvasTexture(64, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(60,45,30,.9)'); r.addColorStop(1, 'rgba(60,45,30,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    });
    const dashTex = canvasTexture(32, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s * 0.55, s); });
    dashTex.wrapS = THREE.RepeatWrapping;
    const windowTex = canvasTexture(64, (g, s) => {
      g.fillStyle = BUILD.tower; g.fillRect(0, 0, s, s);
      g.fillStyle = '#FBF7EE'; g.fillRect(18, 16, 28, 34);
      g.strokeStyle = 'rgba(169,130,94,.45)'; g.lineWidth = 2; g.strokeRect(18, 16, 28, 34);
      g.fillStyle = 'rgba(169,130,94,.16)'; g.fillRect(0, s - 3, s, 3);
    });

    /* ---- Suelo, calles, árboles: la geografía ---- */
    const land = new THREE.Group();
    scene.add(land);
    const groundMat = track(new THREE.MeshBasicMaterial({
      map: canvasTexture(256, (g, s) => {
        const r = g.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s / 2);
        r.addColorStop(0, 'rgba(232,237,219,1)'); r.addColorStop(0.62, 'rgba(236,238,224,.92)'); r.addColorStop(1, 'rgba(247,241,230,0)');
        g.fillStyle = r; g.fillRect(0, 0, s, s);
      }), transparent: true, depthWrite: false, fog: false
    }));
    const ground = new THREE.Mesh(track(new THREE.CircleGeometry(430, 48)), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(10, -0.05, 10); ground.renderOrder = -3;
    land.add(ground);

    function strip(points, width, y) {
      const pos = [], idx = [];
      points.forEach((p, i) => {
        const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
        const nx = -dz / d * width / 2, nz = dx / d * width / 2;
        pos.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz);
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      });
      const g = track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return g;
    }
    const streetMat = track(new THREE.MeshBasicMaterial({ color: BUILD.street, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const streetLineMat = track(new THREE.MeshBasicMaterial({ color: C.cream, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    model.streets.forEach(line => {
      const a = new THREE.Mesh(strip(line, 7.5, 0.02), streetMat); a.renderOrder = -2;
      const b = new THREE.Mesh(strip(line, 0.55, 0.04), streetLineMat); b.renderOrder = -1;
      land.add(a, b);
    });

    const treeMat = track(new THREE.MeshLambertMaterial({ color: BUILD.tree, transparent: true, flatShading: true }));
    const trunkMat = track(new THREE.MeshLambertMaterial({ color: BUILD.trunk, transparent: true }));
    const crowns = new THREE.InstancedMesh(track(new THREE.IcosahedronGeometry(2.6, 0)), treeMat, model.trees.length);
    const trunks = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.28, 0.36, 3, 5)), trunkMat, model.trees.length);
    const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v0 = new THREE.Vector3(), s0 = new THREE.Vector3();
    model.trees.forEach((t, i) => {
      q0.setFromAxisAngle(v0.set(0, 1, 0), hash(`tree${i}`) * 6.28);
      crowns.setMatrixAt(i, m4.compose(v0.set(t.x, 3.4 * t.s + 1, t.z), q0, s0.set(t.s, t.s * 1.08, t.s)));
      trunks.setMatrixAt(i, m4.compose(v0.set(t.x, 1.5, t.z), q0, s0.set(1, 1, 1)));
    });
    land.add(crowns, trunks);

    /* ---- Edificios: el lugar ---- */
    const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));
    const edgeGeo = track(new THREE.EdgesGeometry(boxGeo));
    const roofGeo = track(new THREE.ConeGeometry(1, 1, 4, 1));
    const shadowGeo = track(new THREE.PlaneGeometry(1, 1));
    const buildings = model.buildings.map(b => {
      const group = new THREE.Group();
      group.position.set(b.x, 0, b.z);
      const mats = [];
      const flat = b.kind === 'park' || b.kind === 'court';
      const lambert = (color, o) => { const m = track(new THREE.MeshLambertMaterial(Object.assign({ color, transparent: true }, o))); mats.push(m); return m; };
      let body;
      if (b.kind === 'tower') {
        const sideTex = (n) => { const t = track(windowTex.clone()); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(2, Math.round(n / 4.4)), b.floors); t.needsUpdate = true; return t; };
        const mx = lambert('#ffffff', { map: sideTex(b.d) }), mz = lambert('#ffffff', { map: sideTex(b.w) }), top = lambert('#F7EFE0');
        body = new THREE.Mesh(boxGeo, [mx, mx, top, top, mz, mz]);
      } else {
        body = new THREE.Mesh(boxGeo, lambert(BUILD[b.kind] || BUILD.house));
      }
      body.scale.set(b.w, b.h, b.d); body.position.y = b.h / 2;
      body.userData.building = b.id;
      group.add(body);
      if (b.kind === 'house') {
        const roof = new THREE.Mesh(roofGeo, lambert(BUILD.roof, { flatShading: true }));
        roof.rotation.y = Math.PI / 4; roof.scale.set(b.w * 0.8, 3.4, b.d * 0.8); roof.position.y = b.h + 1.7;
        const door = new THREE.Mesh(boxGeo, lambert(C.terracotaDark));
        door.scale.set(1.8, 2.6, 0.3); door.position.set(0, 1.3, b.d / 2 + 0.1);
        group.add(roof, door);
      }
      if (b.kind === 'tower') {
        const cap = new THREE.Mesh(boxGeo, lambert('#E6D6BD'));
        cap.scale.set(b.w * 0.28, 1.6, b.d * 0.34); cap.position.set(-b.w * 0.2, b.h + 0.8, 0);
        group.add(cap);
      }
      let edgeMat = null, floorMat = null;
      if (!flat) {
        edgeMat = track(new THREE.LineBasicMaterial({ color: C.tierra, transparent: true, opacity: 0, depthWrite: false }));
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.scale.copy(body.scale); edges.position.copy(body.position);
        group.add(edges);
        const shadow = new THREE.Mesh(shadowGeo, track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.2, depthWrite: false })));
        shadow.rotation.x = -Math.PI / 2; shadow.scale.set(b.w * 1.9, b.d * 1.9, 1); shadow.position.set(b.w * 0.16, 0.03, -b.d * 0.12); shadow.renderOrder = -1;
        group.add(shadow);
        mats.shadow = shadow.material;
      }
      scene.add(group);
      return {
        model: b, group, body, mats, edgeMat, floorMat, flat, floorLines: null, solid: 1, solidT: 1, rate: 3.2,
        /* Los pisos solo existen cuando alguien entra al edificio (lazy). */
        ensureFloors() {
          if (this.floorLines || b.floors < 2) return;
          const pts = [];
          for (let f = 1; f < b.floors; f++) {
            const y = f * model.floorH, x = b.w / 2, z = b.d / 2;
            pts.push(-x, y, -z, x, y, -z, x, y, -z, x, y, z, x, y, z, -x, y, z, -x, y, z, -x, y, -z);
          }
          const g = track(new THREE.BufferGeometry());
          g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          this.floorMat = track(new THREE.LineBasicMaterial({ color: C.tierra, transparent: true, opacity: 0, depthWrite: false }));
          this.floorLines = new THREE.LineSegments(g, this.floorMat);
          group.add(this.floorLines);
        }
      };
    });
    const buildingById = Object.fromEntries(buildings.map(b => [b.model.id, b]));
    const pickables = buildings.filter(b => b.model.enterable).map(b => b.body);

    /* ---- Personas: la misma identidad que el mapa y la constelación (tono + iniciales) ---- */
    function avatarTexture(p) {
      return canvasTexture(128, (g, s) => {
        const tone = TONES[p.tone] || TONES[3];
        const isNew = p.kind === 'household', me = p.kind === 'user';
        g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2);
        g.fillStyle = isNew ? C.paper : tone; g.fill();
        g.lineWidth = me ? 9 : 6; g.strokeStyle = me ? C.amarillo : isNew ? tone : C.paper; g.stroke();
        g.fillStyle = isNew ? C.ink : '#fff';
        g.font = `700 ${p.initials.length > 1 ? 44 : 54}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(p.initials, s / 2, s / 2 + 3);
      });
    }
    const people = model.people.map((p, i) => {
      const tone = TONES[p.tone] || TONES[3];
      const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: p.kind === 'user' ? C.amarillo : tone, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
      const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: avatarTexture(p), transparent: true, depthTest: false, depthWrite: false, fog: false })));
      halo.renderOrder = 5; sprite.renderOrder = 6;
      sprite.userData.person = p.id;
      const size = p.kind === 'user' ? 9.6 : p.kind === 'household' ? 6.4 : 8.4;
      scene.add(halo, sprite);
      const pos = new THREE.Vector3(p.phys.x, p.phys.y, p.phys.z);
      return {
        model: p, sprite, halo, size, pos, vel: new THREE.Vector3(), target: pos.clone(), omega: 2.1 + hash(p.id + 'w') * 0.9,
        act: 1, actT: 1, wake: 0, phase: hash(p.id + 'ph') * 6.28, index: i, anchorY: p.phys.y - 7
      };
    });
    const personById = Object.fromEntries(people.map(p => [p.model.id, p]));

    /* Tallos: de cada persona a su techo. De día dicen "vive aquí"; al caer la tarde se sueltan. */
    const stemGeo = track(new THREE.BufferGeometry());
    stemGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(people.length * 6), 3));
    const stemMat = track(new THREE.LineBasicMaterial({ color: C.tierra, transparent: true, opacity: 0.45, depthWrite: false }));
    scene.add(new THREE.LineSegments(stemGeo, stemMat));

    /* Capacidades: lo que cada quien sabe, tiene o suele hacer, girando a su alrededor. */
    const capList = [];
    people.forEach(p => p.model.caps.forEach((c, i) => capList.push({
      cap: c, owner: p, a0: hash(c.id) * 6.28, r: 5.6 + (i % 3) * 1.3, speed: 0.22 + hash(c.id + 's') * 0.2, tilt: (hash(c.id + 't') - 0.5) * 1.2, hidden: false
    })));
    const capGeo = track(new THREE.BufferGeometry());
    capGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capList.length * 3), 3));
    capGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capList.length * 3), 3));
    const capMat = track(new THREE.PointsMaterial({ map: glowTex, size: mobile ? 5 : 4.2, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const capPoints = new THREE.Points(capGeo, capMat);
    capPoints.frustumCulled = false; capPoints.renderOrder = 4;
    scene.add(capPoints);
    const capColors = capList.map(c => new THREE.Color(KIND_COLOR[c.cap.kind] || C.amarillo));

    /* Polvo cálido: la comunidad respira. */
    const dustN = mobile ? 70 : 130;
    const dustGeo = track(new THREE.BufferGeometry());
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) { dustPos[i * 3] = (hash(`dx${i}`) - 0.5) * 420; dustPos[i * 3 + 1] = 4 + hash(`dy${i}`) * 60; dustPos[i * 3 + 2] = (hash(`dz${i}`) - 0.5) * 420; }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = track(new THREE.PointsMaterial({ map: glowTex, size: 2.4, color: '#F2C48D', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    scene.add(dust);

    /* ---- Listones: los lazos ---- */
    const ribbons = [];
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
    function curveAt(a, b, t, out) {
      const lift = Math.min(14, a.distanceTo(b) * 0.13);
      tmpC.copy(a).add(b).multiplyScalar(0.5); tmpC.y += lift;
      const u = 1 - t;
      return out.set(u * u * a.x + 2 * u * t * tmpC.x + t * t * b.x, u * u * a.y + 2 * u * t * tmpC.y + t * t * b.y, u * u * a.z + 2 * u * t * tmpC.z + t * t * b.z);
    }
    const STYLE = {
      frequent: { width: 1.7, alpha: 0.9, color: C.amarillo, dash: false },
      growing: { width: 1.05, alpha: 0.62, color: '#F2C48D', dash: false },
      new: { width: 0.7, alpha: 0.5, color: '#E8D3A0', dash: true },
      solution: { width: 1.25, alpha: 0.95, color: C.amarillo, dash: false },
      carry: { width: 0.7, alpha: 0.55, color: '#F2C48D', dash: false },
      alt: { width: 0.5, alpha: 0.3, color: '#E8D3A0', dash: true }
    };
    function addRibbon(from, to, stage, extra = {}) {
      const st = STYLE[stage] || STYLE.new;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array((SEG + 1) * 6), uv = new Float32Array((SEG + 1) * 4), idx = [];
      for (let i = 0; i <= SEG; i++) {
        uv[i * 4] = uv[i * 4 + 2] = i / SEG * 16; uv[i * 4 + 1] = 0; uv[i * 4 + 3] = 1;
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color: st.color, alphaMap: st.dash ? dashTex : null, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.renderOrder = 3;
      scene.add(mesh);
      const r = Object.assign({ from, to, stage, mesh, geo, mat, width: st.width, widthT: st.width, alpha: 0, alphaT: st.alpha, baseAlpha: st.alpha, progress: 0, progressT: 0, speed: 1.6, dim: 1, dimT: 1 }, extra);
      ribbons.push(r);
      return r;
    }
    function restyleRibbon(r, stage) {
      const st = STYLE[stage]; if (!st) return;
      r.stage = stage; r.widthT = st.width; r.baseAlpha = r.alphaT = st.alpha;
      r.mat.color.set(st.color); r.mat.alphaMap = st.dash ? dashTex : null; r.mat.needsUpdate = true;
    }
    function removeRibbon(r) {
      const i = ribbons.indexOf(r); if (i >= 0) ribbons.splice(i, 1);
      scene.remove(r.mesh); r.geo.dispose(); r.mat.dispose();
    }
    const posOf = x => (x.pos ? x.pos : x);
    function updateRibbon(r) {
      const visible = r.alpha > 0.01 && r.progress > 0.01;
      r.mesh.visible = visible;
      if (!visible) return;
      const a = posOf(r.from), b = posOf(r.to);
      const arr = r.geo.attributes.position.array;
      const n = Math.max(1, Math.round(r.progress * SEG));
      for (let i = 0; i <= n; i++) {
        curveAt(a, b, i / SEG, tmpA); curveAt(a, b, Math.min(1, (i + 0.5) / SEG), tmpB);
        let dx = tmpB.x - tmpA.x, dz = tmpB.z - tmpA.z; const d = Math.hypot(dx, dz) || 1;
        if (i === n && n === SEG) { curveAt(a, b, (i - 0.5) / SEG, tmpB); dx = tmpA.x - tmpB.x; dz = tmpA.z - tmpB.z; }
        const w = r.width * state.ribbonK * (0.55 + 0.45 * Math.sin(Math.PI * i / SEG)) / 2;
        const nx = -dz / d * w, nz = dx / d * w, k = i * 6;
        arr[k] = tmpA.x + nx; arr[k + 1] = tmpA.y; arr[k + 2] = tmpA.z + nz;
        arr[k + 3] = tmpA.x - nx; arr[k + 4] = tmpA.y; arr[k + 5] = tmpA.z - nz;
      }
      r.geo.attributes.position.needsUpdate = true;
      r.geo.setDrawRange(0, n * 6);
      r.mat.opacity = r.alpha * r.dim;
    }

    /* Lazos del Trust Graph: persistentes, uno por relación. */
    const relationRibbons = model.relations.map(rel => {
      const a = personById[rel.a], b = personById[rel.b];
      return a && b ? addRibbon(a, b, rel.stage, { relation: rel }) : null;
    }).filter(Boolean);

    /* ---- Pulsos: algo viaja por un lazo ---- */
    const pulses = [];
    function pulse(ribbon, o = {}) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: o.color || '#FFD98A', transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sprite.renderOrder = 7;
      scene.add(sprite);
      const p = { ribbon, sprite, t: 0, duration: o.duration || 1.4, size: o.size || 5, reverse: Boolean(o.reverse), onDone: o.onDone || null };
      pulses.push(p);
      return p;
    }
    const bursts = [];
    function burst(target, o = {}) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: o.color || C.amarillo, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
      sprite.renderOrder = 7;
      scene.add(sprite);
      bursts.push({ target, sprite, t: 0, duration: o.duration || 1.5, size: o.size || 26 });
    }

    /* ---- Nodos de una situación: necesidad, recursos, lugares ---- */
    const storyNodes = [];
    function emojiTexture(icon, o = {}) {
      return canvasTexture(128, (g, s) => {
        if (o.disc) { g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2); g.fillStyle = o.disc; g.fill(); if (o.ring) { g.lineWidth = 6; g.strokeStyle = o.ring; g.stroke(); } }
        if (icon) { g.font = `${o.font || 62}px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, s / 2, s / 2 + 4); }
      });
    }
    function addNode(kind, at, o = {}) {
      let tex, size = o.size || 6;
      if (kind === 'center') { tex = emojiTexture(o.icon, { disc: C.paper, ring: C.amarillo, font: 66 }); size = 13; }
      else if (kind === 'need') { tex = emojiTexture('', { disc: o.covered === false ? 'rgba(255,253,249,.5)' : C.amarilloSoft, ring: o.optional ? '#E8D3A0' : C.amarillo }); size = 5.2; }
      else if (kind === 'place' || kind === 'amenity') { tex = emojiTexture(o.icon, { disc: C.paper, ring: C.sage, font: 58 }); size = o.size || 7; }
      else { tex = emojiTexture('', { disc: o.color || C.amarillo, ring: C.paper }); size = 3.8; }
      const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false })));
      const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: o.color || C.amarillo, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
      sprite.renderOrder = 8; halo.renderOrder = 4;
      scene.add(halo, sprite);
      const pos = new THREE.Vector3(at.x, at.y, at.z);
      const n = { kind, sprite, halo, size, pos, vel: new THREE.Vector3(), target: pos.clone(), omega: o.omega || 3, born: 0, bornT: 0, glow: o.glow == null ? 0.5 : o.glow, hit: 0, data: o.data || null, scene: o.scene || 'story' };
      storyNodes.push(n);
      return n;
    }
    function clearNodes(tag) {
      for (let i = storyNodes.length - 1; i >= 0; i--) {
        const n = storyNodes[i];
        if (tag && n.scene !== tag) continue;
        scene.remove(n.sprite, n.halo);
        storyNodes.splice(i, 1);
      }
    }

    /* Halo de un círculo: un aro suave que abraza a sus integrantes. */
    const circleRings = [];
    function addCircleRing(members, o = {}) {
      const geo = new THREE.RingGeometry(0.982, 1, 96);
      const mat = new THREE.MeshBasicMaterial({ color: o.color || C.sage, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: o.color || C.sage, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = fill.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; fill.renderOrder = 1;
      scene.add(mesh, fill);
      const ring = { members, mesh, fill, center: new THREE.Vector3(), top: new THREE.Vector3(), radius: 10, alpha: 0, alphaT: 1, label: o.label || '' };
      circleRings.push(ring);
      return ring;
    }
    function clearCircleRings() {
      circleRings.forEach(r => { r.alphaT = 0; r.dying = true; });
    }

    /* ---- Paso de simulación ---- */
    const state = { sky: 0, skyT: 0, skyRate: 0.9, time: 0, instant: Boolean(opts.reduced), camDist: 300, ribbonK: 1 };
    const bg = new THREE.Color();
    function spring(o, dt) {
      if (state.instant) { o.pos.copy(o.target); o.vel.set(0, 0, 0); return; }
      const w = o.omega;
      tmpA.copy(o.pos).sub(o.target).multiplyScalar(-w * w).addScaledVector(o.vel, -2 * w);
      o.vel.addScaledVector(tmpA, dt); o.pos.addScaledVector(o.vel, dt);
    }
    const approach = (v, t, rate, dt) => state.instant ? t : v + (t - v) * (1 - Math.exp(-rate * dt));

    function step(dt) {
      state.time += dt;
      const t = state.time;
      state.sky = approach(state.sky, state.skyT, state.skyRate, dt);
      const sky = state.sky, day = 1 - sky;
      /* cae la tarde: crema → dorado → noche cálida (nunca gris) */
      if (sky < 0.36) bg.copy(dayColor).lerp(goldColor, sky / 0.36); else if (sky < 0.68) bg.copy(goldColor).lerp(emberColor, (sky - 0.36) / 0.32); else bg.copy(emberColor).lerp(duskColor, (sky - 0.68) / 0.32);
      scene.background.copy(bg); scene.fog.color.copy(bg);
      scene.fog.near = state.camDist * 1.2; scene.fog.far = state.camDist * 3.2;
      hemi.intensity = lerp(1.55, 0.5, sky); sun.intensity = lerp(1.7, 0.35, sky);
      groundMat.opacity = day * day; streetMat.opacity = lerp(0.028, 1, day * day * day); streetLineMat.opacity = day * day;
      treeMat.opacity = trunkMat.opacity = clamp(day * 1.6 - 0.3, 0, 1);
      crowns.visible = trunks.visible = treeMat.opacity > 0.01;
      stemMat.opacity = 0.45 * clamp(day * 2 - 1, 0, 1);
      dustMat.opacity = sky * 0.5;
      dust.rotation.y = t * 0.006;
      const sizeK = clamp(state.camDist / 340, 0.6, 1.5);
      state.ribbonK = clamp(state.camDist / 380, 0.32, 2.2);

      buildings.forEach(b => {
        b.solid = approach(b.solid, b.solidT, b.rate, dt);
        const s = b.solid;
        const face = s >= 0.4 ? lerp(0.2, 1, Math.pow((s - 0.4) / 0.6, 1.6)) : 0.2 * (s / 0.4);
        const opaque = s > 0.985;
        b.mats.forEach(m => { m.opacity = opaque ? 1 : face; m.depthWrite = opaque; });
        if (b.mats.shadow) b.mats.shadow.opacity = 0.2 * clamp((s - 0.4) / 0.6, 0, 1) * day;
        if (b.edgeMat) b.edgeMat.opacity = opaque ? 0 : clamp((1 - s) * 3, 0, 1) * clamp(s / 0.25, 0, 1) * lerp(0.95, 0.55, sky);
        if (b.floorMat) b.floorMat.opacity = b.edgeMat.opacity * 0.75;
        b.group.visible = s > 0.004;
        b.group.scale.y = b.flat ? 1 : 0.9 + 0.1 * clamp(s / 0.4, 0, 1);
      });

      const stems = stemGeo.attributes.position.array;
      people.forEach((p, i) => {
        spring(p, dt);
        p.act = approach(p.act, p.actT, 3.2, dt);
        const bob = state.instant ? 0 : Math.sin(t * 0.7 + p.phase) * 0.55 * sky;
        const wake = p.wake ? Math.max(0, 1 - (t - p.wake) / 0.9) : 0;
        const k = p.size * sizeK * (0.86 + 0.14 * p.act) * (1 + wake * 0.35);
        p.sprite.position.set(p.pos.x, p.pos.y + bob, p.pos.z);
        p.sprite.scale.set(k, k, 1);
        p.sprite.material.opacity = p.act;
        p.halo.position.copy(p.sprite.position);
        p.halo.scale.set(k * 3.1, k * 3.1, 1);
        p.halo.material.opacity = sky * clamp(p.act * 1.1 - 0.12, 0, 1) * (0.42 + wake * 0.5) * (p.model.kind === 'household' ? 0.45 : 1);
        const j = i * 6;
        stems[j] = stems[j + 3] = p.pos.x; stems[j + 2] = stems[j + 5] = p.pos.z;
        stems[j + 1] = p.pos.y - k * 0.5; stems[j + 4] = Math.min(p.anchorY, p.pos.y - k * 0.5);
      });
      stemGeo.attributes.position.needsUpdate = true;

      const cp = capGeo.attributes.position.array, cc = capGeo.attributes.color.array;
      capList.forEach((c, i) => {
        const a = c.a0 + t * c.speed * (state.instant ? 0 : 1), o = c.owner.sprite.position, r = c.r * clamp(sizeK, 0.8, 1.3);
        cp[i * 3] = o.x + Math.cos(a) * r; cp[i * 3 + 1] = o.y + Math.sin(a) * r * c.tilt * 0.5; cp[i * 3 + 2] = o.z + Math.sin(a) * r;
        const v = c.hidden ? 0 : sky * clamp(c.owner.act * 1.2 - 0.1, 0, 1) * (c.owner.model.kind === 'household' ? 0.5 : 1);
        cc[i * 3] = capColors[i].r * v; cc[i * 3 + 1] = capColors[i].g * v; cc[i * 3 + 2] = capColors[i].b * v;
      });
      capGeo.attributes.position.needsUpdate = true; capGeo.attributes.color.needsUpdate = true;
      capMat.size = (mobile ? 5 : 4.2) * clamp(sizeK, 0.8, 1.4);

      storyNodes.forEach(n => {
        spring(n, dt);
        n.born = approach(n.born, n.bornT, 5, dt);
        const hit = n.hit ? Math.max(0, 1 - (t - n.hit) / 0.8) : 0;
        const e = n.born < 1 ? 1 - Math.pow(1 - n.born, 3) : 1;
        const k = n.size * clamp(sizeK, 0.75, 1.5) * e * (1 + hit * 0.4) * (n.kind === 'center' && !state.instant ? 1 + Math.sin(t * 1.6) * 0.03 : 1);
        n.sprite.position.copy(n.pos); n.sprite.scale.set(k, k, 1); n.sprite.material.opacity = clamp(n.born * 1.4, 0, 1);
        n.halo.position.copy(n.pos); n.halo.scale.set(k * 3.4, k * 3.4, 1); n.halo.material.opacity = n.born * sky * (n.glow + hit * 0.5);
      });

      ribbons.forEach(r => {
        r.alpha = approach(r.alpha, r.alphaT, 3, dt);
        r.dim = approach(r.dim, r.dimT, 3, dt);
        r.width = approach(r.width, r.widthT, 1.6, dt);
        r.progress = state.instant ? r.progressT : r.progress + clamp(r.progressT - r.progress, -dt * 3, dt * r.speed);
        updateRibbon(r);
      });

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += dt / p.duration;
        const u = clamp(p.t, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        curveAt(posOf(p.ribbon.from), posOf(p.ribbon.to), p.reverse ? 1 - e : e, p.sprite.position);
        const k = p.size * clamp(sizeK, 0.8, 1.5) * (0.8 + Math.sin(u * Math.PI) * 0.5);
        p.sprite.scale.set(k, k, 1); p.sprite.material.opacity = Math.sin(u * Math.PI) * 0.95;
        if (p.t >= 1) { scene.remove(p.sprite); p.sprite.material.dispose(); pulses.splice(i, 1); if (p.onDone) p.onDone(); }
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.t += dt / b.duration;
        const u = clamp(b.t, 0, 1), e = 1 - Math.pow(1 - u, 3);
        b.sprite.position.copy(posOf(b.target)); const k = lerp(6, b.size, e) * clamp(sizeK, 0.8, 1.5);
        b.sprite.scale.set(k, k, 1); b.sprite.material.opacity = (1 - u) * 0.8;
        if (b.t >= 1) { scene.remove(b.sprite); b.sprite.material.dispose(); bursts.splice(i, 1); }
      }
      for (let i = circleRings.length - 1; i >= 0; i--) {
        const r = circleRings[i];
        r.alpha = approach(r.alpha, r.alphaT, 2.4, dt);
        tmpA.set(0, 0, 0); r.members.forEach(m => tmpA.add(m.pos)); tmpA.multiplyScalar(1 / r.members.length);
        let rad = 8; r.members.forEach(m => { rad = Math.max(rad, Math.hypot(m.pos.x - tmpA.x, m.pos.z - tmpA.z) + 9); });
        r.center.lerp(tmpA, state.instant ? 1 : 0.12); r.radius = lerp(r.radius, rad, state.instant ? 1 : 0.1);
        r.mesh.position.set(r.center.x, r.center.y - 3, r.center.z); r.fill.position.copy(r.mesh.position);
        r.mesh.scale.set(r.radius, r.radius, 1); r.fill.scale.set(r.radius, r.radius, 1);
        r.top.set(r.center.x, r.center.y - 3, r.center.z - r.radius);
        r.mesh.material.opacity = r.alpha * 0.42; r.fill.material.opacity = r.alpha * 0.06;
        if (r.dying && r.alpha < 0.01) { scene.remove(r.mesh, r.fill); r.mesh.geometry.dispose(); r.mesh.material.dispose(); r.fill.geometry.dispose(); r.fill.material.dispose(); circleRings.splice(i, 1); }
      }
    }

    function dispose() {
      ribbons.slice().forEach(removeRibbon);
      disposables.forEach(d => d.dispose && d.dispose());
      crowns.dispose(); trunks.dispose();
    }

    return {
      scene, state, buildings, buildingById, pickables, people, personById, capList, ribbons, relationRibbons, storyNodes, circleRings,
      addRibbon, removeRibbon, restyleRibbon, pulse, burst, addNode, clearNodes, addCircleRing, clearCircleRings, step, dispose, KIND_COLOR, TONES, C
    };
  }

  return { create, C, TONES, KIND_COLOR };
})();
