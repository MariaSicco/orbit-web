/* Actualizar datos de la cuenta. */
import { readBody, readSession } from '../_lib/auth.js';
import { getUser, saveUser } from '../_lib/users.js';
import { upsertContact, listNews } from '../_lib/marketing.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const { name, news } = await readBody(req);
  const user = (await getUser(s.email)) || { email: s.email, createdAt: new Date().toISOString() };
  if (typeof name === 'string') user.name = name.slice(0, 80);
  if (typeof news === 'boolean') user.news = news;
  await saveUser(user);
  if (news === true) await upsertContact({ email: s.email, name: user.name, lists: listNews(), attributes: { ORIGEN: 'panel' } }).catch(() => {});
  res.status(200).json({ ok: true, name: user.name || '', news: Boolean(user.news) });
}
