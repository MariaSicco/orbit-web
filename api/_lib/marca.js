/* Mimitos también se abre en el dominio de By Majo (quien la compra en bymajostudio.com
   la usa ahí). Misma app, mismas cuentas y misma base: solo cambia la marca que se ve.
   En cualquier otro dominio, todo sigue igual que siempre. */
export const MIMITOS_HOST = 'mimitos.bymajostudio.com';
export const esMimitos = req => String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim().toLowerCase() === MIMITOS_HOST;
