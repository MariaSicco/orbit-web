/* Mimitos · evaluación de "Conectar tu mail" contra un set etiquetado (test/fixtures/mail-eval.json).
   Mide tres cosas, con el MISMO código que corre en producción:
   1. Puntaje: relevance()/judge() de api/_lib/petmail.js sobre remitente, asunto y adjuntos (como si el mail ya
      hubiera llegado). "Mostrado" = entra como candidato o en la lista "sin adjunto".
   2. Gmail de punta a punta: la consulta q de buildQuery() simulada sobre el mail (el servidor de Gmail sí busca en
      el cuerpo; acá el cuerpo es el snippet) + lo que hace messageOf() con los adjuntos + el puntaje.
   3. Outlook de punta a punta: lo mismo con buildKql() ($search de Graph) y la regla del adaptador de Outlook
      (si tenía adjuntos pero ninguno es PDF o foto, el mail se descarta).
   Además cuenta cuántos cuerpos se leerían (solo mails mostrados sin adjunto) y simula "No es de la mascota":
   silencia el remitente de cada falso positivo y vuelve a medir.

   Uso: node scripts/mimitos-mail-eval.mjs [--json] [--errores] [--acentos]
   --acentos: simula un proveedor que ignora tildes (por defecto se supone que NO las ignora, el peor caso). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const M = await import('../api/_lib/petmail.js');
const G = await import('../api/_lib/petgmail.js');
const O = await import('../api/_lib/petoutlook.js');
const SET = JSON.parse(readFileSync(here + '../test/fixtures/mail-eval.json', 'utf8'));
const args = new Set(process.argv.slice(2));
const FOLD_ACCENTS = args.has('--acentos');

/* ---------- el mail como lo ve cada adaptador ---------- */
const addr = f => { const m = /<([^>]+)>/.exec(f || ''); return (m ? m[1] : f || '').trim().toLowerCase(); };
const typeOk = f => ({ part: '1', name: f.name, type: M.typeOf(f.type, f.name), size: f.size });
function candidateFor(mail, provider) {
  const raw = (mail.files || []).map(typeOk);
  /* Outlook no trae los adjuntos inline (logos de firma); Gmail sí */
  const seen = provider === 'outlook' ? raw.filter((f, i) => !mail.files[i].inline) : raw;
  const files = seen.filter(f => M.fileOk(f));
  if (provider === 'outlook' && (mail.files || []).some(f => !f.inline) && !files.length) return null;
  return { m: mail.id, from: mail.from, to: mail.to || SET.account.to, subject: mail.subject, files,
    labels: provider === 'gmail' ? (mail.labels || []) : [], unsub: Boolean(mail.unsub), link: 'https://mail.example/' + mail.id };
}
const judgeFn = M.judge || ((c, rel) => { const r = M.relevance(c, rel); return { ...r, show: r.pass ? (c.files.length ? 'file' : 'nofile') : '' }; });

