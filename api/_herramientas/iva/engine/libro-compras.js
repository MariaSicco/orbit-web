// Libro de IVA Compras del período: las columnas de cada factura y los totales del panel.
// Todo en centavos y en pesos (las facturas en moneda extranjera se convierten con su cotización).
//
// Columnas (como el Liquidador de Majo):
//   neto        neto gravado (suma de alícuotas)
//   iva         IVA con crédito fiscal (facturas A y M; en B y C es 0)
//   iibb        percepciones de Ingresos Brutos
//   percepciones percepciones y retenciones de IVA
//   municipales percepciones municipales
//   otros       no gravado + exento + impuestos internos y otros tributos
//   total       total de la factura
//   delta       total − suma de columnas (distinto de 0: algo no cierra)

import { convertir } from './dinero.js';
import { infoTipo } from './tipos.js';

export function columnas(c) {
  const ctz = c.cotizacion || 1;
  const signo = infoTipo(c.tipo)?.signo ?? 1;
  const pesos = x => signo * convertir(x || 0, ctz);
  const trib = tipos => (c.tributos || []).filter(t => tipos.includes(t.tipo)).reduce((s, t) => s + (t.importe || 0), 0);
  const neto = pesos((c.alicuotas || []).reduce((s, a) => s + (a.neto || 0), 0));
  const iva = pesos((c.alicuotas || []).reduce((s, a) => s + (a.iva || 0), 0));
  const iibb = pesos(trib(['percepcion_iibb']));
  const percepciones = pesos(trib(['percepcion_iva', 'retencion_iva']));
  const municipales = pesos(trib(['municipal']));
  let otros = pesos((c.noGravado || 0) + (c.exento || 0) + trib(['internos', 'otros']));
  // B y C: el IVA contenido suma al total pero no es crédito fiscal
  const ivaSinCredito = pesos(c.ivaInformativo || 0);
  const total = pesos(c.total || 0);
  // B y C sin IVA discriminado (monotributistas, consumidor final): lo que no está en otra columna no genera
  // crédito fiscal y va a "Otros / no gravado", así la factura cierra.
  const clase = infoTipo(c.tipo)?.clase;
  if ((clase === 'B' || clase === 'C') && !(c.alicuotas || []).length) {
    otros = total - (iibb + percepciones + municipales);
  }
  const delta = total - (neto + iva + iibb + percepciones + municipales + otros + ((clase === 'B' || clase === 'C') ? 0 : ivaSinCredito));
  return { neto, iva, iibb, percepciones, municipales, otros, ivaSinCredito, total, delta };
}

// Qué comprobantes quedan fuera del resumen: las ventas (las emitió el cliente) y los que no son A.
// La calculadora es solo para facturas A (y M, que es la A de quien recién se inscribe: también discrimina IVA).
// Un tipo sin leer no se excluye: queda en el resumen con su alerta para que se revise.
export function fueraDelResumen(c) {
  if (c.lado === 'venta') return 'venta';
  const clase = infoTipo(c.tipo)?.clase;
  if (clase && clase !== 'A' && clase !== 'M') return 'no_a';
  return null;
}

// Totales del panel, solo con las compras A. Ventas y comprobantes que no son A se cuentan aparte.
export function totalesCompras(comprobantes) {
  const t = { neto: 0, iva: 0, iibb: 0, percepciones: 0, municipales: 0, otros: 0, total: 0, facturas: 0, ventas: 0, noA: 0, paraRevisar: 0 };
  for (const c of comprobantes) {
    const fuera = fueraDelResumen(c);
    if (fuera === 'venta') { t.ventas++; continue; }
    if (fuera === 'no_a') { t.noA++; continue; }
    const k = columnas(c);
    for (const campo of ['neto', 'iva', 'iibb', 'percepciones', 'municipales', 'otros', 'total']) t[campo] += k[campo];
    t.facturas++;
    if (necesitaRevision(c)) t.paraRevisar++;
  }
  return t;
}

// IVA y neto por alícuota de las compras del resumen (solo las tasas que aparecen). Las notas de crédito restan.
export function porAlicuota(comprobantes) {
  const t = new Map();
  for (const c of comprobantes) {
    if (fueraDelResumen(c)) continue;
    const ctz = c.cotizacion || 1;
    const signo = infoTipo(c.tipo)?.signo ?? 1;
    for (const a of c.alicuotas || []) {
      const x = t.get(a.tasa) ?? { tasa: a.tasa, neto: 0, iva: 0 };
      x.neto += signo * convertir(a.neto || 0, ctz);
      x.iva += signo * convertir(a.iva || 0, ctz);
      t.set(a.tasa, x);
    }
  }
  return [...t.values()].filter(x => x.neto || x.iva).sort((a, b) => b.tasa - a.tasa);
}

// Una factura necesita revisión si todavía no se revisó y tiene alertas o algo no cierra.
export function necesitaRevision(c) {
  if (c.estadoRevision === 'aprobado') return false;
  return (c.alertas || []).length > 0 || Math.abs(columnas(c).delta) > 100;
}
