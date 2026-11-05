/* La entrada a Mimitos en el dominio de By Majo: usa las mismas cuentas de siempre. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  if (/(^|;\s*)orbit_user=/.test(document.cookie) && !/salir=1/.test(location.search)) { location.replace('/mascotas'); return; }
  let conClave = false;
  const decir = (t, mal) => { const m = $('#msj'); m.textContent = t; m.className = mal ? 'msj mal' : 'msj'; };
  const q = new URLSearchParams(location.search);
  if (q.get('error')) decir('Ese enlace ya venció. Pedí uno nuevo.', true);
  if (q.get('salir') === '1') decir('Cerraste la sesión.');
  $('#cambiar').onclick = () => {
    conClave = !conClave;
    $('#conClave').hidden = !conClave;
    $('#ir').textContent = conClave ? 'Entrar' : 'Mandame el enlace';
    $('#cambiar').textContent = conClave ? 'Prefiero que me mandes un enlace' : 'Prefiero usar mi contraseña';
    decir('');
  };
  $('#f').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#mail').value.replace(/\s+/g, '').toLowerCase();
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { $('#mail').focus(); return decir('Revisá tu email.', true); }
    $('#ir').disabled = true;
    try {
      const r = await fetch(conClave ? '/api/auth/login' : '/api/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(conClave ? { email, password: $('#clave').value } : { email }) });
      const d = await r.json().catch(() => ({}));
      if (conClave && d.ok) return void location.replace('/mascotas');
      if (!conClave && d.ok && d.emailSent) return decir('¡Listo! Revisá tu mail: el enlace vence en 20 minutos.');
      if (!conClave && d.ok && d.link) return void (location.href = d.link);
      decir(conClave ? 'El email o la contraseña no coinciden. Probá con el enlace al mail.' : 'No se pudo mandar el mail. Probá de nuevo en un ratito.', true);
    } catch { decir('Sin conexión. Probá de nuevo.', true); }
    finally { $('#ir').disabled = false; }
  });
})();
