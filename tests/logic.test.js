// Testy czystej logiki: parsowanie i formatowanie czasu, liczenie PB, mapowanie arkusz → model.
// Dane syntetyczne (Z-12): zawodnicy „a” i „b”, bez prawdziwych wyników.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../docs/logic.js');

const r2 = x => Math.round(x * 100) / 100;

test('parseTime: formaty z arkusza', () => {
  assert.equal(r2(L.parseTime('28.59')), 28.59);
  assert.equal(r2(L.parseTime('1.04.03')), 64.03);
  assert.equal(r2(L.parseTime('1:04,03')), 64.03);
  assert.equal(r2(L.parseTime('38.7')), 38.70);
  assert.equal(L.fmt(L.parseTime('38.7')), '38,70');
});

test('parseTime: pozostałe przypadki z referencji', () => {
  assert.equal(L.parseTime(''), null);
  assert.equal(L.parseTime('   '), null);
  assert.equal(L.parseTime('45'), 45);
  assert.equal(r2(L.parseTime('45,29')), 45.29);
  assert.equal(L.parseTime('1:05'), 65);                 // m:ss bez setnych
  assert.equal(r2(L.parseTime('2:31.53')), 151.53);
  assert.equal(r2(L.parseTime(' 1 : 04 , 03 ')), 64.03);  // spacje ignorowane
  assert.ok(Number.isNaN(L.parseTime('abc')));
  assert.ok(Number.isNaN(L.parseTime('1.75.00')));       // sekundy ≥ 60
  assert.ok(Number.isNaN(L.parseTime('28.123')));        // >2 cyfry setnych i ≥100
  assert.ok(Number.isNaN(L.parseTime('1.2.3.4')));
  assert.ok(Number.isNaN(L.parseTime('-5')));
});

test('fmt: m:ss,hh', () => {
  assert.equal(L.fmt(28.3), '28,30');
  assert.equal(L.fmt(64.03), '1:04,03');
  assert.equal(L.fmt(151.53), '2:31,53');
  assert.equal(L.fmt(59.999), '1:00,00');
  assert.equal(L.fmt(null), '');
  assert.equal(L.fmtDelta(-1.5), '−1,50 s');
  assert.equal(L.fmtDelta(0.25), '+0,25 s');
});

test('fmtDate', () => {
  assert.equal(L.fmtDate('2026-09-26', false), '26 wrz 2026');
  assert.equal(L.fmtDate('2024-02-01', true), '≈ lut 2024');
  assert.equal(L.fmtDate('', false), '—');
});

function meet(id, kid, date, pool, results) {
  return { id, kid, name: 'Z' + id, date, approx: false, pool, note: '', results };
}
const MEETS = [
  meet('m3', 'a', '2024-03-01', '25', { dow_50: { t: 36.0 } }),
  meet('m1', 'a', '2024-01-01', '25', { dow_50: { t: 40.0 }, grz_50: { t: 45.0 } }),
  meet('m2', 'a', '2024-02-01', '50', { dow_50: { t: 35.5 } }),
  meet('m4', 'a', '2024-04-01', '25', { dow_50: { t: 37.0 }, grz_50: { t: 44.0 } }),
  meet('x1', 'b', '2024-01-05', '25', { dow_50: { t: 30.0 } }),
];

test('series: PB = minimum, flagi pbAtTime i prev, porządek chronologiczny', () => {
  const s = L.series(MEETS, 'a', 'dow_50', 'all');
  assert.deepEqual(s.map(p => p.m.id), ['m1', 'm2', 'm3', 'm4']);
  assert.deepEqual(s.map(p => p.pbAtTime), [true, true, false, false]);
  assert.deepEqual(s.map(p => p.prev), [null, 40.0, 35.5, 36.0]);
  assert.equal(s.filter(p => p.current).length, 1);
  assert.equal(s.find(p => p.current).t, 35.5);
});

