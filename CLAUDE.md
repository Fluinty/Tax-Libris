@AGENTS.md

Fluinty — panel Tax-Libris (Next.js / Vercel / Supabase)
===

## Czym jest ten projekt

Panel akceptacji faktur dla biura rachunkowego. AI klasyfikuje faktury z KSeF, ksiegowa
zatwierdza w panelu, lokalny worker ksieguje w InsERT Rachmistrz nexo przez Bridge.
Panel dziala na Vercel i NIGDY nie dosiega Bridge (localhost u klienta) — operacje
wymagajace Rachmistrza sa ASYNCHRONICZNE: panel ustawia status w Supabase, worker wykonuje.

## Architektura danych — ZASADY ZELAZNE (lamanie = uszkodzenie danych produkcyjnych)

* Wszystkie zapytania Supabase z JAWNYM `.schema('fluinty')` — default `public` to inna,
pusta przestrzen; bledy PGRST205 z tego wynikaja.
* PATCH/UPDATE do `exceptions\_queue` WYLACZNIE po `legacy\_id` z widoku v2.
`v2.id === faktury.id !== queue.id`. Pomylka aktualizuje cudza karte.
* Kolumn `ai\_\*` NIE nadpisujemy nigdy. `final\_\*` ustawia wylacznie realna edycja
ksiegowej — zatwierdzenie bez zmian NIE kopiuje ai->final (final zostaje null).
Od Fali 2 kryterium jest PER POLE: zapisujemy `final\_X` tylko wtedy, gdy różni
się od tego, co worker i tak wyliczy z `ai\_*`. Skutek, który trzeba znać:
`final\_\* != null` NIE dowodzi edycji księgowej (może to być wartość wyprowadzona
przez panel — wykluczenia art. 88/NKUP, auto-korekta rodzaju odliczenia).
O edycji świadczą WYŁĄCZNIE flagi `edycja\_realna`/`edycja\_ksiegowa` i eventy.
Szczegóły: docs/DECISIONS.md, wpisy z 12.08.2026.
* Przy kazdym zakonczeniu karty (approve/resolve) ustawiac flagi:
`edycja\_realna` (jakakolwiek zmiana vs AI), `edycja\_ksiegowa` (zmiana z wylaczeniem
samego opisu). Czysty klik = oba false (jawnie). Diff liczyc z pominieciem kluczy
czysto-opisowych.
* Wiersza `clients` klienta DEMO (nip 9999999901) NIE kasujemy nigdy — reset demo
czysci tylko dane transakcyjne + client\_changes\_log (patrz src/lib/demo-seed.ts).
* Statusy kart: pending / pending\_review / auto\_created / approved / resolved /
external\_booked / skipped / ignored / rollback\_requested / rollback\_failed.
`rollback\_requested` ustawia panel, wykonuje worker — panel nie dotyka pol
`zapis\_\*\_rachmistrz`.
* ŹRÓDŁEM PRAWDY O STATUSIE KARTY jest `exceptions\_queue` — to z niej księguje
worker I to z niej widok v2 bierze kolumnę `status` (sprawdzone 13.08.2026:
faktury.id 440 ma `faktury.status='pending'`, a v2 pokazuje `ignored`). Tabela
`faktury` prowadzi WŁASNY, często nieaktualny status — 13.08.2026 rozjazd na
60 ze 100 kart `ignored`. Skutek praktyczny: karta niewidoczna w kolejce może
mieć w `faktury` status pending, więc każdą analizę statusów prowadzić na
`exceptions\_queue`, nigdy na `faktury`. Rozjazd sam w sobie jest DO NAPRAWY.

## UI — pulapki, ktore juz raz kosztowaly godziny

