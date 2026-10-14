/* Mimitos · reglas compartidas entre la app (navegador) y el servidor (api/_lib/petpush.js y el cron).
   Es un script clásico sin import/export: en el navegador se carga con <script> antes de mascotas-core.js,
   y en Node se importa por efecto (import '../../assets/js/mascotas-rules.js'). Las dos partes leen
   globalThis.MZRULES, así la app y los avisos no pueden divergir. */
(function (g) {
  'use strict';
  /* fecha del calendario sugerido: tiene próxima, todavía no fecha de aplicación, y la marca en las notas */
  const SUG_NOTE = 'Calendario sugerido: referencia general, confirmalo con tu veterinario.';
  const isSug = r => Boolean(r) && !r.date && String(r.notes || '').startsWith('Calendario sugerido');
  const key = r => (r.type || '') + '|' + String(r.name || '').toLowerCase().trim();
  /* lo último de cada tipo + nombre manda: si ya cargaste la Séxtuple real, la sugerida (sin fecha)
     y las dosis anteriores dejan de contar. Una dosis adelantada reemplaza a la próxima que estaba prevista.
     Con la misma fecha de aplicación gana la cargada después ("Ya se la di" el mismo día que la anterior). */
  function latest(records) {
    const last = new Map();
    for (const r of records || []) {
      const k = key(r), prev = last.get(k);
      if (!prev || (r.date || '') >= (prev.date || '')) last.set(k, r);
    }
    return [...last.values()];
  }
  /* las próximas fechas vigentes, ordenadas */
  const dueRecords = records => latest(records).filter(r => r.next).sort((a, b) => a.next.localeCompare(b.next));
  g.MZRULES = { SUG_NOTE, isSug, latest, dueRecords };
})(typeof window !== 'undefined' ? window : globalThis);
