/* Cuenta "pesada" y realista para medir el tamaño del contexto de Preguntale: 2 mascotas, ~2 años de uso. */
const pad = n => String(n).padStart(2, '0');
const day = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export function bigDoc() {
  const months = []; for (let i = 0; i < 24; i++) { const y = 2024 + Math.floor((i + 10) / 12), m = (i + 10) % 12 + 1; months.push([y, m]); }
  const mk = (id, name, species, off) => ({
    id, name, species, speciesOther: '', breed: species === 'perro' ? 'Mestiza' : 'Común europeo', sex: 'h', birth: '2020-03-10', neutered: 'si', allergies: 'Pollo', chronic: '', notes: 'Le tiene miedo a la pirotecnia.',
    weight: 9, chip: '900000000000001', vet: { name: 'Veterinaria Panda', phone: '11 4444-0000', er: 'Guardia 24 h Vet Sur', erPhone: '11 5555-0000' },
    food: { brand: 'Croqueta Uno Adulto', bagKg: 15, dailyG: 220, opened: '2026-10-01', bags: months.slice(-12).map(([y, m], i) => ({ date: day(y, m, 2), kg: 15, brand: i === 8 ? 'Croqueta Dos Light' : 'Croqueta Uno Adulto', price: 38000 + i * 1500 })) },
    records: months.flatMap(([y, m], i) => [
      { id: `${id}p${i}`, type: 'desparasitacion', scope: 'externa', name: 'Pipeta antipulgas', date: day(y, m, 10 + off), next: day(y, m, 28), notes: '' },
      ...(i % 3 === 0 ? [{ id: `${id}i${i}`, type: 'desparasitacion', scope: 'interna', name: 'Comprimido antiparasitario', date: day(y, m, 12), next: '', notes: '' }] : []),
      ...(i % 12 === 0 ? [{ id: `${id}v${i}`, type: 'vacuna', name: 'Antirrábica', date: day(y, m, 5), next: day(y + 1, m, 5), lot: 'Nobivac R A123', vet: 'Veterinaria Panda', notes: '' }, { id: `${id}s${i}`, type: 'vacuna', name: 'Séxtuple', date: day(y, m, 6), next: day(y + 1, m, 6), notes: '' }] : []),
    ]),
    visits: months.filter((_, i) => i % 3 === 1).map(([y, m], i) => ({ id: `${id}c${i}`, date: day(y, m, 15), reason: i === 6 ? 'Vómitos y diarrea' : 'Control', vet: 'Veterinaria Panda', weight: 9 - (i === 6 ? 0.6 : 0), findings: 'Abdomen blando, buen estado general. Se toma muestra para análisis.', plan: 'Dieta blanda por 3 días y control en 10 días si sigue.' })),
    studies: months.filter((_, i) => i % 6 === 2).map(([y, m], i) => ({ id: `${id}e${i}`, date: day(y, m, 16), kind: 'sangre', title: 'Hemograma y bioquímica', lab: 'Lab Central', notes: 'Valores dentro de rango salvo ALT levemente elevada. Repetir en 3 meses.', files: [{ name: 'x.pdf' }] })),
    symptoms: months.filter((_, i) => i % 2 === 0).map(([y, m], i) => ({ id: `${id}n${i}`, date: day(y, m, 20), text: i === 8 ? 'Diarrea dos días, comió menos' : 'Se rasca las orejas a la noche' })),
    meds: [{ id: `${id}m1`, name: 'Omeprazol', dose: 'medio comprimido', every: 24, start: '2026-07-15T12:00:00Z', days: 10, notes: 'En ayunas' }, { id: `${id}m2`, name: 'Gotas óticas', dose: '5 gotas', every: 12, start: '2026-10-10T12:00:00Z', days: 7 }],
    weights: months.map(([y, m], i) => ({ date: day(y, m, 25), kg: Math.round((8.6 + Math.sin(i / 3) * 0.5) * 10) / 10 })),
    expenses: months.flatMap(([y, m], i) => [{ id: `${id}g${i}a`, date: day(y, m, 2), cat: 'alimento', amount: 38000 + i * 1500, note: 'Bolsa 15 kg' }, { id: `${id}g${i}b`, date: day(y, m, 15), cat: 'veterinaria', amount: 25000, note: 'Consulta' }]),
    conditions: [{ id: `${id}a1`, name: 'Otitis', status: 'activa', since: '2026-01', notes: 'Recurrente en verano' }],
    surgeries: [{ id: `${id}q1`, name: 'Castración', date: '2021-02-10', notes: '' }],
    log: months.slice(-2).flatMap(([y, m], i) => [{ id: `${id}l${i}`, at: `${day(y, m, 8)}T13:00:00Z`, by: 'Sofi', kind: 'comida', note: 'Comió todo' }]),
  });
  return { pets: [mk('aika0001', 'Aika', 'perro', 0), mk('feliza01', 'Feliza', 'gato', 1)] };
}
