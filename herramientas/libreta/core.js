/* Libreta de tu Mascota · Orbit · lógica pura (sin DOM).
   Fechas, edad, estados, próximas fechas, modelo de datos e íconos.
   Base tomada a mano de Mimitos (origin/mascotas-libreta: assets/js/mascotas-core.js y mascotas-app.js), recortada. */
(function (g) {
  'use strict';
  const DAY = 864e5;
  /* "pronto" = vence dentro de estos días */
  const SOON_DAYS = 14;

  /* ---------- fechas y formato ---------- */
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const pd = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); if (!y || !m || !d) return null; return new Date(y, m - 1, d); };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmt = (s, o) => { const d = typeof s === 'string' ? pd(s) : s; return d ? d.toLocaleDateString('es-AR', o || { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  const money = n => (Number(n) || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isISO = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && Boolean(pd(s));

  /* suma meses respetando fin de mes (31/1 + 1 mes = 28 o 29/2) */
  function addMonths(s, n) {
    const d = typeof s === 'string' ? pd(s) : new Date(s);
    if (!d) return '';
    const day = d.getDate();
    const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
    return iso(x);
  }
  function monthsSince(s) {
    const b = pd(s); if (!b) return null;
    const t = today(); let m = (t.getFullYear() - b.getFullYear()) * 12 + t.getMonth() - b.getMonth(); if (t.getDate() < b.getDate()) m--;
    return m;
  }
  function age(birth) {
    const m = monthsSince(birth);
    if (m == null || m < 0) return '';
    if (m === 0) return 'menos de 1 mes';
    if (m < 12) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
    const y = Math.floor(m / 12); return `${y} ${y === 1 ? 'año' : 'años'}`;
  }

  /* ---------- estados: vencido / pronto / al día ---------- */
  function status(next) {
    const d = pd(next); if (!d) return null;
    const days = Math.round((d - today()) / DAY);
    if (days < 0) return { k: 'late', label: 'Vencido', t: days === -1 ? 'Venció ayer' : `Venció hace ${-days} días`, days };
    if (days === 0) return { k: 'soon', label: 'Pronto', t: 'Le toca hoy', days };
    if (days <= SOON_DAYS) return { k: 'soon', label: 'Pronto', t: days === 1 ? 'Le toca mañana' : `Le toca en ${days} días`, days };
    return { k: 'ok', label: 'Al día', t: `Próxima: ${fmt(next)}`, days };
  }

  /* ---------- tipos de registro ---------- */
  const TYPE = { vacuna: 'Vacuna', desp_int: 'Desparasitación interna', desp_ext: 'Desparasitación externa', control: 'Control' };
  const TYPE_SHORT = { vacuna: 'Vacuna', desp_int: 'Desp. interna', desp_ext: 'Desp. externa', control: 'Control' };
  const TYPES = Object.keys(TYPE);
  /* nombres frecuentes por especie (de Mimitos; la desparasitación se separa en interna y externa) */
  const SUGGEST = {
    perro: { vacuna: ['Antirrábica', 'Séxtuple', 'Óctuple', 'Tos de las perreras'], desp_ext: ['Pipeta antipulgas', 'Comprimido antipulgas', 'Collar antipulgas'], desp_int: ['Antiparasitario interno'], control: ['Control anual', 'Control de peso', 'Análisis de sangre'] },
    gato: { vacuna: ['Antirrábica', 'Triple felina', 'Leucemia felina'], desp_ext: ['Pipeta antipulgas'], desp_int: ['Antiparasitario interno'], control: ['Control anual', 'Control de peso', 'Análisis de sangre'] },
  };
  const suggest = (species, type) => ((SUGGEST[species] || SUGGEST.perro)[type]) || [];

  const BREEDS = { perro: ["Mestizo", "Akita Inu", "Alaskan Malamute", "American Bully", "Basenji", "Basset Hound", "Beagle", "Bichón Frisé", "Bichón Maltés", "Bloodhound", "Border Collie", "Boston Terrier", "Bóxer", "Boyero de Berna", "Braco Alemán", "Bull Terrier", "Bulldog Francés", "Bulldog Inglés", "Bullmastiff", "Cane Corso", "Caniche Toy", "Caniche Mini", "Caniche Estándar", "Cavalier King Charles", "Chihuahua", "Chow Chow", "Cimarrón Uruguayo", "Cocker Spaniel Inglés", "Cocker Spaniel Americano", "Collie", "Dachshund (Salchicha)", "Dálmata", "Doberman", "Dogo Argentino", "Dogo de Burdeos", "Fila Brasileiro", "Fox Terrier", "Galgo", "Golden Retriever", "Gran Danés", "Husky Siberiano", "Jack Russell Terrier", "Labrador Retriever", "Lhasa Apso", "Mastín Napolitano", "Ovejero Alemán", "Ovejero Belga", "Pastor Australiano", "Pastor Blanco Suizo", "Pekinés", "Pinscher Miniatura", "Pit Bull", "Pointer", "Pomerania", "Pug", "Rottweiler", "Samoyedo", "San Bernardo", "Schnauzer Miniatura", "Schnauzer Estándar", "Schnauzer Gigante", "Setter Irlandés", "Shar Pei", "Shiba Inu", "Shih Tzu", "Springer Spaniel", "Staffordshire Bull Terrier", "Teckel", "Terranova", "Vizsla", "Weimaraner", "West Highland Terrier", "Whippet", "Yorkshire Terrier"], gato: ["Común europeo (mestizo)", "Abisinio", "American Shorthair", "Angora Turco", "Azul Ruso", "Bengalí", "Birmano", "Bombay", "British Shorthair", "Burmés", "Cornish Rex", "Devon Rex", "Esfinge (Sphynx)", "Exótico de pelo corto", "Himalayo", "Maine Coon", "Manx", "Munchkin", "Bosque de Noruega", "Oriental", "Persa", "Ragdoll", "Savannah", "Scottish Fold", "Siamés", "Siberiano", "Somalí", "Van Turco"] };
  const species = p => p.species === 'gato' ? 'Gato' : 'Perro';

  /* ---------- modelo ---------- */
  const uid = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
  const blankPet = () => ({ id: uid(), name: '', species: 'perro', breed: '', birth: '', birthApprox: false, photo: '', weight: null, records: [] });
  const blankRecord = () => ({ id: uid(), type: 'vacuna', name: '', date: iso(today()), vet: '', notes: '', next: '' });
  const pick = (v, ok, def) => (ok(v) ? v : def);
  function normRecord(r) {
    const b = blankRecord(); r = r && typeof r === 'object' ? r : {};
    return {
      id: pick(r.id, x => typeof x === 'string' && x, b.id),
      type: pick(r.type, x => TYPES.includes(x), 'control'),
      name: String(r.name || '').slice(0, 80),
      date: pick(r.date, isISO, b.date),
      vet: String(r.vet || '').slice(0, 80),
      notes: String(r.notes || '').slice(0, 500),
      next: pick(r.next, isISO, ''),
    };
  }
  function norm(p) {
    const b = blankPet(); p = p && typeof p === 'object' ? p : {};
    const w = Number(p.weight);
    return {
      id: pick(p.id, x => typeof x === 'string' && x, b.id),
      name: String(p.name || '').slice(0, 40),
      species: p.species === 'gato' ? 'gato' : 'perro',
      breed: String(p.breed || '').slice(0, 60),
      birth: pick(p.birth, isISO, ''),
      birthApprox: Boolean(p.birthApprox),
      photo: pick(p.photo, x => typeof x === 'string' && x.startsWith('data:image/'), ''),
      weight: w > 0 && w < 200 ? Math.round(w * 10) / 10 : null,
      records: Array.isArray(p.records) ? p.records.map(normRecord) : [],
    };
  }
  function normDoc(d) {
    d = d && typeof d === 'object' ? d : {};
    const pets = Array.isArray(d.pets) ? d.pets.map(norm) : [];
    return { v: 1, pets, current: pets.some(p => p.id === d.current) ? d.current : (pets[0] ? pets[0].id : '') };
  }

  /* ---------- lo que le toca ----------
     Manda el último registro de cada tipo + nombre: si ya cargaste la antirrábica de este año,
     la del año pasado no aparece como vencida. Solo usa las próximas fechas que cargó la persona.
     Paso 2: el calendario sugerido se suma como otra fuente con la misma forma { r, s, source }. */
  function upcoming(p) {
    const last = new Map();
    for (const r of p.records || []) {
      const k = r.type + '|' + (r.name || '').toLowerCase().trim();
      const prev = last.get(k);
      if (!prev || (r.date || '') > (prev.date || '')) last.set(k, r);
    }
    return [...last.values()]
      .filter(r => r.next)
      .map(r => ({ pet: p, r, s: status(r.next), source: 'user' }))
      .sort((a, b) => a.r.next.localeCompare(b.r.next));
  }
  /* historial: lo más nuevo arriba */
  const history = (p, type) => (p.records || []).filter(r => !type || type === 'todo' || r.type === type).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  /* ---------- íconos de línea (de Mimitos) ---------- */
  const P = {
    paw: '<circle cx="7" cy="9" r="1.9"/><circle cx="12" cy="6.5" r="1.9"/><circle cx="17" cy="9" r="1.9"/><path d="M12 12c-3 0-5.5 3.2-5.5 5.6 0 1.6 1.3 2.4 2.8 2.4 1 0 1.8-.5 2.7-.5s1.7.5 2.7.5c1.5 0 2.8-.8 2.8-2.4C17.5 15.2 15 12 12 12z"/>',
    dog: '<path d="M8.2 6.4C6.6 4.9 4 5.3 3.5 7.4s.4 4.6 2 4.8"/><path d="M15.8 6.4c1.6-1.5 4.2-1.1 4.7 1s-.4 4.6-2 4.8"/><path d="M6.5 9.2c0-2.2 2.5-3.7 5.5-3.7s5.5 1.5 5.5 3.7v4.3a5.5 5.5 0 0 1-11 0z"/><circle cx="9.7" cy="11.3" r=".7"/><circle cx="14.3" cy="11.3" r=".7"/><path d="M10.8 14.2h2.4L12 15.5z"/><path d="M12 15.5v1.3"/>',
    cat: '<path d="M5 13V5l4 3h6l4-3v8a7 7 0 0 1-14 0z"/><circle cx="9.3" cy="12" r=".6"/><circle cx="14.7" cy="12" r=".6"/><path d="M11 15h2l-1 1z"/><path d="M3 14.5h4M3 17h4M17 14.5h4M17 17h4"/>',
    syringe: '<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 9 19l-4 1 1-4L16 6z"/><path d="m9 11 4 4"/><path d="m12 8 4 4"/>',
    drop: '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
    pill: '<path d="M4.9 12.7 12.7 4.9a4.5 4.5 0 0 1 6.4 6.4l-7.8 7.8a4.5 4.5 0 0 1-6.4-6.4z"/><path d="m8.8 8.8 6.4 6.4"/>',
    steth: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-1"/><circle cx="20" cy="12" r="2"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v4M10 15h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    alert: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
    device: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[n] || P.paw}</svg>`;
  const petIcon = p => icon(p.species === 'gato' ? 'cat' : 'dog');
  const recIcon = t => ({ vacuna: 'syringe', desp_int: 'pill', desp_ext: 'drop', control: 'steth' })[t] || 'steth';

  g.LB = { DAY, SOON_DAYS, today, pd, iso, fmt, money, esc, isISO, addMonths, monthsSince, age, status, TYPE, TYPE_SHORT, TYPES, SUGGEST, suggest, BREEDS, species, uid, blankPet, blankRecord, norm, normRecord, normDoc, upcoming, history, icon, petIcon, recIcon };
})(typeof window !== 'undefined' ? window : globalThis);
