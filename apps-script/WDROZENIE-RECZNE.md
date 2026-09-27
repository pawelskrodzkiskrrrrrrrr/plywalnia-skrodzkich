# Wdrożenie API ręcznie (bez clasp)

Tego wariantu używasz, gdy `clasp login` nie działa (np. `access_denied`). Całość zajmuje około 10 minut.

## 1. Utwórz projekt

1. Otwórz https://script.google.com/home/projects/create.
2. Kliknij tytuł „Projekt bez nazwy” u góry i wpisz: `Pływalnia Skrodzkich — API`, potem **Zmień nazwę**.

## 2. Wklej manifest `appsscript.json`

1. Kliknij ⚙ **Ustawienia projektu** (lewy pasek) i zaznacz **Pokaż plik manifestu „appsscript.json” w edytorze**.
2. Wróć do **Edytora** (ikona `< >`) i kliknij plik `appsscript.json`.
3. Zaznacz całą treść (Ctrl+A) i wklej zawartość pliku
   https://github.com/pawelskrodzkiskrrrrrrrr/plywalnia-skrodzkich/blob/main/apps-script/appsscript.json
   (na GitHubie przycisk **Copy raw file** nad plikiem).

## 3. Wklej kod `Code.gs`

1. Kliknij plik `Kod.gs` (albo `Code.gs`), zaznacz całość (Ctrl+A) i wklej zawartość
   https://github.com/pawelskrodzkiskrrrrrrrr/plywalnia-skrodzkich/blob/main/apps-script/Code.gs
   (tak samo: **Copy raw file**).
2. Zapisz (Ctrl+S).

## 4. Nadaj uprawnienia

1. Na pasku nad kodem wybierz funkcję **`autoryzuj`** i kliknij **Uruchom**.
2. Kliknij **Sprawdź uprawnienia** i wybierz swoje konto. Potem kliknij **Zaawansowane**, dalej **Przejdź do projektu „Pływalnia Skrodzkich — API” (niebezpieczne)**, a na końcu **Zezwól**.
   Skrypt prosi tylko o dostęp do arkuszy.

## 5. Ustaw kody

1. Kliknij ⚙ **Ustawienia projektu**, przewiń do **Właściwości skryptu** i wybierz **Dodaj właściwość skryptu**:
   - `PIN_EDYCJI`: Twój PIN do zapisu (zalecane ≥ 6 cyfr)
   - `KOD_RODZINNY`: kod do oglądania (zalecane ≥ 8 znaków)
2. Kliknij **Zapisz właściwości skryptu**.
3. Wróć do edytora i jeszcze raz **Uruchom** `autoryzuj`. W dzienniku ma być: `KOD_RODZINNY: ustawiony, PIN_EDYCJI: ustawiony`.

## 6. Wdróż jako Web App

1. W prawym górnym rogu kliknij **Wdróż**, potem **Nowe wdrożenie**.
2. Przy „Wybierz typ” kliknij ⚙ i wybierz **Aplikacja internetowa**.
3. Wypełnij:
   - Opis: `API v1`
   - Wykonaj jako: **Ja (twój adres)**
   - Kto ma dostęp: **Każdy**
4. Kliknij **Wdróż** i skopiuj **URL aplikacji internetowej** (kończy się na `/exec`).

## 7. Podepnij front

Wyślij ten URL Claude'owi. URL nie jest sekretem, bo dostęp chronią kody. Claude wpisze go do `docs/config.js` i wypchnie zmiany.

Możesz też zrobić to sam: w pliku `docs/config.js` wstaw URL w `apiUrl: '…'`, potem `git commit -am "Adres Web Appa"` i `git push`.

## Aktualizacja kodu w przyszłości

Wklej nowy `Code.gs`, potem **Wdróż** → **Zarządzaj wdrożeniami** → ✏ przy istniejącym wdrożeniu → Wersja: **Nowa wersja** → **Wdróż**. URL się nie zmienia.
