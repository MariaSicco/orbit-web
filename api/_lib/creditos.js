/* Lecturas con IA de las herramientas online (Orbit IVA).
   Saldo por cuenta, en un contador atómico. Cada pago se acredita una sola vez (clave por pedido y producto).
   Los movimientos quedan guardados para poder revisarlos desde el panel. */
import { kvIncr, kvGetNum, kvSetNX, kvGet, kvSet } from './kv.js';

const saldoKey = email => `orbit:iva:saldo:${email.toLowerCase()}`;
const movKey = email => `orbit:iva:movimientos:${email.toLowerCase()}`;
const acreditadoKey = ref => `orbit:iva:acreditado:${ref}`;

export const saldo = email => kvGetNum(saldoKey(email));

async function anotar(email, mov) {
  const lista = (await kvGet(movKey(email))) || [];
  lista.unshift({ ...mov, fecha: new Date().toISOString() });
  await kvSet(movKey(email), lista.slice(0, 200));
}

/* Suma lecturas por un pago. ref = "pedido:producto". Idempotente: si ya se acreditó, no suma de nuevo. */
export async function acreditar(email, cantidad, ref) {
  if (!email || !(cantidad > 0)) return null;
  if (!(await kvSetNX(acreditadoKey(ref), true))) return saldo(email);
  const nuevo = await kvIncr(saldoKey(email), cantidad);
  await anotar(email, { tipo: 'acreditacion', cantidad, ref });
  return nuevo;
}

/* Descuenta una lectura. Si no alcanzaba, devuelve lo descontado y responde false. */
export async function consumir(email, cantidad = 1) {
  const nuevo = await kvIncr(saldoKey(email), -cantidad);
  if (nuevo < 0) { await kvIncr(saldoKey(email), cantidad); return false; }
  return true;
}
export const devolver = (email, cantidad = 1) => kvIncr(saldoKey(email), cantidad);
export const movimientos = async email => (await kvGet(movKey(email))) || [];
