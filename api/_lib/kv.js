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
