/* Mimitos · "Hoy con {mascota}": la lista del día con un tilde por ítem. La usan el link del cuidador
   (mascota.html) y la app de la dueña (mascotas-app.js). Necesita mascotas-core.js (window.MZ).
   El servidor decide (api/_lib/pethoy.js): marca con SET NX y, si ya estaba hecho, responde 409 y acá se
   pide la confirmación explícita antes de mandar { force: true }. "Deshacer" dura unos segundos. */
(function (g) {
  'use strict';
  const Z = g.MZ, esc = Z.esc, I = Z.icon;
  const UI = { comida: ['bowl', 'comida', 'Comida'], med: ['pill', 'med', 'Remedio'], paseo: ['walk', 'viaje', 'Paseo'], otro: ['drop', 'plata', 'Otro'] };
  const hhmm = at => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }); };

  function html(hoy, name) {
    if (!hoy) return `<section class="sec hoy" aria-labelledby="h-hoy" aria-busy="true"><h2 id="h-hoy">Hoy con ${esc(name)}</h2><p class="dim">Cargando el día…</p></section>`;
    const items = hoy.items || [], done = items.filter(i => i.done).length;
    if (!items.length) return `<section class="sec hoy" aria-labelledby="h-hoy"><h2 id="h-hoy">Hoy con ${esc(name)}</h2><p class="dim">No hay nada para hoy.</p></section>`;
    return `<section class="sec hoy" aria-labelledby="h-hoy">
      <div class="sec-h"><h2 id="h-hoy">Hoy con ${esc(name)}</h2><span class="hoy-n" aria-live="polite">${done} de ${items.length}</span></div>
      <ul class="list hoy-list" role="list">${items.map(i => {
        const u = UI[i.kind] || UI.otro, d = i.done;
        const st = d ? `${I('check')}<span>${esc(d.by)}, ${hhmm(d.at)}</span>` : '<span>Marcar</span>';
        const aria = `${u[2]} ${i.time}: ${i.label}${i.qty ? ', ' + i.qty : ''}. ${d ? `Hecho por ${d.by} a las ${hhmm(d.at)}` : 'Sin marcar'}`;
        return `<li><button type="button" class="hoy-it${d ? ' on' : ''}" data-hoy="${esc(i.key)}" data-kind="${i.kind}" aria-pressed="${Boolean(d)}" aria-label="${esc(aria)}">
          <span class="ib c-${u[1]}" aria-hidden="true">${I(u[0])}</span>
          <span class="hoy-t" aria-hidden="true">${esc(i.time)}</span>
          <span class="what" aria-hidden="true"><b>${esc(i.label)}</b><small>${i.qty ? esc(i.qty).replace(/ /g, '&nbsp;') : esc(u[2])}</small></span>
          <span class="hoy-st" aria-hidden="true">${st}</span></button></li>`;
      }).join('')}</ul></section>`;
  }

  /* confirmación explícita para repetir (hoja con dos botones; por defecto queda en "No") */
  function confirmAgain(c) {
    const when = hhmm(c.at), by = c.by || 'alguien';
    const msg = c.kind === 'med' ? `⚠️ Esta dosis ya la marcó ${by} a las ${when}. ¿Seguro que querés marcarla de nuevo?`
      : c.kind === 'comida' ? `Ya comió a las ${when} (lo marcó ${by}). ¿Seguro que querés marcar otra comida?`
      : `Esto ya lo marcó ${by} a las ${when}. ¿Querés marcarlo de nuevo?`;
    const yes = c.kind === 'med' ? 'Sí, marcarla de nuevo' : 'Sí, marcar de nuevo';
    return new Promise(done => {
      const d = document.createElement('dialog');
      d.className = 'hoy-dlg'; d.setAttribute('aria-labelledby', 'hoyDlgT'); d.setAttribute('aria-describedby', 'hoyDlgM');
      d.innerHTML = `<div class="sheet"><h2 id="hoyDlgT">${c.kind === 'med' ? 'Dosis repetida' : 'Ya está marcado'}</h2><p id="hoyDlgM">${esc(msg)}</p>
        <button type="button" class="btn wide big" data-v="no">No, dejalo así</button><button type="button" class="btn ghost wide danger" data-v="si">${yes}</button></div>`;
      document.body.appendChild(d);
      const close = v => { d.close(); d.remove(); done(v); };
      d.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) close(b.dataset.v === 'si'); else if (e.target === d) close(false); });
      d.addEventListener('cancel', e => { e.preventDefault(); close(false); });
      d.showModal(); d.querySelector('[data-v="no"]').focus();
    });
  }

  /* ctx: { send(body) → Promise<{status, data}>, getBy() → nombre o null (frena), onUpdate(data), toast(msg, action?), ymd() } */
  function attach(root, ctx) {
    let busy = false;
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-hoy]'); if (!b || !root.contains(b) || busy) return;
      const by = ctx.getBy(); if (by == null) return;
      const body = { item: b.dataset.hoy, ymd: ctx.ymd(), by };
      busy = true; b.setAttribute('aria-busy', 'true');
      try {
        let r = await ctx.send(body);
        if (r.status === 409 && r.data?.error === 'ya_marcado') {
          if (!(await confirmAgain(r.data))) return;
          r = await ctx.send({ ...body, force: true });
        }
        if (r.status === 404 && r.data?.expired) return ctx.onUpdate(r.data);
        if (r.status === 429) return ctx.toast('Se marcaron muchas cosas seguidas. Esperá un rato y probá de nuevo.');
        if (r.status !== 200) return ctx.toast('No se pudo marcar. Revisá la conexión y probá de nuevo.');
        ctx.onUpdate(r.data);
        const it = (r.data.hoy?.items || []).find(x => x.key === body.item);
        ctx.toast(`Anotado${it ? ': ' + it.label : ''}${r.data.entry ? ' a las ' + hhmm(r.data.entry.at) : ''}.`, r.data.undo ? { label: 'Deshacer', fn: async () => {
          const u = await ctx.send({ undo: r.data.undo, ymd: body.ymd });
          if (u.status === 200) { ctx.onUpdate({ ...u.data, undone: r.data.undo }); ctx.toast('Listo, lo deshicimos.'); }
          else ctx.toast(u.status === 410 ? 'Ya pasó el rato para deshacer.' : 'No se pudo deshacer.');
        } } : null);
      } catch { ctx.toast('No se pudo marcar. Revisá la conexión y probá de nuevo.'); }
      finally { busy = false; b.removeAttribute('aria-busy'); }
    });
  }

  g.MZHOYUI = { html, attach, confirmAgain, hhmm };
})(window);
