/* Mimitos · F5 "Para el vete" (interruptor FEATURES.vete). Una hoja de una página para mostrar en la consulta:
   vacunas al día o vencidas, antiparasitarios, peso, remedios, problemas de salud y "Algo pasó" de los últimos 30 días.
   Sale de lo cargado; no interpreta nada. Se comparte por WhatsApp o se copia. */
(() => {
'use strict';
const A = window.MZAPP, Z = window.MZ, F = window.MZFEAT;
if (!A || !Z || !F || !F.on.vete) return;
const { esc, iso } = Z, I = Z.icon;
const ST = { activa: 'Lo tiene', controlada: 'Controlado', resuelta: 'Ya pasó' };
const sinceTxt = s => { s = String(s || ''); const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/); if (!m) return s; const d = new Date(+m[1], +m[2] - 1, +(m[3] || 1)); return m[3] ? d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }); };
const n1 = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function sheet(p) {
  const dd = A.dd, up = Z.upcoming(p);
  const vac = p.records.filter(r => r.type === 'vacuna' && r.date).sort((a, b) => b.date.localeCompare(a.date));
  const names = [...new Set(vac.map(r => r.name))].slice(0, 6), lastOf = n => vac.find(r => n1(r.name) === n1(n));
  const anti = p.records.filter(r => r.type === 'desparasitacion' && r.date).sort((a, b) => b.date.localeCompare(a.date));
  const inter = anti.find(r => Z.scopeOf(r) === 'interna'), exter = anti.find(r => Z.scopeOf(r) === 'externa');
  const w = [...p.weights].sort((a, b) => a.date.localeCompare(b.date)), wl = w.at(-1), w6 = w.find(x => x.date >= iso(new Date(Date.now() - 183 * Z.DAY)));
  const meds = p.meds.filter(m => Z.medState(m, p.log).state !== 'ended'), eps = Z.recentEpisodes(p, 30);
  const due = r => { const x = up.find(u => u.r.name === r.name && u.r.type === r.type); return !x ? '' : x.s.days < 0 ? ' · <b class="v-late">vencida</b>' : ` · próx. ${dd(x.r.next)}`; };
  const sex = p.sex === 'h' ? 'hembra' : p.sex === 'm' ? 'macho' : '';
  const li = (k, v) => `<li><b>${k}</b><span>${v}</span></li>`;
  return `<article class="vete" aria-label="Resumen de ${esc(p.name)} para el veterinario">
    <header class="vete-h">${A.avatar(p, 'big')}<div><h2>${esc(p.name)}</h2><p>${esc([Z.species(p), p.breed, sex, p.birth ? `${Z.age(p.birth)} (${dd(p.birth)})` : '', p.neutered === 'si' ? (p.sex === 'h' ? 'castrada' : p.sex === 'm' ? 'castrado' : 'castrado/a') : p.neutered === 'no' ? (p.sex === 'h' ? 'no castrada' : p.sex === 'm' ? 'no castrado' : 'sin castrar') : ''].filter(Boolean).join(' · '))}</p>${p.chip ? `<p class="num">Microchip ${esc(p.chip)}</p>` : ''}</div></header>
    ${p.allergies ? `<p class="vete-alert">${I('alert')}<span><b>Alergias:</b> ${esc(p.allergies)}</span></p>` : ''}
    <div class="vete-g">
      <section><h3>Vacunas</h3>${names.length ? `<ul>${names.map(n => { const r = lastOf(n); return li(esc(n), dd(r.date) + due(r)); }).join('')}</ul>` : '<p class="dim">Sin vacunas cargadas.</p>'}</section>
      <section><h3>Antiparasitarios</h3><ul>${[['Interno', inter], ['Externo', exter]].map(([k, r]) => li(k, r ? `${esc(r.name)} · ${dd(r.date)}${due(r)}` : 'Sin dato')).join('')}</ul></section>
      <section><h3>Peso</h3>${wl ? `<p class="vete-big num">${A.kg(wl.kg)}</p><p class="dim">${dd(wl.date)}${w6 && w6 !== wl ? ` · ${wl.kg - w6.kg >= 0 ? '+' : ''}${String(Math.round((wl.kg - w6.kg) * 10) / 10).replace('.', ',')} kg desde ${dd(w6.date)}` : ''}</p>` : '<p class="dim">Sin peso cargado.</p>'}</section>
      <section><h3>Remedios</h3>${meds.length || p.chronic ? `<ul>${meds.map(m => li(esc(m.name), `${esc(m.dose || '')}${m.dose ? ' · ' : ''}cada ${m.every} h`)).join('')}${p.chronic ? li('De siempre', esc(p.chronic)) : ''}</ul>` : '<p class="dim">Ninguno.</p>'}</section>
      <section><h3>Problemas de salud</h3>${p.conditions.length ? `<ul>${p.conditions.map(c => li(esc(c.name), `${ST[c.status] || ''}${c.since ? ' · desde ' + esc(sinceTxt(c.since)) : ''}`)).join('')}</ul>` : '<p class="dim">Ninguno cargado.</p>'}</section>
      <section class="vete-wide"><h3>Algo pasó (últimos 30 días)</h3>${eps.length ? `<ul>${eps.slice(0, 6).map(g => li(`${esc(Z.epTitle(g.last))}${g.n > 1 ? ` · ${g.n} veces` : ''}`, `${dd(g.last.date)}${g.sevs.length ? ' · ' + esc(g.sevs.join(', ')) : ''}${g.notes.length ? ' · ' + esc(g.notes.join(' · ')) : ''}`)).join('')}</ul>` : '<p class="dim">Nada anotado.</p>'}</section>
    </div>
    <p class="vete-f">Mimitos by Orbit · ${dd(iso(Z.today()))} · Datos cargados por la familia. Mimitos es un organizador: no reemplaza al veterinario.</p>
  </article>`;
}
function render(p) {
  return `${A.backTo(p, 'libreta', 'Libreta')}
    <div class="lib-top"><div><span class="eyebrow">${esc(p.name)}</span><h1 class="h-xl">Para el vete</h1><p class="dim" style="margin-top:6px">Mostrala en la consulta o mandásela a tu veterinaria.</p></div>
      <div class="lib-tools"><button class="btn sm" data-act="veteShare">${I('share')} Compartir</button></div></div>
    ${sheet(p)}
    <button class="btn ghost wide" data-act="go" data-to="pdf">${I('print')} La libreta completa en PDF</button>`;
}
F.routes.vete = render;
(F.hooks.libretaTools ||= []).push(() => `<button class="btn sm ghost" data-act="go" data-to="vete">${I('steth')} Para el vete</button>`);
(F.hooks.inicioQuick ||= []).push(() => [['go:vete', 'steth', 'cuida', 'Para el vete', 'Una hoja para mostrar en la consulta']]);
F.actions.veteShare = async (b, p) => {
  const txt = document.querySelector('.vete')?.innerText.replace(/\n{2,}/g, '\n') || '';
  try { if (navigator.share) return await navigator.share({ title: `${p.name} · para el vete`, text: txt }); await navigator.clipboard.writeText(txt); A.toast('Copiado. Pegalo en el chat de tu veterinaria.'); }
  catch (e) { if (e?.name !== 'AbortError') A.toast('No se pudo compartir. Mostrá la pantalla en la consulta.'); }
};
window.MZVETE = { sheet, render };
})();
