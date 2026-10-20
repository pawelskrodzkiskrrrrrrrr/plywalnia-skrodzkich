# Pływalnia Skrodzkich

Prywatna, rodzinna aplikacja z wynikami pływackimi. Strona ma `noindex`, a dane nie są przechowywane w tym repozytorium.

- `docs/` to statyczny front na GitHub Pages (`index.html`, `app.js` UI, `logic.js` czysta logika, `api.js` klient API, `config.js` adres Web Appa).
- `apps-script/` to API w Google Apps Script (Web App). Czyta i zapisuje prywatny arkusz Google.
- `tests/` to testy logiki, testy API (atrapa arkusza) i smoke test UI (jsdom). Uruchamiasz je przez `npm install && npm test`.
- `referencja/` to pierwotna wersja aplikacji (artefakt Claude). Nie jest publikowana.

Wdrożenie API: `powershell -ExecutionPolicy Bypass -File wdroz.ps1`.

Sekret `KOD_RODZINNY` jest wyłącznie w Script Properties projektu Apps Script. Zapis i usuwanie nie wymagają PIN-u.
