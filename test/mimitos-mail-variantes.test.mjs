/* Mimitos mail: el nombre mal escrito ("Feliza") y el link del laboratorio en un mail que te reenviaste (05/11) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../api/_lib/petmail.js';
import { extractLinks, safeFetch } from '../api/_lib/petlinks.js';

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

test('loose: toma el link del laboratorio aunque no diga "resultado", sin redes ni bajas', () => {
  const body = { html: '<p>Hola</p><a href="https://panda.aplicacionmedica.site/_ext/frmOrdenesMed.aspx?k=1">https://panda.aplicacionmedica.site/_ext/frmOrdenesMed.aspx?k=1</a> <a href="https://instagram.com/x">IG</a>' };
  assert.equal(extractLinks(body).length, 0, 'estricto: no lo reconoce');
  const l = extractLinks(body, { loose: true });
  assert.deepEqual(l.map(x => x.host), ['panda.aplicacionmedica.site']);
});

test('link a una página con el PDF adentro (iframe o link .pdf): se sigue una vez', async () => {
  const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(300, 1)]);
  const pub = async () => [{ address: '200.45.12.3', family: 4 }];
  const page = Buffer.from('<!doctype html><html><body><iframe src="/docs/hemograma.pdf"></iframe></body></html>');
  const get = async url => url.endsWith('.pdf') ? { status: 200, headers: { 'content-type': 'application/pdf' }, body: PDF } : { status: 200, headers: { 'content-type': 'text/html' }, body: page };
  const r = await safeFetch('https://lab.ejemplo.com/ver?id=1', { lookup: pub, get });
  assert.equal(r.type, 'application/pdf'); assert.equal(r.finalUrl, 'https://lab.ejemplo.com/docs/hemograma.pdf');
  /* página sin PDF a la vista: sigue diciendo que es una página */
  const plain = async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<!doctype html><p>Ingresá con tu DNI</p>') });
  await assert.rejects(safeFetch('https://lab.ejemplo.com/ver?id=2', { lookup: pub, get: plain }), e => e.code === 'html');
});
