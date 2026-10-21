/* Orbit IVA · lectura de una factura con Claude.
   GET: estado de la cuenta (acceso y saldo de lecturas). POST: lee una factura y descuenta una lectura.
   La foto llega achicada desde el navegador, no se guarda y se descarta al responder. */
import { extraerComprobante } from '../_lib/iva/extraer.js';
import { accesoIva, estadoIva } from '../_lib/iva-acceso.js';
import { consumir, devolver, saldo } from '../_lib/creditos.js';

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BASE64 = 4_000_000; // Vercel limita el cuerpo a 4,5 MB

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const acc = await accesoIva(req);
  if (acc.status) return res.status(acc.status).json({ ok: false, error: acc.error, motivo: acc.motivo });
  if (req.method === 'GET') return res.status(200).json(await estadoIva(acc));
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' });

  const { imagen, mediaType, qrTexto, cuitCliente } = req.body ?? {};
  if (typeof imagen !== 'string' || !imagen || !TIPOS.includes(mediaType)) return res.status(400).json({ ok: false, error: 'Falta la imagen o el formato no es válido.' });
  if (imagen.length > MAX_BASE64) return res.status(413).json({ ok: false, error: 'La imagen es demasiado grande.' });

  // La lectura se reserva antes de llamar a Claude y se devuelve si falla
  if (!acc.ilimitado && !(await consumir(acc.email))) {
    return res.status(402).json({ ok: false, error: 'Te quedaste sin lecturas con IA.', motivo: 'sin_saldo', saldo: 0 });
  }
  try {
    const r = await extraerComprobante({ data: imagen, mediaType, qrTexto, cuitCliente });
    const { lecturaIa, ...respuesta } = r;
    return res.status(200).json({ ...respuesta, saldo: await saldo(acc.email), ilimitado: acc.ilimitado });
  } catch (e) {
    if (!acc.ilimitado) await devolver(acc.email);
    console.error('iva/extraer:', e?.status, e?.name);
    return res.status(502).json({ ok: false, error: 'La lectura con IA no respondió. Se usa el lector del teléfono.', saldo: await saldo(acc.email) });
  }
}

export const config = { maxDuration: 60 };