test('series: filtr basenu zmienia PB', () => {
  const s25 = L.series(MEETS, 'a', 'dow_50', '25');
  assert.equal(s25.find(p => p.current).t, 36.0);
  assert.deepEqual(s25.map(p => p.pbAtTime), [true, true, false]);
  const s50 = L.series(MEETS, 'a', 'dow_50', '50');
  assert.equal(s50.length, 1);
  assert.equal(s50[0].current, true);
});

test('series: inne dziecko nie wpływa na PB', () => {
  assert.equal(L.series(MEETS, 'a', 'dow_50', 'all').find(p => p.current).t, 35.5);
  assert.equal(L.series(MEETS, 'b', 'dow_50', 'all').find(p => p.current).t, 30.0);
});

test('series: remis nie jest nową życiówką, aktualny PB = pierwsze wystąpienie minimum', () => {
  const m = [meet('a1', 'a', '2024-01-01', '', { dow_50: { t: 30 } }), meet('a2', 'a', '2024-02-01', '', { dow_50: { t: 30 } })];
  const s = L.series(m, 'a', 'dow_50', 'all');
  assert.deepEqual(s.map(p => p.pbAtTime), [true, false]);
  assert.deepEqual(s.map(p => !!p.current), [true, false]);
});

test('kidEvents: sortowanie wg stylu i dystansu', () => {
  assert.deepEqual(L.kidEvents(MEETS, 'a', 'all'), ['dow_50', 'grz_50']);
  assert.deepEqual(L.kidEvents(MEETS, 'a', '50'), ['dow_50']);
});

test('fromApi: wiersze arkusza → zawody (imię lub id zawodnika, TAK, basen, uwagi)', () => {
  const r = L.fromApi({
    zawodnicy: [{ id: 'b', imie: 'Bea', kolejnosc: 2 }, { id: 'a', imie: 'Ala', kolejnosc: 1 }],
    wyniki: [
      { id_zawodow: 'a-2024-01-01-x', zawodnik: 'Ala', data: '2024-01-01', data_orientacyjna: true, zawody: 'OM', basen_m: '50', uwagi_zawodow: 'u', konkurencja: 'dow_50', czas_s: 30.12, uwagi_wyniku: 'mc' },
      { id_zawodow: 'a-2024-01-01-x', zawodnik: 'Ala', data: '2024-01-01', data_orientacyjna: true, zawody: 'OM', basen_m: '50', uwagi_zawodow: 'u', konkurencja: 'grz_50', czas_s: 35, uwagi_wyniku: '' },
      { id_zawodow: 'b-2024-02-01-y', zawodnik: 'b', data: '2024-02-01', data_orientacyjna: false, zawody: 'GP', basen_m: '', uwagi_zawodow: '', konkurencja: 'dow_25', czas_s: 20, uwagi_wyniku: '' },
      { id_zawodow: 'b-2024-02-01-y', zawodnik: 'b', data: '2024-02-01', konkurencja: 'dow_25', czas_s: 21 },
      { id_zawodow: 'z-1', zawodnik: 'Nieznany', data: '2024-02-01', konkurencja: 'dow_25', czas_s: 21 },
    ],
  });
  assert.deepEqual(r.kids.map(k => k.id), ['a', 'b']);
  assert.equal(r.meets.length, 2);
  const a = r.meets[0];
  assert.equal(a.kid, 'a');
  assert.equal(a.approx, true);
  assert.equal(a.pool, '50');
  assert.deepEqual(a.results, { dow_50: { t: 30.12, n: 'mc' }, grz_50: { t: 35 } });
  assert.equal(r.meets[1].pool, '');
  assert.equal(r.meets[1].results.dow_25.t, 20);
  assert.equal(r.warnings.length, 2);
});

test('toApiMeet: model formularza → payload API', () => {
  const p = L.toApiMeet(null, { kid: 'a', name: 'OM', date: '2026-01-02', approx: false, pool: '25', note: '', results: { dow_50: { t: 30.1, n: 'x' } } });
  assert.equal(p.id, undefined);
  assert.deepEqual(p.wyniki, [{ konkurencja: 'dow_50', czas_s: 30.1, uwagi_wyniku: 'x' }]);
  assert.equal(p.basen_m, '25');
});
