/* Vencimientos · nota de servicios pegada y PDF adjuntos de los mails. Datos inventados. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const N = await import('../api/_herramientas/vencimientos/notas.js');
const L = await import('../api/_herramientas/vencimientos/correo-lector.js');
const HOY = '2026-10-15';

test('nota: servicio, número de cliente, día y monto por renglón', () => {
  const cs = N.serviciosDesdeNota(`Edenor cliente 0012345678 vence 21
ABL partida 1234567-8 $16.000
wifi telecentro 98765432
celu personal línea 11 5555-1234
Metrogas nro 40-123456-7
comprar pan`, HOY);
  const por = p => cs.find(c => c.preset === p);
  assert.equal(cs.length, 5);
  assert.equal(por('edenor').nroCliente, '0012345678');
  assert.equal(por('edenor').proximo, '2026-10-21');
  assert.equal(por('edenor').aConfirmar, false);
  assert.equal(por('abl').monto, 1600000);
  assert.equal(por('abl').nroCliente, '1234567-8');
  assert.equal(por('abl').aConfirmar, true);
  assert.equal(por('internet').nombre, 'Telecentro');
  assert.equal(por('celular').nombre, 'Personal');
  assert.equal(por('metrogas').nroCliente, '40-123456-7');
});

test('mail con PDF: si el cuerpo no trae monto, sale del adjunto, con el número de cliente', () => {
  const mails = [{ id: 'a', de: 'Edenor <facturadigital@edenor.com>', asunto: 'Tu factura ya está disponible', fecha: '2026-10-02',
    texto: 'Hola, adjuntamos tu factura. Vencimiento: 21/10/2026',
    adjunto: 'EDENOR S.A.\nN° de cliente: 00123456789\nPeríodo 09/2026\nTotal a pagar $ 44.800,50\n1° vencimiento 21/10/2026\n2° vencimiento 28/10/2026' }];
  const [c] = L.cuentasDesdeMails(mails, '2026-10-15');
  assert.equal(c.monto, 4480050);
  assert.equal(c.proximo, '2026-10-21');
  assert.equal(c.nroCliente, '00123456789');
  assert.equal(c.delPdf, true);
});

test('número de cliente: no confunde un monto con el número', () => {
  assert.equal(L.numeroDeCliente('Total de la cuenta 12.345,00'), null);
  assert.equal(L.numeroDeCliente('Cuenta N° 7654321'), '7654321');
  assert.equal(L.adjuntoUtil('Netflix <info@netflix.com>', 'Tu recibo'), false);
  assert.equal(L.adjuntoUtil('Edenor <facturadigital@edenor.com>', 'Tu factura'), true);
});