* Karta faktury ma DWA podglady: `FakturaPreview.tsx` (sticky, prawa kolumna —
KANONICZNY, to widzi uzytkownik) i `PelnaFakturaSection.tsx` (zwijana).
Kazda zmiana prezentacji faktury idzie do OBU albo swiadomie do jednego z komentarzem.
* Zadnych elementow DEBUG na main/produkcji. Diagnostyka za flaga (?debug=1) albo preview.
* Kwota "DO ZAPLATY" z KSeF moze legalnie rozniec sie od tabeli VAT (raty sprzetu,
salda, kapital leasingu fin.) — roznice OBJASNIAMY (sekcja Rozliczenia / wiersz
roznicy), nigdy nie "korygujemy".
* Toggle AUTO na /klienci jest podpiety pod `clients.auto\_write\_enabled` — zmiany
w mechanice auto-write konsultowac, to bramka produkcyjnego ksiegowania.

## Metryki

* Zrodlo: RPC `fluinty.client\_metrics(since timestamptz)` — pending liczony zawsze
all-time, reszta w oknie po COALESCE(resolved\_at, created\_at).
* "Czystosc ksiegowa" = zakonczone przez system bez zmian kwot/VAT/pozycji/rezimu
(opis NIE jest korekta ksiegowa). external\_booked poza mianownikiem.

## Konwencje pracy

* Jezyk UI i komunikatow: polski. Komunikaty bledow wskazuja tabele/przyczyne,
zadnego cichego polykania `error` z Supabase.
* Kazda zmiana konczy sie testami akceptacyjnymi na realnych przypadkach
(numery kart/NIP-y z issue) — wyniki w opisie PR/commita.
* Sekrety wylacznie w env (SUPABASE\_SERVICE\_ROLE\_KEY itd.) — nigdy w kodzie/commitach.
* Commity male i tematyczne; przed zmiana w istniejacym flow przeczytac caly plik,
nie tylko fragment (lekcja: resetDemo x4).
* Na starcie KAŻDEGO zadania: git fetch + pull (rebase przy lokalnych zmianach).
W repo pracuje też drugi agent (Antigravity) — przed pushem sprawdź, czy origin
nie uciekł. Konflikt = zatrzymaj się i zgłoś, nie rozwiązuj po cichu.
* NA STARCIE KAŻDEJ SESJI przeczytaj docs/DECISIONS.md — to rejestr decyzji, nie
archiwum; są tam wpisy, bez których łatwo powtórzyć cudzy błąd (m.in. semantyka
`final\_\* != null` i rozjazd statusów faktury vs exceptions\_queue z 12.08.2026).
Nie zmieniaj zachowań z tej listy bez wyraźnej zgody; przy każdej istotnej decyzji
architektonicznej DOPISZ wpis w commicie ze zmianą. Przed zadaniem wykraczającym
poza czysty frontend dodatkowo docs/ARCHITECTURE.md.
* ZAKAZ TWIERDZEŃ O STANIE DANYCH BEZ ZAPYTANIA. Każde „jest X kart takich a takich"
— w commicie, w docs, w podsumowaniu dla właściciela — musi być poparte zapytaniem
WYKONANYM w tej sesji, z wklejonym wynikiem. Bez zapytania formułuj warunkowo
(„jeśli takie karty istnieją…"). Liczby z wcześniejszych audytów też wymagają
odświeżenia — bywają nieaktualne. Lekcja: commit c751b52 uzasadniał decyzję
zdaniem o „4 kartach sprzedaży, którym approve wycinał VAT należny"; weryfikacja
per wiersz tego nie potwierdziła (sprostowanie w 67b8999) — teza brzmiała
wiarygodnie, bo wynikała z kodu, ale danych nikt nie sprawdził.
* ŚCIEŻKA ZAPISU ZA JAWNYM ZATWIERDZENIEM. Baza domyślnie READ-ONLY (SELECT-y do
introspekcji i weryfikacji tez — tak, DDL/DML — nie). Wszystko, co dotyka workera,
Bridge'a albo nexo (w tym zmiany kontraktu pól, z których worker księguje:
`final\_\*`, `resolved\_opis`, statusy, bramka auto-write) — najpierw plan
i potwierdzenie właściciela, dopiero potem wykonanie. Migracje z migrations/
uruchamia wyłącznie człowiek.

