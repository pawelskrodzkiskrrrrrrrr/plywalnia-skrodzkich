/**
 * Pływalnia Skrodzkich — API (Google Apps Script Web App).
 *
 * Wszystkie wywołania: POST, Content-Type: text/plain, body = JSON.
 *   {action:"list", kod}
 *   {action:"upsertMeet", pin, meet:{id?, zawodnik, data, data_orientacyjna, zawody, basen_m, uwagi_zawodow, wyniki:[{konkurencja, czas_s, uwagi_wyniku}]}}
 *   {action:"deleteMeet", pin, id}
 * Odpowiedź: {ok:true, ...} albo {ok:false, error:"<po polsku>", code:"<kod maszynowy>"}.
 *
 * Sekrety wyłącznie w Script Properties (Z-5): KOD_RODZINNY (pusty = oglądanie otwarte), PIN_EDYCJI.
 */

var ID_BAZY = '1kG1AV9n023sFUvBRLnYDaNzgrUHi4Fw0PofB5Bd5Q2s';
var ARK_WYNIKI = 'wyniki';
var ARK_ZAWODNICY = 'zawodnicy';
var ARK_KONKURENCJE = 'konkurencje';
var KOLUMNY = ['id_zawodow', 'zawodnik', 'data', 'data_orientacyjna', 'zawody', 'basen_m',
  'uwagi_zawodow', 'konkurencja', 'czas_s', 'czas', 'uwagi_wyniku'];

var LIMIT_PROB = 5;          // błędnych prób…
var OKNO_S = 600;            // …w ciągu 10 min
var BLOKADA_S = 600;         // → blokada na 10 min

/* ======================= wejście ======================= */

