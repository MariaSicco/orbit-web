/* "Dónde puede rendir tu plata" · ÚNICO archivo de datos de tasas.
   Se actualiza a mano (próxima: 18/10/2026). Por CATEGORÍA, nunca por marca,
   sin links de referido. Cada dato con fuente y fecha: si tiene más de 7 días,
   la app avisa que puede haber cambiado.
   Fuente de los valores: product/mejoras/2026-10-13-mi-mes-dolores-y-ahorro.md, 2.3.
   confirmar: true = dato a verificar antes de encender la pantalla. */
export const TASAS = {
  revisado: '2026-10-13',
  opciones: [
    {
      id: 'plazo-fijo', nombre: 'Plazo fijo a 30 días', que: 'Un depósito en un banco, por un plazo fijo.',
      tna: { min: 21.52, max: 21.52 }, detalle: 'Promedio del sistema',
      fuente: 'BCRA, serie 12', url: 'https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias', fecha: '2026-10-09',
      tener: 'La plata queda quieta durante el plazo. Tiene garantía de depósitos hasta un tope.', clase: 'deposito',
    },
    {
      id: 'remunerada', nombre: 'Cuenta remunerada o billetera', que: 'El saldo rinde todos los días.',
      tna: { min: 19, max: 24 }, detalle: 'Varía por escalones y topes',
      fuente: 'Prensa y comparadores', url: null, fecha: '2026-10-13', confirmar: true,
      tener: 'Suele ser un fondo común money market: no es un depósito bancario.', clase: 'fondo',
    },
    {
      id: 'money-market', nombre: 'FCI money market', que: 'Un fondo común de muy corto plazo.',
      tna: { min: 20, max: 23 }, detalle: 'Rango de referencia',
      fuente: 'Ranking con datos de CAFCI', url: 'https://www.cafci.org.ar', fecha: '2026-09-24', confirmar: true,
      tener: 'Se rescata en el día. El rendimiento no está garantizado.', clase: 'fondo',
    },
  ],
  inflacion: {
    mensual: 1.9, mes: '2026-09', rem12: 21.1,
    fuente: 'INDEC (IPC) y BCRA (REM)', url: 'https://www.indec.gob.ar', fecha: '2026-10-13', confirmar: true,
  },
};

export const AVISO_LEGAL = 'Esto es información general, no una recomendación de inversión ni asesoramiento personalizado. Orbit no vende ni intermedia productos financieros y no cobra de ninguna entidad. Las tasas son nominales anuales (TNA), salen de la fuente que ves, a la fecha indicada, y pueden cambiar. Los cálculos son orientativos, antes de impuestos, y no garantizan resultados. Las billeteras suelen invertir tu saldo en fondos comunes, que no son depósitos bancarios. Antes de decidir, confirmá las condiciones con la entidad.';
export const avisoCorto = fecha => `Cuenta orientativa con datos del ${fecha}. No es una recomendación.`;
