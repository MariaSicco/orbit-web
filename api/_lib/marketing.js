/* Listas de Brevo: se suman contactos con sus etiquetas. */
export async function upsertContact({ email, name, lists = [], attributes = {} }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { ok: false, skipped: true };
  const listIds = lists.map(Number).filter(Boolean);
  const body = {
    email: email.toLowerCase(),
    updateEnabled: true,
    attributes: { ...(name ? { NOMBRE: name } : {}), ...attributes },
    ...(listIds.length ? { listIds } : {}),
  };
  const r = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: r.ok || r.status === 204 };
}
export const listClientes = () => (process.env.BREVO_LIST_CLIENTES || '').split(',').filter(Boolean);
export const listNews = () => (process.env.BREVO_LIST_NEWSLETTER || '').split(',').filter(Boolean);