function doGet() {
  return json_({ ok: true, info: 'API Pływalni Skrodzkich. Użyj POST.' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_(blad_('Niepoprawne zapytanie.', 'zapytanie'));
  }
  return json_(obsluz_(req));
}

function obsluz_(req) {
  try {
    switch (req && req.action) {
      case 'list': return akcjaList_(req);
      case 'upsertMeet': return akcjaUpsert_(req);
      case 'deleteMeet': return akcjaDelete_(req);
      default: return blad_('Nieznana akcja.', 'zapytanie');
    }
  } catch (err) {
    if (err && err.uzytkownik) return blad_(err.message, err.code || 'dane');
    console.error(err && err.stack || err);
    return blad_('Błąd serwera. Spróbuj ponownie za chwilę.', 'serwer');
  }
}

/* ======================= akcje ======================= */

function akcjaList_(req) {
  var st = sprawdzKod_(req.kod);
  if (st) return st;
  return ok_(wczytaj_());
}

function akcjaUpsert_(req) {
  var st = sprawdzPin_(req.pin);
  if (st) return st;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return blad_('Ktoś właśnie zapisuje. Spróbuj za chwilę.', 'zajete');
  try {
    var ss = SpreadsheetApp.openById(ID_BAZY);
    var slowniki = slowniki_(ss);
    var meet = waliduj_(req.meet, slowniki);
    var sh = ss.getSheetByName(ARK_WYNIKI);
    var kol = mapaKolumn_(sh);
    var id = meet.id, stare = [];
    if (id) {
      stare = znajdzWiersze_(sh, kol, id);
      if (!stare.length) {
        throw bladUz_('Nie znaleziono tych zawodów — mogły zostać usunięte. Odśwież stronę.', 'brak');
      }
    } else {
      id = meet.zawodnik.id + '-' + meet.data + '-' + losowe_(5);
    }
    var wiersze = meet.wyniki.map(function (w) {
      var r = {
        id_zawodow: id,
        zawodnik: meet.zawodnik.imie,
        data: meet.data,
        data_orientacyjna: meet.data_orientacyjna ? 'TAK' : '',
        zawody: meet.zawody,
        basen_m: meet.basen_m ? Number(meet.basen_m) : '',
        uwagi_zawodow: meet.uwagi_zawodow,
        konkurencja: w.konkurencja,
        czas_s: w.czas_s,
        czas: formatCzas_(w.czas_s),
        uwagi_wyniku: w.uwagi_wyniku
      };
      return kol.naglowki.map(function (h) { return h in r ? r[h] : ''; });
    });
    dopisz_(sh, kol, wiersze);   // najpierw dopisz (nowe są poniżej starych)…
    usunWiersze_(sh, stare);     // …potem usuń stare po zapamiętanych numerach
    SpreadsheetApp.flush();
    var dane = wczytaj_(ss);
    dane.id = id;
    return ok_(dane);
  } finally {
    lock.releaseLock();
  }
}

function akcjaDelete_(req) {
  var st = sprawdzPin_(req.pin);
  if (st) return st;
  var id = String(req.id || '');
  if (!/^[a-z0-9-]{1,80}$/.test(id)) return blad_('Niepoprawny identyfikator zawodów.', 'dane');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return blad_('Ktoś właśnie zapisuje. Spróbuj za chwilę.', 'zajete');
  try {
    var ss = SpreadsheetApp.openById(ID_BAZY);
    var sh = ss.getSheetByName(ARK_WYNIKI);
    var kol = mapaKolumn_(sh);
    var n = usunWiersze_(sh, znajdzWiersze_(sh, kol, id));
    if (!n) return blad_('Nie znaleziono tych zawodów — mogły zostać już usunięte.', 'brak');
    SpreadsheetApp.flush();
    var dane = wczytaj_(ss);
    dane.usuniete = n;
    return ok_(dane);
  } finally {
    lock.releaseLock();
  }
}

/* ======================= dostęp ======================= */

function sprawdzKod_(kod) {
  var wzor = prop_('KOD_RODZINNY');
  if (!wzor) return null; // oglądanie otwarte
  return sprawdzSekret_('kod', kod, wzor,
    'Błędny kod rodzinny.', 'Zbyt wiele błędnych prób kodu. Spróbuj ponownie za 10 minut.');
}

function sprawdzPin_(pin) {
  var wzor = prop_('PIN_EDYCJI');
  if (!wzor) return blad_('Zapis jest wyłączony: nie ustawiono PIN_EDYCJI.', 'pin');
  return sprawdzSekret_('pin', pin, wzor,
    'Błędny PIN do edycji.', 'Zbyt wiele błędnych prób PIN-u. Spróbuj ponownie za 10 minut.');
}

/** Zwraca null, gdy sekret się zgadza; w przeciwnym razie odpowiedź z błędem. Limit prób w CacheService. */
function sprawdzSekret_(rodzaj, podany, wzor, komunikat, komunikatBlokady) {
  var cache = CacheService.getScriptCache();
  var kBlok = 'blokada_' + rodzaj, kProby = 'proby_' + rodzaj;
  if (cache.get(kBlok)) return blad_(komunikatBlokady, 'blokada');
  if (!podany) return blad_(rodzaj === 'pin' ? 'Podaj PIN do edycji.' : 'Podaj kod rodzinny.', rodzaj);
  if (rowne_(String(podany), String(wzor))) return null;
  var n = Number(cache.get(kProby) || 0) + 1;
  if (n >= LIMIT_PROB) {
    cache.put(kBlok, '1', BLOKADA_S);
    cache.remove(kProby);
    return blad_(komunikatBlokady, 'blokada');
  }
  cache.put(kProby, String(n), OKNO_S);
  return blad_(komunikat, rodzaj);
}

/** Porównanie niezależne od miejsca pierwszej różnicy. */
function rowne_(a, b) {
  var roznica = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    roznica |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return roznica === 0;
}

function prop_(nazwa) {
  return String(PropertiesService.getScriptProperties().getProperty(nazwa) || '').trim();
}

/* ======================= odczyt ======================= */

function wczytaj_(ss) {
  ss = ss || SpreadsheetApp.openById(ID_BAZY);
  var tz = ss.getSpreadsheetTimeZone();
  return {
    zawodnicy: obiekty_(ss.getSheetByName(ARK_ZAWODNICY), tz),
    konkurencje: obiekty_(ss.getSheetByName(ARK_KONKURENCJE), tz),
    wyniki: obiekty_(ss.getSheetByName(ARK_WYNIKI), tz).map(normalizujWynik_)
  };
}

function obiekty_(sh, tz) {
  if (!sh) throw new Error('Brak zakładki w arkuszu bazy.');
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  var h = v[0].map(function (x) { return String(x).trim(); });
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var pusty = true, o = {};
    for (var j = 0; j < h.length; j++) {
      if (!h[j]) continue;
      var x = v[i][j];
      if (Object.prototype.toString.call(x) === '[object Date]') x = Utilities.formatDate(x, tz, 'yyyy-MM-dd');
      if (x !== '' && x !== null) pusty = false;
      o[h[j]] = x;
    }
    if (!pusty) out.push(o);
  }
  return out;
}

