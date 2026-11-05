/* Mimitos abierta desde mimitos.bymajostudio.com (compras de By Majo): misma app, otra
   marca. Cambia lo que se lee en pantalla (y en el PDF de la libreta). En orbitando.com.ar no hace nada. */
(() => {
  'use strict';
  if (location.hostname !== 'mimitos.bymajostudio.com') return;
  window.MIMITOS_BYMAJO = true;
  const CAMBIOS = [
    [/hecho con Orbit/g, 'hecho con By Majo'],
    [/by Orbit/g, 'by Majo'],
    [/orbitando\.com\.ar\/mascotas/g, 'mimitos.bymajostudio.com'],
    [/cuenta de Orbit/g, 'cuenta'],
    [/compra en Orbit/g, 'compra'],
    [/^Orbit$/, 'By Majo'],
  ];
  const texto = n => {
    let t = n.nodeValue;
    if (!t || !/Orbit|orbitando/.test(t)) return;
    for (const [a, b] of CAMBIOS) t = t.replace(a, b);
    if (t !== n.nodeValue) n.nodeValue = t;
  };
  const recorrer = raiz => {
    if (raiz.nodeType === 3) return texto(raiz);
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) texto(w.currentNode);
    if (raiz.querySelectorAll) raiz.querySelectorAll('.made a').forEach(a => { a.href = 'https://bymajostudio.com'; a.querySelector('svg')?.remove(); });
  };
  const empezar = () => {
    recorrer(document.body);
    new MutationObserver(ms => ms.forEach(m => m.type === 'characterData' ? texto(m.target) : m.addedNodes.forEach(recorrer))).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  document.body ? empezar() : document.addEventListener('DOMContentLoaded', empezar);
})();
