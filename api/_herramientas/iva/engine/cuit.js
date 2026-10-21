// Dígito verificador de CUIT (módulo 11).
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function cuitValido(cuit) {
  const d = String(cuit ?? '').replace(/\D/g, '');
  if (d.length !== 11) return false;
  const suma = PESOS.reduce((s, p, i) => s + p * Number(d[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) return false;
  return dv === Number(d[10]);
}
