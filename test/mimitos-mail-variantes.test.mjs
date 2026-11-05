/* Mimitos mail: el nombre mal escrito ("Feliza") y el link del laboratorio en un mail que te reenviaste (05/11) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../api/_lib/petmail.js';
import { extractLinks } from '../api/_lib/petlinks.js';

const doc = { pets: [{ name: 'Felisa', breed: 'Mestiza' }] };

test('variantes del nombre: s, z y c', () => {
  assert.deepEqual(M.nameVariants('Felisa'), ['felisa', 'feliza']);
  assert.ok(M.nameVariants('Lucía').includes('lusia'));
  assert.ok(M.queryParts(doc).names.includes('feliza'), 'la variante va a la consulta del proveedor');
});

test('asunto con solo el nombre, sin adjunto: se lee el cuerpo (probe); con algo en contra, no', () => {
  const rel = M.relContext(doc);
  assert.equal(M.judge({ subject: 'Feliza', from: 'María <maria@outlook.com>', files: [] }, rel).show, 'probe');
  assert.equal(M.judge({ subject: 'Pedido confirmado Feliza', from: 'Tienda <x@tienda.com>', files: [] }, rel).show, '');
  assert.equal(M.judge({ subject: 'Turno de Felisa', from: 'María <maria@outlook.com>', files: [] }, rel).show, '');
});

test('link en texto plano: cuenta lo que dice antes ("sus resultados:")', () => {
  const l = extractLinks({ text: '¡Hola! Aquí tiene disponible sus resultados: https://panda.aplicacionmedica.site/_ext/frmOrdenesMedicas.aspx?id=ABC123' });
  assert.equal(l.length, 1);
  assert.equal(l[0].host, 'panda.aplicacionmedica.site');
  assert.equal(extractLinks({ text: 'Mirá esto https://www.instagram.com/p/xyz y https://tienda.com/carrito' }).length, 0);
});
