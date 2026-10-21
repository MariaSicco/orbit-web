// Utilidades de interfaz compartidas por la calculadora y el conciliador.
import { formatear } from '../engine/dinero.js';

export const $ = sel => document.querySelector(sel);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plata = c => formatear(c ?? 0);
export const plataO = c => (c == null ? '—' : formatear(c));
export const aInput = c => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
export const cuitLindo = c => String(c ?? '').replace(/^(\d{2})(\d{8})(\d)$/, '$1-$2-$3');
export const fechaCorta = f => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f.slice(8)}/${f.slice(5, 7)}` : f ?? '');
export const fechaLarga = f => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f.slice(8)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f ?? '');
export const nombreMes = mes => { const t = new Date(`${mes}-15`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };

export function avisar(texto) {
  const t = document.createElement('div');
  t.className = 'toast'; t.role = 'status'; t.textContent = texto;
  $('#avisos').replaceChildren(t);
  setTimeout(() => t.remove(), 4200);
}

// Diálogo simple. Los formularios que tiene adentro los maneja el submit global de cada módulo.
export function abrirDialogo(titulo, cuerpo) {
  cerrarDialogo();
  const d = document.createElement('div');
  d.className = 'dialogo';
  d.innerHTML = `<div class="dialogo-caja" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo">
    <div class="fila" style="justify-content:space-between;align-items:center"><h2 id="dialogo-titulo">${titulo}</h2><button class="btn chico" data-accion="cerrar-dialogo" aria-label="Cerrar">✕</button></div>
    ${cuerpo}</div>`;
  d.addEventListener('click', e => { if (e.target === d) cerrarDialogo(); });
  document.body.append(d);
  (d.querySelector('input, select, textarea') ?? d.querySelector('button'))?.focus();
}
export function cerrarDialogo() { document.querySelector('.dialogo')?.remove(); }

// Nombre de archivo seguro para mostrar y guardar
export const nombreSeguro = n => String(n ?? 'archivo').replace(/[\u0000-\u001f<>:"\\|?*]/g, '').slice(0, 120) || 'archivo';
