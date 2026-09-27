// Smoke test UI w jsdom: docs/index.html + skrypty, fetch podmieniony na atrapę API.
// Dane syntetyczne (Z-12).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const DOCS = path.join(__dirname, '../docs');
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function baza() {
  const w = (id, kid, data, konk, t, extra = {}) => Object.assign({ id_zawodow: id, zawodnik: kid, data, data_orientacyjna: false, zawody: 'Zawody ' + id, basen_m: '', uwagi_zawodow: '', konkurencja: konk, czas_s: t, uwagi_wyniku: '' }, extra);
  return {
    zawodnicy: [{ id: 'a', imie: 'Ala', kolejnosc: 1 }, { id: 'b', imie: 'Bea', kolejnosc: 2 }, { id: 'c', imie: 'Cyl', kolejnosc: 3 }],
    konkurencje: [{ kod: 'dow_50' }, { kod: 'grz_50' }],
    wyniki: [
      w('a-1', 'Ala', '2025-01-10', 'dow_50', 40.0),
      w('a-1', 'Ala', '2025-01-10', 'grz_50', 45.0),
      w('a-2', 'Ala', '2025-06-10', 'dow_50', 38.5, { basen_m: '50' }),
      w('a-3', 'Ala', '2026-02-10', 'dow_50', 39.0, { basen_m: '25' }),
      w('b-1', 'Bea', '2025-03-01', 'dow_50', 50.0),
    ],
  };
}

async function boot({ kod = 'rodzina', pin = '4321', viewport = 1200 } = {}) {
  const db = baza();
  const calls = [];
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8').replace(/<script src=[^>]+><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://plywalniaskrodzkich.pl/', pretendToBeVisual: true });
  const win = dom.window;
  win.alert = win.confirm = win.prompt = () => { throw new Error('alert/confirm/prompt są zabronione'); };
  win.matchMedia = q => ({ matches: /max-width:640px/.test(q) && viewport <= 640, addEventListener() {} });
  win.ResizeObserver = class { observe() {} disconnect() {} };
  win.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, opts, body });
    assert.equal(opts.method, 'POST');
    assert.match(opts.headers['Content-Type'], /^text\/plain/);
    let res;
    const dane = () => Object.assign({ ok: true }, JSON.parse(JSON.stringify(db)));
    if (body.action === 'list') res = body.kod === kod ? dane() : { ok: false, code: 'kod', error: body.kod ? 'Błędny kod rodzinny.' : 'Podaj kod rodzinny.' };
    else if (body.pin !== pin) res = { ok: false, code: 'pin', error: 'Błędny PIN do edycji.' };
    else if (body.action === 'upsertMeet') {
      const m = body.meet, id = m.id || m.zawodnik + '-' + m.data + '-abcde';
      db.wyniki = db.wyniki.filter(x => x.id_zawodow !== id).concat(m.wyniki.map(x => ({ id_zawodow: id, zawodnik: m.zawodnik, data: m.data, data_orientacyjna: m.data_orientacyjna, zawody: m.zawody, basen_m: m.basen_m, uwagi_zawodow: m.uwagi_zawodow, konkurencja: x.konkurencja, czas_s: x.czas_s, uwagi_wyniku: x.uwagi_wyniku })));
      res = Object.assign(dane(), { id });
    } else if (body.action === 'deleteMeet') {
      db.wyniki = db.wyniki.filter(x => x.id_zawodow !== body.id);
      res = dane();
    }
    return { json: async () => res };
  };
  win.eval('window.PLYW_CONFIG={apiUrl:"https://script.google.com/macros/s/TEST/exec"}');
  for (const f of ['logic.js', 'api.js', 'app.js']) win.eval(fs.readFileSync(path.join(DOCS, f), 'utf8'));
  await tick(5);
  return { win, doc: win.document, calls, db };
}
const $ = (doc, s) => doc.querySelector(s);
function type(win, el, v) { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); }

test('config.js: adres Web Appa Apps Script (https, /exec)', () => {
  const src = fs.readFileSync(path.join(DOCS, 'config.js'), 'utf8');
  assert.match(src, /apiUrl: 'https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec'/);
});

