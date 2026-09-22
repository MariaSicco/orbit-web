/* Almacenamiento. Usa Upstash Redis (Vercel KV) si están las variables;
   si no, guarda en memoria para poder probar sin base de datos. */
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasKV = Boolean(URL_ && TOKEN);
const mem = new Map();

async function cmd(...args) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`KV ${r.status}`);
  const { result } = await r.json();
  return result;
}

export async function kvGet(key) {
  if (!hasKV) { const v = mem.get(key); return v && (!v.exp || v.exp > Date.now()) ? v.val : null; }
  const v = await cmd('GET', key);
  return v ? JSON.parse(v) : null;
}
export async function kvSet(key, val, ttlSeconds) {
  if (!hasKV) { mem.set(key, { val, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 }); return; }
  const args = ['SET', key, JSON.stringify(val)];
  if (ttlSeconds) args.push('EX', String(ttlSeconds));
  await cmd(...args);
}
export async function kvDel(key) { if (!hasKV) { mem.delete(key); return; } await cmd('DEL', key); }

/* Recorrido para los informes del panel: SCAN por patrón + lectura en tandas. */
export async function kvKeys(pattern, max = 5000) {
  if (!hasKV) {
    const re = new RegExp('^' + pattern.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return [...mem.keys()].filter(k => re.test(k));
  }
  const out = [];
  let cursor = '0', guard = 0;
  do {
    const res = await cmd('SCAN', cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = String(res?.[0] ?? '0');
    for (const k of res?.[1] || []) out.push(k);
  } while (cursor !== '0' && out.length < max && ++guard < 60);
  return out;
}
export async function kvMGet(keys) {
  if (!keys.length) return [];
  if (!hasKV) return keys.map(k => { const v = mem.get(k); return v && (!v.exp || v.exp > Date.now()) ? v.val : null; });
  const out = [];
  for (let i = 0; i < keys.length; i += 200) {
    const vals = await cmd('MGET', ...keys.slice(i, i + 200));
    for (const v of vals || []) { try { out.push(v ? JSON.parse(v) : null); } catch { out.push(null); } }
  }
  return out;
}

/* compras por email */
const purchasesKey = email => `orbit:purchases:${email.toLowerCase()}`;
export async function getPurchases(email) { return (await kvGet(purchasesKey(email))) || []; }
export async function addPurchase(email, purchase) {
  const list = await getPurchases(email);
  if (list.some(p => p.orderId === purchase.orderId)) return list;   // idempotente
  list.push(purchase);
  await kvSet(purchasesKey(email), list);
  return list;
}
