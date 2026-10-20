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
/* SET NX: guarda solo si la clave no existe. Devuelve true si la tomó esta llamada (sirve de candado idempotente). */
export async function kvSetNX(key, val, ttlSeconds) {
  if (!hasKV) {
    const v = mem.get(key);
    if (v && (!v.exp || v.exp > Date.now())) return false;
    mem.set(key, { val, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0 });
    return true;
  }
  const args = ['SET', key, JSON.stringify(val), 'NX'];
  if (ttlSeconds) args.push('EX', String(ttlSeconds));
  return (await cmd(...args)) === 'OK';
}
/* Contador atómico: INCRBY (n puede ser negativo) y devuelve el valor nuevo.
   El TTL se pone solo cuando la clave nace (el valor nuevo es igual a n), así no se estira con cada uso.
   Sirve para topes con pedidos en paralelo: se suma primero y se compara después. */
export async function kvIncrBy(key, n = 1, ttlSeconds) {
  n = Math.trunc(Number(n) || 0);
  if (!hasKV) {
    const v = mem.get(key);
    const alive = v && (!v.exp || v.exp > Date.now());
    const val = (alive ? Number(v.val) || 0 : 0) + n;
    mem.set(key, { val, exp: alive ? v.exp : (ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0) });
    return val;
  }
  const val = Number(await cmd('INCRBY', key, String(n)));
  if (ttlSeconds && val === n) await cmd('EXPIRE', key, String(ttlSeconds));
  return val;
}
/* listas (registro de "Hoy con…"): RPUSH atómico, se recorta a las últimas `max` y vence a los ttl segundos */
const memList = key => { let v = mem.get(key); if (!v || !Array.isArray(v.val)) { v = { val: [], exp: 0 }; mem.set(key, v); } return v; };
export async function kvRPush(key, member, max = 300, ttlSeconds) {
  if (!hasKV) { const v = memList(key); v.val.push(member); if (v.val.length > max) v.val.splice(0, v.val.length - max); if (ttlSeconds) v.exp = Date.now() + ttlSeconds * 1000; return; }
  await cmd('RPUSH', key, member);
  await cmd('LTRIM', key, String(-max), '-1');
  if (ttlSeconds) await cmd('EXPIRE', key, String(ttlSeconds));
}
export async function kvLRange(key) {
  if (!hasKV) { const v = mem.get(key); return v && Array.isArray(v.val) && (!v.exp || v.exp > Date.now()) ? [...v.val] : []; }
  return (await cmd('LRANGE', key, '0', '-1')) || [];
}
export async function kvLRem(key, member) {
  if (!hasKV) { const v = mem.get(key); if (v && Array.isArray(v.val)) v.val = v.val.filter(x => x !== member); return; }
  await cmd('LREM', key, '0', member);
}
/* conjuntos (índices chicos): agregar, sacar y listar */
const memSet = key => { let v = mem.get(key); if (!v || !(v.val instanceof Set)) { v = { val: new Set(), exp: 0 }; mem.set(key, v); } return v.val; };
export async function kvSAdd(key, member) { if (!hasKV) { memSet(key).add(member); return; } await cmd('SADD', key, member); }
export async function kvSRem(key, member) { if (!hasKV) { memSet(key).delete(member); return; } await cmd('SREM', key, member); }
export async function kvSMembers(key) { if (!hasKV) return [...memSet(key)]; return (await cmd('SMEMBERS', key)) || []; }
export async function kvSIsMember(key, member) { if (!hasKV) return memSet(key).has(member); return Number(await cmd('SISMEMBER', key, member)) === 1; }
export async function kvSCard(key) { if (!hasKV) return memSet(key).size; return Number(await cmd('SCARD', key)) || 0; }

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