test('head: noindex, viewport, lang', () => {
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<html lang="pl">/);
  assert.equal(fs.readFileSync(path.join(DOCS, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
  assert.equal(fs.readFileSync(path.join(DOCS, 'CNAME'), 'utf8').trim(), 'plywalniaskrodzkich.pl');
});

test('kod rodzinny: bramka, zły kod, dobry kod zapamiętany w localStorage', async () => {
  const { win, doc, calls } = await boot();
  assert.ok($(doc, '#gate'), 'bramka kodu widoczna');
  assert.equal($(doc, '#gErr').textContent, '');
  type(win, $(doc, '#gKod'), 'zly');
  $(doc, '#gate').dispatchEvent(new win.Event('submit', { cancelable: true }));
  await tick(5);
  assert.equal($(doc, '#gErr').textContent, 'Błędny kod rodzinny.');
  type(win, $(doc, '#gKod'), 'rodzina');
  $(doc, '#gate').dispatchEvent(new win.Event('submit', { cancelable: true }));
  await tick(5);
  assert.equal(win.localStorage.getItem('plyw-kod'), 'rodzina');
  assert.equal(doc.querySelectorAll('.lane').length, 3);
  assert.equal(calls.filter(c => c.body.action === 'list').length, 3);
});

async function zalogowany(opts) {
  const b = await boot(opts);
  type(b.win, $(b.doc, '#gKod'), 'rodzina');
  $(b.doc, '#gate').dispatchEvent(new b.win.Event('submit', { cancelable: true }));
  await tick(5);
  return b;
}

test('widoki: podsumowanie, rekordy, tabela (siatka i lista), wykres, filtr basenu', async () => {
  const { doc } = await zalogowany();
  const vals = [...doc.querySelectorAll('.stat .val')].map(x => x.textContent);
  assert.equal(vals[0], '3');   // zawody
  assert.equal(vals[1], '2');   // konkurencje
  const card = doc.querySelector('.card');
  assert.match(card.textContent, /50 m dowolnym/);
  assert.match(card.querySelector('.t').textContent, /38,50/);
  // filtr 25 m: tylko a-3 (zawody bez podanego basenu też są pomijane — jak w referencji) → PB 39,00
  doc.querySelector('[data-pool="25"]').click();
  assert.equal(doc.querySelectorAll('.card').length, 1);
  assert.match(doc.querySelector('.card .t').textContent, /39,00/);
  assert.equal(doc.querySelectorAll('.stat .val')[0].textContent, '3', 'licznik zawodów ignoruje filtr');
  doc.querySelector('[data-pool="all"]').click();
  doc.querySelector('[data-view="tabela"]').click();
  assert.ok(doc.querySelector('table'), 'siatka na desktopie');
  assert.equal(doc.querySelector('td.c.cur .cell').textContent, '38,50');
  doc.querySelector('[data-mode="lista"]').click();
  assert.equal(doc.querySelectorAll('.mcard').length, 3);
  doc.querySelector('[data-view="wykres"]').click();
  assert.ok(doc.querySelector('.chart-card h2'));
  // drugi tor
  doc.querySelector('.lane[data-kid="b"]').click();
  assert.equal(doc.querySelector('.stat .val').textContent, '1');
});

test('dodawanie: podpowiedź życiówki, PIN przy pierwszym zapisie, payload API, PIN tylko w sessionStorage', async () => {
  const { win, doc, calls } = await zalogowany();
  $(doc, '#addBtn').click();
  assert.ok($(doc, '#ov'));
  assert.equal($(doc, '#fPinWrap').hidden, false, 'pole PIN widoczne w pierwszym zapisie');
  type(win, $(doc, '#fName'), 'Test');
  $(doc, '#fDate').value = '2026-09-20';
  const rows = doc.querySelectorAll('.rrow');
  const dow = [...rows].find(r => r.children[0].value === 'dow_50');
  type(win, dow.children[1], '38.1');
  assert.match(dow.querySelector('.hint').textContent, /38,10 · nowa życiówka! −0,40 s/);
  type(win, dow.children[1], '38.7');
  assert.match(dow.querySelector('.hint').textContent, /^38,70 · PB 38,50/);
  // bez PIN-u
  $(doc, '#fSave').click(); await tick(5);
  assert.equal($(doc, '#fErr').textContent, 'Podaj PIN do edycji');
  assert.equal(calls.filter(c => c.body.action === 'upsertMeet').length, 0);
  // zły PIN
  $(doc, '#fPin').value = '0000';
  $(doc, '#fSave').click(); await tick(5);
  assert.equal($(doc, '#fErr').textContent, 'Błędny PIN do edycji.');
  assert.equal(win.sessionStorage.getItem('plyw-pin'), null);
  // dobry PIN
  $(doc, '#fPin').value = '4321';
  $(doc, '#fSave').click(); await tick(5);
  const up = calls.filter(c => c.body.action === 'upsertMeet').pop().body;
  assert.equal(up.pin, '4321');
  assert.equal(up.meet.zawodnik, 'a');
  assert.equal(up.meet.data, '2026-09-20');
  assert.deepEqual(up.meet.wyniki.find(x => x.konkurencja === 'dow_50'), { konkurencja: 'dow_50', czas_s: 38.7, uwagi_wyniku: '' });
  assert.equal($(doc, '#ov'), null, 'panel zamknięty');
  assert.match($(doc, '.toast').textContent, /Zapisano wyniki/);
  assert.equal(win.sessionStorage.getItem('plyw-pin'), '4321');
  assert.equal(win.localStorage.getItem('plyw-pin'), null);
  assert.equal(doc.querySelectorAll('.stat .val')[0].textContent, '4');
  // drugi zapis w tej sesji: bez pytania o PIN
  doc.querySelector('[data-view="tabela"]').click();
  doc.querySelector('[data-mode="lista"]').click();
  doc.querySelector('[data-edit]').click();
  assert.equal($(doc, '#fPinWrap').hidden, true);
});

test('edycja i usuwanie z potwierdzeniem na stronie', async () => {
  const { win, doc, calls } = await zalogowany();
  win.sessionStorage.setItem('plyw-pin', '4321');
  doc.querySelector('[data-view="tabela"]').click();
  doc.querySelector('[data-mode="lista"]').click();
  doc.querySelector('[data-edit="a-3"]').click();
  assert.equal($(doc, '#fTitle').textContent, 'Edytuj zawody');
  $(doc, '#fDel').click();
  assert.match($(doc, '.confirm').textContent, /Usunąć „Zawody a-3”/);
  $(doc, '#fDelYes').click(); await tick(5);
  const del = calls.filter(c => c.body.action === 'deleteMeet').pop().body;
  assert.equal(del.id, 'a-3'); assert.equal(del.pin, '4321');
  assert.match($(doc, '.toast').textContent, /Usunięto zawody/);
  assert.equal(doc.querySelectorAll('.stat .val')[0].textContent, '2');
});

test('telefon: domyślnie lista zawodów', async () => {
  const { doc } = await zalogowany({ viewport: 390 });
  doc.querySelector('[data-view="tabela"]').click();
  assert.ok(doc.querySelector('.mlist'));
  assert.equal(doc.querySelector('table'), null);
});

test('brak adresu API: czytelny komunikat', async () => {
  const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8').replace(/<script src=[^>]+><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://x.test/' });
  const win = dom.window;
  win.matchMedia = () => ({ matches: false, addEventListener() {} });
  // Jawnie pusty adres: prawdziwy docs/config.js po wdrożeniu zawiera już URL Web Appa.
  win.eval('window.PLYW_CONFIG={apiUrl:""}');
  win.fetch = () => { throw new Error('test nie może łączyć się z siecią'); };
  for (const f of ['logic.js', 'api.js', 'app.js']) win.eval(fs.readFileSync(path.join(DOCS, f), 'utf8'));
  await tick(5);
  assert.match(win.document.querySelector('.state').textContent, /Baza wyników niedostępna/);
});
