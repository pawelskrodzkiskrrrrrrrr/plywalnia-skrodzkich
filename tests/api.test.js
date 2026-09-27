// Testy API (apps-script/Code.gs) w Node: kod ładowany do piaskownicy vm z atrapami
// SpreadsheetApp / PropertiesService / CacheService / LockService. Dane syntetyczne (Z-12).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HDR = ['id_zawodow', 'zawodnik', 'data', 'data_orientacyjna', 'zawody', 'basen_m', 'uwagi_zawodow', 'konkurencja', 'czas_s', 'czas', 'uwagi_wyniku'];

function fakeSheet(rows) {
  const sh = {
    rows: rows.map(r => r.slice()),
    formats: [],
    getDataRange() { return { getValues: () => sh.rows.map(r => r.slice()) }; },
    getLastRow() { return sh.rows.length; },
    getLastColumn() { return sh.rows[0].length; },
    getMaxRows() { return Math.max(sh.rows.length, 1); },
    getMaxColumns() { return sh.rows[0].length; },
    deleteRows(start, n) { sh.rows.splice(start - 1, n); },
    getRange(r, c, nr, nc) {
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) out.push((sh.rows[r - 1 + i] || []).slice(c - 1, c - 1 + nc));
          return out;
        },
        setValues(v) { v.forEach((row, i) => { sh.rows[r - 1 + i] = row.slice(); }); },
        setNumberFormats(f) { sh.formats.push(...f); },
        clearContent() { for (let i = 0; i < nr; i++) sh.rows[r - 1 + i] = sh.rows[r - 1 + i].map(() => ''); },
      };
    },
  };
  return sh;
}

function env(props = {}) {
  const sheets = {
    wyniki: fakeSheet([HDR,
      ['a-2024-01-01-x', 'Ala', new Date(Date.UTC(2024, 0, 1, 12)), '', 'OM', '', '', 'dow_50', 30.12, '30,12', ''],
      ['a-2024-01-01-x', 'Ala', new Date(Date.UTC(2024, 0, 1, 12)), '', 'OM', '', '', 'grz_50', 35, '35,00', ''],
      ['b-2024-02-01-y', 'Bea', '2024-02-01', 'TAK', 'GP', 50, 'uw', 'dow_25', '20,5', '20,50', 'x'],
    ]),
    zawodnicy: fakeSheet([['id', 'imie', 'kolejnosc'], ['a', 'Ala', 1], ['b', 'Bea', 2]]),
    konkurencje: fakeSheet([['kod', 'nazwa'], ['dow_25', ''], ['dow_50', ''], ['grz_50', ''], ['dow_100', '']]),
  };
  const cache = new Map();
  let lockHeld = false;
  const ctx = {
    console,
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: n => sheets[n] || null, getSpreadsheetTimeZone: () => 'UTC', getName: () => 'test' }),
      flush() {},
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => (lockHeld ? false : (lockHeld = true)), releaseLock: () => { lockHeld = false; } }) },
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, 10) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
  const call = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);
  return { ctx, sheets, cache, call, isLocked: () => lockHeld };
}

const MEET = { zawodnik: 'a', data: '2026-09-20', data_orientacyjna: false, zawody: 'Test', basen_m: '25', uwagi_zawodow: '',
  wyniki: [{ konkurencja: 'dow_50', czas_s: 29.99, uwagi_wyniku: '' }, { konkurencja: 'dow_100', czas_s: 64.03, uwagi_wyniku: 'mc' }] };

test('list: bez KOD_RODZINNY dane są otwarte i znormalizowane', () => {
  const { call } = env({ PIN_EDYCJI: '1234' });
  const r = call({ action: 'list' });
  assert.equal(r.ok, true);
  assert.equal(r.zawodnicy.length, 2);
  assert.equal(r.konkurencje.length, 4);
  assert.equal(r.wyniki.length, 3);
  assert.equal(r.wyniki[0].data, '2024-01-01');        // Date → ISO
  assert.equal(r.wyniki[2].czas_s, 20.5);              // tekst z przecinkiem → liczba
  assert.equal(r.wyniki[2].data_orientacyjna, true);   // TAK → true
  assert.equal(r.wyniki[2].basen_m, '50');
});

test('list: przy ustawionym KOD_RODZINNY bez kodu i ze złym kodem nie ma danych', () => {
  const { call } = env({ KOD_RODZINNY: 'tajne' });
  const bez = call({ action: 'list' });
  assert.equal(bez.ok, false); assert.equal(bez.code, 'kod'); assert.equal(bez.wyniki, undefined);
  const zly = call({ action: 'list', kod: 'zly' });
  assert.equal(zly.ok, false); assert.equal(zly.error, 'Błędny kod rodzinny.'); assert.equal(zly.wyniki, undefined);
  assert.equal(call({ action: 'list', kod: 'tajne' }).ok, true);
});

test('upsertMeet: nowy wpis — wiersze, id, kolumna czas, formaty', () => {
  const { call, sheets, isLocked } = env({ PIN_EDYCJI: '1234' });
  const r = call({ action: 'upsertMeet', pin: '1234', meet: MEET });
  assert.equal(r.ok, true, r.error);
  assert.match(r.id, /^a-2026-09-20-[a-z0-9]{5}$/);
  const rows = sheets.wyniki.rows.filter(x => x[0] === r.id);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], [r.id, 'Ala', '2026-09-20', '', 'Test', 25, '', 'dow_100', 64.03, '1:04,03', 'mc']);
  assert.equal(sheets.wyniki.formats[0][2], '@');        // data jako tekst
  assert.equal(sheets.wyniki.formats[0][8], '0.00');     // czas_s liczbowo
  assert.equal(r.wyniki.length, 5);
  assert.equal(isLocked(), false);
});

