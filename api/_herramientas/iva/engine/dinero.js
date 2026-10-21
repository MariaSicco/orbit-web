// Importes en centavos (enteros) para no arrastrar errores de coma flotante.

// Acepta formatos argentinos ("1.234,56", "-1234,5") y el punto decimal ("1234.56").
export function aCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Math.round(valor * 100);
  let s = String(valor).trim().replace(/\s|\$/g, '');
  if (s === '' || s === '-') return 0;
  const negativo = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-]/g, '');
  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  if (ultimaComa > ultimoPunto) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPunto > ultimaComa && ultimaComa !== -1) {
    s = s.replace(/,/g, '');
  } else if (ultimaComa === -1 && ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s))) {
    // "1.234.567" o "5.000": en Argentina el punto solo, seguido de 3 dígitos, es separador de miles.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Importe inválido: "${valor}"`);
  const c = Math.round(n * 100);
  return negativo ? -c : c;
}

// Convierte un importe en moneda extranjera a pesos con la cotización del comprobante.
export function convertir(centavos, cotizacion = 1) {
  const ctz = typeof cotizacion === 'number' ? cotizacion : aCentavos(cotizacion) / 100;
  if (!ctz || ctz === 1) return centavos;
  return Math.round(centavos * ctz);
}

export function formatear(centavos) {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  const enteros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$ ${enteros},${String(abs % 100).padStart(2, '0')}`;
}
