/* Catálogo del lado del servidor: precios y archivos.
   Los precios en pesos (ARS) se usan en Mercado Pago; USD en PayPal.
   El archivo de cada producto se define con una variable de entorno,
   por ejemplo ORBIT_FILE_OB_001 = https://.../content-system.zip */
export const CATALOG = {
  'ob-001': { code: 'OB—001', name: 'Content System',     usd: 39, ars: 39000 },
  'ob-002': { code: 'OB—002', name: 'Creator Library',    usd: 49, ars: 49000 },
  'ob-003': { code: 'OB—003', name: 'Business OS',        usd: 59, ars: 59000 },
  'ob-004': { code: 'OB—004', name: 'AI Workflow System', usd: 69, ars: 69000, soon: true },
};
export const fileUrl = id => process.env[`ORBIT_FILE_${id.toUpperCase().replace(/-/g, '_')}`] || null;
export const siteUrl = req => process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