function normalizujWynik_(w) {
  var t = w.czas_s;
  if (typeof t === 'string') t = parseFloat(t.replace(',', '.'));
  w.czas_s = typeof t === 'number' && isFinite(t) ? Math.round(t * 100) / 100 : null;
  var o = w.data_orientacyjna;
  w.data_orientacyjna = o === true || /^(tak|true|1|x)$/i.test(String(o || '').trim());
  w.basen_m = w.basen_m === '' || w.basen_m == null ? '' : String(w.basen_m).replace(/\D/g, '');
  w.data = String(w.data || '');
  return w;
}

function slowniki_(ss) {
  var zaw = obiekty_(ss.getSheetByName(ARK_ZAWODNICY), 'UTC');
  var kon = obiekty_(ss.getSheetByName(ARK_KONKURENCJE), 'UTC');
  return {
    zawodnicy: zaw.map(function (z) { return { id: String(z.id), imie: String(z.imie || z.id) }; }),
    konkurencje: kon.map(function (k) { return String(k.kod); })
  };
}

/* ======================= walidacja ======================= */

function waliduj_(m, slowniki) {
  if (!m || typeof m !== 'object') throw bladUz_('Brak danych zawodów.');
  var out = {};
  if (m.id != null && m.id !== '') {
    out.id = String(m.id);
    if (!/^[a-z0-9-]{1,80}$/.test(out.id)) throw bladUz_('Niepoprawny identyfikator zawodów.');
  }
  var z = String(m.zawodnik || '').trim().toLowerCase();
  out.zawodnik = slowniki.zawodnicy.filter(function (k) {
    return k.id.toLowerCase() === z || k.imie.toLowerCase() === z;
  })[0];
  if (!out.zawodnik) throw bladUz_('Nieznany zawodnik. Wybierz zawodnika z listy.');
  out.data = String(m.data || '');
  if (!dataIso_(out.data)) throw bladUz_('Niepoprawna data. Oczekuję formatu RRRR-MM-DD.');
  out.data_orientacyjna = m.data_orientacyjna === true || m.data_orientacyjna === 'TAK';
  out.zawody = tekst_(m.zawody, 200, 'Nazwa zawodów');
  if (!out.zawody) throw bladUz_('Podaj nazwę zawodów.');
  out.basen_m = String(m.basen_m == null ? '' : m.basen_m);
  if (['', '25', '50'].indexOf(out.basen_m) < 0) throw bladUz_('Basen może mieć 25 m, 50 m albo zostać pusty.');
  out.uwagi_zawodow = tekst_(m.uwagi_zawodow, 500, 'Uwagi');
  if (!Array.isArray(m.wyniki) || !m.wyniki.length) throw bladUz_('Wpisz co najmniej jeden czas.');
  if (m.wyniki.length > 30) throw bladUz_('Za dużo wyników w jednych zawodach (maks. 30).');
  var byly = {};
  out.wyniki = m.wyniki.map(function (w) {
    var k = String(w && w.konkurencja || '');
    if (slowniki.konkurencje.indexOf(k) < 0) throw bladUz_('Nieznana konkurencja: ' + k + '.');
    if (byly[k]) throw bladUz_('Konkurencja ' + k + ' występuje dwa razy.');
    byly[k] = true;
    var t = Number(w.czas_s);
    if (!isFinite(t) || t <= 0) throw bladUz_('Czas musi być większy od zera (' + k + ').');
    if (t >= 10000) throw bladUz_('Czas jest nierealnie długi (' + k + ').');
    return { konkurencja: k, czas_s: Math.round(t * 100) / 100, uwagi_wyniku: tekst_(w.uwagi_wyniku, 300, 'Uwagi do wyniku') };
  });
  return out;
}