test('upsertMeet: edycja zastępuje wszystkie wiersze o danym id', () => {
  const { call, sheets } = env({ PIN_EDYCJI: '1234' });
  const m = Object.assign({}, MEET, { id: 'a-2024-01-01-x', data_orientacyjna: true, wyniki: [{ konkurencja: 'grz_50', czas_s: 34.5 }] });
  const r = call({ action: 'upsertMeet', pin: '1234', meet: m });
  assert.equal(r.ok, true, r.error);
  const rows = sheets.wyniki.rows.filter(x => x[0] === 'a-2024-01-01-x');
  assert.equal(rows.length, 1);
  assert.equal(rows[0][3], 'TAK');
  assert.equal(rows[0][9], '34,50');
  assert.equal(sheets.wyniki.rows.length, 1 + 2);       // nagłówek + Bea + nowy
});

test('upsertMeet: edycja nieistniejącego id jest odrzucana', () => {
  const { call, sheets } = env({ PIN_EDYCJI: '1234' });
  const r = call({ action: 'upsertMeet', pin: '1234', meet: Object.assign({}, MEET, { id: 'nie-ma' }) });
  assert.equal(r.ok, false); assert.equal(r.code, 'brak');
  assert.equal(sheets.wyniki.rows.length, 4);
});

test('upsertMeet: walidacja po stronie serwera', () => {
  const { call, sheets } = env({ PIN_EDYCJI: '1234' });
  const bad = [
    [{ data: '20.09.2026' }, /data/i],
    [{ data: '2026-02-30' }, /data/i],
    [{ zawodnik: 'zz' }, /zawodnik/i],
    [{ zawody: ' ' }, /nazwę/i],
    [{ zawody: '=IMPORTXML("x")' }, /=/],
    [{ basen_m: '33' }, /Basen/],
    [{ wyniki: [] }, /co najmniej/],
    [{ wyniki: [{ konkurencja: 'xxx_50', czas_s: 30 }] }, /konkurencja/i],
    [{ wyniki: [{ konkurencja: 'dow_50', czas_s: 0 }] }, /większy od zera/],
    [{ wyniki: [{ konkurencja: 'dow_50', czas_s: -3 }] }, /większy od zera/],
    [{ wyniki: [{ konkurencja: 'dow_50', czas_s: 'abc' }] }, /większy od zera/],
    [{ wyniki: [{ konkurencja: 'dow_50', czas_s: 30 }, { konkurencja: 'dow_50', czas_s: 31 }] }, /dwa razy/],
  ];
  for (const [patch, re] of bad) {
    const r = call({ action: 'upsertMeet', pin: '1234', meet: Object.assign({}, MEET, patch) });
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.match(r.error, re);
  }
  assert.equal(sheets.wyniki.rows.length, 4);
});

test('upsertMeet: zły PIN nic nie zapisuje, 5 błędów → blokada', () => {
  const { call, sheets } = env({ PIN_EDYCJI: '1234' });
  for (let i = 0; i < 4; i++) {
    const r = call({ action: 'upsertMeet', pin: '0000', meet: MEET });
    assert.equal(r.ok, false); assert.equal(r.code, 'pin');
  }
  const r5 = call({ action: 'upsertMeet', pin: '0000', meet: MEET });
  assert.equal(r5.code, 'blokada');
  const dobry = call({ action: 'upsertMeet', pin: '1234', meet: MEET });   // w czasie blokady nawet dobry PIN
  assert.equal(dobry.ok, false); assert.equal(dobry.code, 'blokada');
  assert.equal(sheets.wyniki.rows.length, 4);
});

test('upsertMeet: bez ustawionego PIN_EDYCJI zapis wyłączony', () => {
  const { call } = env({});
  const r = call({ action: 'upsertMeet', pin: '', meet: MEET });
  assert.equal(r.ok, false); assert.match(r.error, /PIN_EDYCJI/);
});

test('deleteMeet: usuwa wszystkie wiersze zawodów; zły PIN nie usuwa', () => {
  const { call, sheets } = env({ PIN_EDYCJI: '1234' });
  assert.equal(call({ action: 'deleteMeet', pin: 'x', id: 'a-2024-01-01-x' }).ok, false);
  assert.equal(sheets.wyniki.rows.length, 4);
  const r = call({ action: 'deleteMeet', pin: '1234', id: 'a-2024-01-01-x' });
  assert.equal(r.ok, true); assert.equal(r.usuniete, 2);
  assert.equal(sheets.wyniki.rows.length, 2);
  assert.equal(call({ action: 'deleteMeet', pin: '1234', id: 'a-2024-01-01-x' }).code, 'brak');
});

test('zapytania niepoprawne', () => {
  const { ctx, call } = env({});
  assert.equal(call({ action: 'hack' }).ok, false);
  const r = JSON.parse(ctx.doPost({ postData: { contents: '{nie json' } }).s);
  assert.equal(r.ok, false);
});

test('formatCzas_ zgodny z fmt() frontu', () => {
  const { ctx } = env({});
  const L = require('../docs/logic.js');
  for (const t of [0.5, 9.99, 28.3, 38.7, 59.995, 60, 64.03, 151.53, 1000.1]) {
    assert.equal(ctx.formatCzas_(t), L.fmt(t), String(t));
  }
});
