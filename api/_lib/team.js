/* Equipo de Orbit: quiénes entran al Control y de quién es cada producto.
   La administradora (ADMIN_EMAILS) siempre es parte del equipo. El resto se
   suma desde el panel de administración, con nombre, email y contraseña. */
import { kvGet, kvSet } from './kv.js';
import { readSession, cleanEmail } from './auth.js';
import { isAdmin, adminEmails } from './admin.js';
import { getUser } from './users.js';

const KEY = 'orbit:team';

export async function getTeamRaw() { return (await kvGet(KEY)) || []; }
export async function saveTeamRaw(list) { await kvSet(KEY, list); }

/* Equipo completo: administradoras + miembros cargados, sin repetir. */
export async function getTeam() {
  const raw = await getTeamRaw();
  const out = [];
  for (const email of adminEmails()) {
    const m = raw.find(x => x.email === email);
    const u = m ? null : await getUser(email).catch(() => null);
    out.push({ email, name: m?.name || (u?.name || '').split(/\s+/)[0] || 'Majo', admin: true });
  }
  for (const m of raw) if (!out.some(x => x.email === m.email)) out.push({ email: m.email, name: m.name || m.email, admin: false });
  return out;
}

export async function memberFor(email) {
  const e = cleanEmail(email);
  if (!e) return null;
  const team = await getTeam();
  return team.find(m => m.email === e) || null;
}

/* Devuelve la persona del equipo; si no, responde y devuelve null. */
export async function requireTeam(req, res) {
  const s = readSession(req);
  if (!s) { res.status(401).json({ error: 'unauthorized' }); return null; }
  const m = await memberFor(s.email);
  if (!m) { res.status(403).json({ error: 'forbidden' }); return null; }
  return { ...m, admin: isAdmin(s.email) };
}