function dataIso_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
    && +m[1] >= 2000 && +m[1] <= 2100;
}

/** Tekst przycięty, z limitem długości. Odrzuca początek „=”, „+”, „@” (ochrona przed formułami w arkuszu). */
function tekst_(v, max, pole) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim();
  if (s.length > max) throw bladUz_(pole + ': maksymalnie ' + max + ' znaków.');
  if (/^[=+@]/.test(s)) throw bladUz_(pole + ': tekst nie może zaczynać się od znaku =, + ani @.');
  return s;
}

/* ======================= zapis ======================= */

function mapaKolumn_(sh) {
  var naglowki = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
  KOLUMNY.forEach(function (k) {
    if (naglowki.indexOf(k) < 0) throw new Error('W zakładce wyniki brakuje kolumny ' + k);
  });
  return { naglowki: naglowki, id: naglowki.indexOf('id_zawodow') };
}

function znajdzWiersze_(sh, kol, id) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var v = sh.getRange(2, kol.id + 1, n, 1).getValues();
  var out = [];
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === id) out.push(i + 2);
  return out;
}

/** Usuwa podane wiersze (rosnąco posortowane numery) od dołu, grupami sąsiednich. Zwraca ich liczbę. */
function usunWiersze_(sh, r) {
  for (var i = r.length - 1; i >= 0;) {
    var koniec = r[i], start = koniec;
    while (i > 0 && r[i - 1] === start - 1) { i--; start--; }
    var ile = koniec - start + 1;
    // Sheets nie pozwala usunąć wszystkich wierszy pod nagłówkiem — wtedy tylko czyścimy treść.
    if (sh.getMaxRows() - ile < 2) sh.getRange(start, 1, ile, sh.getMaxColumns()).clearContent();
    else sh.deleteRows(start, ile);
    i--;
  }
  return r.length;
}

function dopisz_(sh, kol, wiersze) {
  if (!wiersze.length) return;
  var start = sh.getLastRow() + 1, szer = kol.naglowki.length;
  var formaty = wiersze.map(function () {
    return kol.naglowki.map(function (h) {
      return h === 'czas_s' ? '0.00' : h === 'basen_m' ? '0' : '@';
    });
  });
  var rg = sh.getRange(start, 1, wiersze.length, szer);
  rg.setNumberFormats(formaty);
  rg.setValues(wiersze);
}

/* ======================= pomocnicze ======================= */

/** Czas w sekundach → „m:ss,hh” (jak fmt() we froncie). */
function formatCzas_(t) {
  var cs = Math.round(t * 100), m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), h = cs % 100;
  var ss = m ? m + ':' + (s < 10 ? '0' : '') + s : String(s);
  return ss + ',' + (h < 10 ? '0' : '') + h;
}

function losowe_(n) {
  var a = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
  for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}

function bladUz_(msg, code) {
  var e = new Error(msg);
  e.uzytkownik = true;
  e.code = code || 'dane';
  return e;
}
function blad_(msg, code) { return { ok: false, error: msg, code: code }; }
function ok_(dane) { dane.ok = true; return dane; }
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Uruchom raz w edytorze („Uruchom”), żeby nadać skryptowi uprawnienia do arkusza. Nic nie zmienia. */
function autoryzuj() {
  var ss = SpreadsheetApp.openById(ID_BAZY);
  console.log('OK: ' + ss.getName() + ', wierszy w wynikach: ' + (ss.getSheetByName(ARK_WYNIKI).getLastRow() - 1)
    + ', KOD_RODZINNY: ' + (prop_('KOD_RODZINNY') ? 'ustawiony' : 'PUSTY (oglądanie otwarte)')
    + ', PIN_EDYCJI: ' + (prop_('PIN_EDYCJI') ? 'ustawiony' : 'PUSTY (zapis wyłączony)'));
}