/* ---------- simulador de búsqueda del proveedor ---------- */
const deacc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = s => { const t = String(s || '').toLowerCase(); return FOLD_ACCENTS ? deacc(t) : t.normalize('NFC'); };
const words = s => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function phraseIn(hay, phrase) {
  const h = words(hay), p = words(phrase);
  if (!p.length) return false;
  for (let i = 0; i + p.length <= h.length; i++) if (p.every((w, j) => h[i + j] === w)) return true;
  return false;
}
function tokenize(q) {
  const out = []; let i = 0;
  while (i < q.length) {
    const ch = q[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') { out.push(ch); i++; continue; }
    if (ch === '"') { let j = i + 1, s = ''; while (j < q.length && q[j] !== '"') { if (q[j] === '\\') j++; s += q[j++]; } out.push({ q: s }); i = j + 1; continue; }
    let j = i; while (j < q.length && !/[\s()"]/.test(q[j])) j++;
    let w = q.slice(i, j);
    /* campo:"frase" o campo:(grupo) */
    if (/:$/.test(w) && q[j] === '"') { let k = j + 1, s = ''; while (k < q.length && q[k] !== '"') s += q[k++]; out.push({ w: w + s, quoted: true }); i = k + 1; continue; }
    out.push({ w }); i = j;
  }
  return out;
}
function parse(q) {
  const t = tokenize(q); let p = 0;
  const peek = () => t[p];
  function orE(field) { const xs = [andE(field)]; while (peek()?.w === 'OR') { p++; xs.push(andE(field)); } return xs.length === 1 ? xs[0] : { or: xs }; }
  function andE(field) {
    const xs = [];
    while (p < t.length && peek() !== ')' && peek()?.w !== 'OR') { if (peek()?.w === 'AND') { p++; continue; } xs.push(unary(field)); }
    return xs.length === 1 ? xs[0] : { and: xs };
  }
  function unary(field) {
    const k = peek();
    if (k?.w === 'NOT') { p++; return { not: unary(field) }; }
    if (k?.w && k.w.startsWith('-') && k.w.length > 1) { t[p] = { ...k, w: k.w.slice(1) }; return { not: unary(field) }; }
    return atom(field);
  }
  function atom(field) {
    const k = t[p++];
    if (k === '(') { const e = orE(field); if (t[p] === ')') p++; return e; }
    if (k.q !== undefined) return { f: field || '', v: k.q };
    const m = /^([a-zA-Z_]+)(:|>=|<=|=)(.*)$/.exec(k.w);
    if (m) {
      const f = m[1].toLowerCase();
      if (m[3] === '' && peek() === '(') { p++; const e = orE(f); if (t[p] === ')') p++; return e; }
      return { f, op: m[2], v: m[3] };
    }
    return { f: field || '', v: k.w };
  }
  return orE('');
}
function hit(node, mail, dialect) {
  if (node.or) return node.or.some(n => hit(n, mail, dialect));
  if (node.and) return node.and.every(n => hit(n, mail, dialect));
  if (node.not) return !hit(node.not, mail, dialect);
  const { f, v } = node;
  const files = (mail.files || []).map(x => x.name).join(' ');
  const from = mail.from, a = addr(mail.from);
  switch (f) {
    case '': return dialect === 'gmail'
      ? [from, mail.subject, mail.snippet, files].some(h => phraseIn(h, v))
      : [from, mail.subject, mail.snippet].some(h => phraseIn(h, v));   // KQL sin propiedad: from, subject y body
    case 'subject': return phraseIn(mail.subject, v);
    case 'from': {
      const x = v.toLowerCase();
      if (x.includes('@')) return a === x;
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x)) { const d = a.split('@')[1] || ''; return d === x || d.endsWith('.' + x); }
      return phraseIn(from, v);
    }
    case 'has': return v === 'attachment' ? (mail.files || []).length > 0 : true;
    case 'hasattachments': case 'hasattachment': return (String(v).toLowerCase() === 'true') === ((mail.files || []).some(x => !x.inline));
    case 'filename': {
      const ext = v.toLowerCase();
      if (/^(pdf|jpg|jpeg|png|heic|webp)$/.test(ext)) return (mail.files || []).some(x => x.name.toLowerCase().endsWith('.' + ext));
      return (mail.files || []).some(x => phraseIn(x.name.replace(/[._-]+/g, ' '), v));
    }
    case 'attachment': return (mail.files || []).some(x => phraseIn(x.name.replace(/[._-]+/g, ' '), v));
    case 'category': return (mail.labels || []).includes('CATEGORY_' + v.toUpperCase());
    case 'newer_than': case 'older_than': case 'after': case 'before': case 'received': case 'in': return true;
    default: return phraseIn([from, mail.subject, mail.snippet].join(' '), `${f} ${v}`);
  }
}
export const gmailMatches = (q, mail) => hit(parse(q), mail, 'gmail');
export const kqlMatches = (kql, mail) => hit(parse(kql), mail, 'kql');

/* ---------- correr ---------- */
function run(senders) {
  const rel = M.relContext(SET.doc, senders);
  const qOpts = { range: '12m', senders };
  const gq = G.buildQuery(SET.doc, qOpts);
  const kq = O.buildKql(SET.doc, Date.parse('2025-10-15'), senders);
  const rows = [];
  for (const mail of SET.mails) {
    const r = {};
    for (const p of ['gmail', 'outlook']) {
      const c = candidateFor(mail, p);
      const j = c ? judgeFn(c, rel) : { show: '' };
      const q = p === 'gmail' ? gmailMatches(gq, mail) : kqlMatches(kq, mail);
      r[p] = { query: q, show: Boolean(j.show), body: j.show === 'nofile', score: j.score ?? null, e2e: q && Boolean(j.show) };
    }
    rows.push({ mail, ...r });
  }
  return { rows, gq, kq };
}
function metrics(rows, pick) {
  let tp = 0, fp = 0, fn = 0, tn = 0, bodyPos = 0, bodyNeg = 0;
  const fpKind = {}, fnKind = {};
  for (const x of rows) {
    const got = pick(x), want = x.mail.expected;
    if (got && want) tp++; else if (got && !want) { fp++; fpKind[x.mail.kind] = (fpKind[x.mail.kind] || 0) + 1; }
    else if (!got && want) { fn++; fnKind[x.mail.kind] = (fnKind[x.mail.kind] || 0) + 1; } else tn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 1, recall = tp + fn ? tp / (tp + fn) : 1;
  return { tp, fp, fn, tn, precision: +precision.toFixed(3), recall: +recall.toFixed(3), fpKind, fnKind };
}
function report(label, out) {
  const { rows } = out;
  const views = {
    puntaje_gmail: metrics(rows, x => x.gmail.show),
    gmail_e2e: metrics(rows, x => x.gmail.e2e),
    consulta_gmail_recall: metrics(rows, x => x.gmail.query),
    outlook_e2e: metrics(rows, x => x.outlook.e2e),
    consulta_outlook_recall: metrics(rows, x => x.outlook.query),
  };
  const bodies = {
    gmail: { positivos: rows.filter(x => x.mail.expected && x.gmail.e2e && x.gmail.body).length, negativos: rows.filter(x => !x.mail.expected && x.gmail.e2e && x.gmail.body).length },
    outlook: { positivos: rows.filter(x => x.mail.expected && x.outlook.e2e && x.outlook.body).length, negativos: rows.filter(x => !x.mail.expected && x.outlook.e2e && x.outlook.body).length },
  };
  const errors = {
    fp: rows.filter(x => !x.mail.expected && x.gmail.e2e).map(x => `${x.mail.id} ${x.mail.kind} · ${x.mail.subject}`),
    fn: rows.filter(x => x.mail.expected && !x.gmail.e2e).map(x => `${x.mail.id} ${x.mail.kind} · ${x.mail.subject}${x.gmail.query ? '' : ' [no lo trae la consulta]'}${x.gmail.show ? '' : ' [puntaje]'}`),
    fp_outlook: rows.filter(x => !x.mail.expected && x.outlook.e2e).map(x => x.mail.id),
    fn_outlook: rows.filter(x => x.mail.expected && !x.outlook.e2e).map(x => `${x.mail.id}${x.outlook.query ? '' : ' [consulta]'}${x.outlook.show ? '' : ' [puntaje]'}`),
  };
  return { label, views, bodies, errors, largo: { gmail: out.gq.length, outlook: out.kq.length } };
}

const base = run(SET.senders);
const A = report('sin silenciados', base);
/* "No es de la mascota": la persona toca el botón en cada falso positivo que ve (Gmail) */
const fpFrom = base.rows.filter(x => !x.mail.expected && x.gmail.e2e).map(x => x.mail.from);
let B = null;
if (M.muteKey) {
  const muted = [...new Set(fpFrom.map(f => M.muteKey(f)).filter(Boolean))];
  B = report('después de "No es de la mascota" en cada falso positivo', run({ ...SET.senders, muted }));
  B.silenciados = muted;
}
const res = { mails: SET.mails.length, positivos: SET.mails.filter(m => m.expected).length, negativos: SET.mails.filter(m => !m.expected).length, acentos: FOLD_ACCENTS ? 'ignorados' : 'distintos', A, B };

if (args.has('--json')) { console.log(JSON.stringify(res, null, 2)); }
else {
  const f = v => `P ${v.precision.toFixed(3)} · R ${v.recall.toFixed(3)} · TP ${v.tp} FP ${v.fp} FN ${v.fn}`;
  console.log(`Set: ${res.mails} mails (${res.positivos} positivos, ${res.negativos} negativos). Tildes: ${res.acentos}.`);
  for (const R of [A, B].filter(Boolean)) {
    console.log(`\n== ${R.label} ==`);
    for (const [k, v] of Object.entries(R.views)) console.log(`${k.padEnd(24)} ${f(v)}`);
    console.log(`cuerpos leídos           gmail: ${R.bodies.gmail.positivos} pos / ${R.bodies.gmail.negativos} neg · outlook: ${R.bodies.outlook.positivos} pos / ${R.bodies.outlook.negativos} neg`);
    console.log(`largo de la consulta     gmail ${R.largo.gmail} · outlook ${R.largo.outlook}`);
    console.log(`FP gmail por tipo        ${JSON.stringify(R.views.gmail_e2e.fpKind)}`);
    console.log(`FN gmail por tipo        ${JSON.stringify(R.views.gmail_e2e.fnKind)}`);
    if (R.silenciados) console.log(`silenciados              ${R.silenciados.join(', ')}`);
    if (args.has('--errores')) {
      console.log('falsos positivos (gmail):'); R.errors.fp.forEach(x => console.log('  + ' + x));
      console.log('falsos negativos (gmail):'); R.errors.fn.forEach(x => console.log('  - ' + x));
      console.log('outlook FP: ' + R.errors.fp_outlook.join(' ') + '\noutlook FN: ' + R.errors.fn_outlook.join(' '));
    }
  }
}
