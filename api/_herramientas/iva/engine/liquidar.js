// Liquidación ESTIMADA de IVA de un período. No es la declaración jurada: es un resumen para revisar.
// Reglas y fuentes: ver ../casos/README.md. Todo en centavos.
//
// Débito fiscal  = Σ IVA de ventas (clases A, B y M; las notas de crédito restan)
// Crédito fiscal = Σ IVA de compras clases A y M (NC restan). B y C no computan.
// Saldo técnico  = Débito − Crédito − saldo técnico a favor del período anterior
// Si el saldo técnico es positivo, se le restan los ingresos directos (percepciones y retenciones de IVA)
// y el saldo de libre disponibilidad anterior. Si no, queda saldo técnico a favor y los ingresos directos
// pasan a saldo de libre disponibilidad.

import { convertir } from './dinero.js';
import { infoTipo, normalizarCodigo } from './tipos.js';

const TASAS = [0, 2.5, 5, 10.5, 21, 27];

export function ivaDe(c) {
  if (c.alicuotas?.length) return c.alicuotas.reduce((s, a) => s + (a.iva || 0), 0);
  return c.ivaTotal || 0;
}

export function liquidar(comprobantes, periodo = {}) {
  const stAnterior = periodo.saldoTecnicoAnterior || 0;
  const ldAnterior = periodo.saldoLibreDisponibilidadAnterior || 0;
  const retencionesManuales = periodo.retencionesIva || 0;

  const pendientes = comprobantes.filter(c => (c.estadoRevision || 'aprobado') !== 'aprobado');
  if (pendientes.length) {
    return { bloqueada: true, pendientes: pendientes.length, motivo: `Faltan aprobar ${pendientes.length} lecturas.` };
  }

  let debito = 0, credito = 0, percepcionesIva = 0, retencionesIva = retencionesManuales, percepcionesIibb = 0;
  let sinCredito = 0;
  const porAlicuota = { ventas: {}, compras: {} };
  const alertas = [];

  for (const c of comprobantes) {
    const tipo = infoTipo(c.tipo);
    const ctz = c.cotizacion || 1;
    if (!tipo) {
      alertas.push({ tipo: 'caso_especial', comprobanteId: c.id, mensaje: `Tipo ${normalizarCodigo(c.tipo) || '?'} fuera del alcance del MVP: no se calcula.` });
      continue;
    }
    const signo = tipo.signo;
    const iva = signo * convertir(ivaDe(c), ctz);

    if (c.lado === 'venta') {
      if (tipo.clase === 'C') {
        alertas.push({ tipo: 'venta_clase_c', comprobanteId: c.id, mensaje: 'Venta clase C en un responsable inscripto: revisar.' });
        continue;
      }
      debito += iva;
      acumularAlicuotas(porAlicuota.ventas, c, signo, ctz);
    } else if (c.lado === 'compra') {
      if (tipo.clase === 'A' || tipo.clase === 'M') {
        credito += iva;
        acumularAlicuotas(porAlicuota.compras, c, signo, ctz);
        if (tipo.clase === 'M') alertas.push({ tipo: 'clase_m', comprobanteId: c.id, mensaje: 'Comprobante clase M: verificar el régimen de retención aplicable.' });
      } else {
        sinCredito++;
      }
    } else {
      throw new Error(`Comprobante ${c.id}: lado desconocido "${c.lado}"`);
    }

    for (const t of c.tributos || []) {
      const imp = signo * convertir(t.importe || 0, ctz);
      if (t.tipo === 'percepcion_iva') percepcionesIva += imp;
      else if (t.tipo === 'retencion_iva') retencionesIva += imp;
      else if (t.tipo === 'percepcion_iibb') percepcionesIibb += imp;
    }
  }

  const ingresosDirectos = percepcionesIva + retencionesIva;
  const saldoTecnico = debito - credito - stAnterior;
  let aPagar = 0, saldoTecnicoAFavor = 0, saldoLibreDisponibilidadAFavor = 0;
  if (saldoTecnico > 0) {
    const resto = saldoTecnico - ingresosDirectos - ldAnterior;
    aPagar = Math.max(resto, 0);
    saldoLibreDisponibilidadAFavor = Math.max(-resto, 0);
  } else {
    saldoTecnicoAFavor = -saldoTecnico;
    saldoLibreDisponibilidadAFavor = ingresosDirectos + ldAnterior;
  }

  return {
    bloqueada: false,
    debito, credito, saldoTecnico, saldoTecnicoAFavor,
    percepcionesIva, retencionesIva, ingresosDirectos,
    aPagar, saldoLibreDisponibilidadAFavor,
    percepcionesIibb, comprobantesSinCredito: sinCredito,
    porAlicuota, alertas,
  };
}

function acumularAlicuotas(dest, c, signo, ctz) {
  for (const a of c.alicuotas || []) {
    if (!TASAS.includes(a.tasa)) throw new Error(`Comprobante ${c.id}: alícuota ${a.tasa}% no reconocida`);
    const k = String(a.tasa);
    dest[k] ??= { neto: 0, iva: 0 };
    dest[k].neto += signo * convertir(a.neto || 0, ctz);
    dest[k].iva += signo * convertir(a.iva || 0, ctz);
  }
}
