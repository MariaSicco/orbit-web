/* Acceso al panel de administración.
   Solo entran los emails listados en la variable ADMIN_EMAILS
   (separados por coma) y con la sesión iniciada. */
import { readSession } from './auth.js';

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export const adminReady = () => adminEmails().length > 0;
export const isAdmin = email => Boolean(email) && adminEmails().includes(String(email).toLowerCase());

/* Devuelve la sesión si es administradora; si no, responde y devuelve null. */
export function requireAdmin(req, res) {
  if (!adminReady()) { res.status(503).json({ error: 'admin_not_configured' }); return null; }
  const s = readSession(req);
  if (!s) { res.status(401).json({ error: 'unauthorized' }); return null; }
  if (!isAdmin(s.email)) { res.status(403).json({ error: 'forbidden' }); return null; }
  return s;
}
