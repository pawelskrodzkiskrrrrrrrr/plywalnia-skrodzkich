# Pływalnia Skrodzkich — instrukcje dla AI

Prywatna aplikacja rodzinna z wynikami pływackimi dzieci. Imiona i szczegóły są w `CLAUDE.local.md` (poza repo).
Docelowo działa pod adresem https://plywalniaskrodzkich.pl.

## Architektura

- **Front:** statyczny, w `docs/`, publikowany na GitHub Pages.
- **API:** Google Apps Script Web App, w `apps-script/`.
- **Dane:** arkusz Google `1kG1AV9n023sFUvBRLnYDaNzgrUHi4Fw0PofB5Bd5Q2s` („Pływalnia Skrodzkich — baza wyników”). Zakładki: `wyniki`, `zawodnicy`, `konkurencje`, `README`.
- **Pierwotna ewidencja** `14Bg0OuNbVGVN-1zSAngiQ956xnb8iVfVgfjYmsCQHN0` jest tylko do odczytu i jest archiwum. Nigdy jej nie modyfikuj.

## Zasady

- Obowiązują „Zasady bezwzględne pracy z AI” Z-1…Z-12. Są w Google Doc `1wMYL9_skrA5M2pGyIYs_Hdx8qRAo4gTOc-6A7BhT4J4`.
- Dane dzieci to dane osobowe (Z-12):
  - nie trafiają do repo (repo jest publiczne), logów, zrzutów w repo ani issue;
  - strona ma `noindex`, a `robots.txt` blokuje indeksowanie.
- Kody `KOD_RODZINNY` i `PIN_EDYCJI` są wyłącznie w Script Properties (Z-5).
- Każdy nowy ekran obsługuje tryb ciemny i RWD. Przed zmianą interfejsu najpierw mockup.
- Czasy przechowuj w sekundach (`czas_s`, liczba z dwoma miejscami po przecinku). Wyświetlaj jako `m:ss,hh`.
- Rekord życiowy liczy się automatycznie jako minimum w danej konkurencji, z uwzględnieniem filtra basenu. Nie ma ręcznego oznaczania.
- Wiadomości do użytkownika po polsku.
- Po każdej pracy zapisz raport do `.raporty/`.
