# Analiza zacieśnienia bramki auto-write (2026-08-17)

Podstawa rozmowy z biurem przed uzbrojeniem fali 1. Wszystkie liczby z retro-symulacji
wykonanej 17.08.2026 na produkcji (zapytania read-only), silnikiem
`src/lib/gate-simulation.ts` — tym samym, który zasila sekcję „Symulacja automatu"
na karcie klienta. Zero zmian w bramce, danych i metrykach.

## Ustawienie pomiaru

- Zbiór: **780 kart zakończonych** (`auto_created`/`approved`/`resolved`) wszystkich
  klientów poza DEMO. `external_booked` poza symulacją — nie przeszły przez system.
- „Przechodzi bramkę" = pewność ≥ 0,95 **i** kwota ≤ COALESCE(auto_max_kwota, 5000)
  **i** zero czerwonych flag (duplikat, kontrahent nieaktywny w VAT, anomalia daty,
  rachunek mismatch/error, środek trwały, MPP, anomalie historii, ostrzeżenia
  walidatorów). Predykat zwalidowany na żywym obserwatorze: 33/33 eventów
  `auto_candidate` od 12.08 wskazuje karty, które przechodzą także tutaj; zero
  fałszywych przepuszczeń na realnych klientach (szczegóły w nagłówku
  `gate-simulation.ts`).
- „Błędna dla automatu" = przeszłaby bramkę **i** `edycja_ksiegowa = true`
  (flagi wiarygodne po fixie fantomów — DECISIONS 12.08).

## Punkt wyjścia: obecna bramka nie nadaje się do uzbrojenia

| metryka | wartość |
|---|---|
| kart przechodzi bramkę | **181** |
| z tego czystych | 133 |
| z tego błędnych | **48** |
| **precyzja** | **73,5%** |

Czyli dziś automat myliłby się w **co czwartym** księgowaniu. Dla porównania:
czystość ogółem na tych samych 780 kartach to inna, wyższa liczba — i właśnie
dlatego progi „≥50 dekretów, >50% czystości" nie wystarczają jako kryterium.

## Ustalenie nr 1: próg pewności NIE jest narzędziem zacieśnienia

Rozkład pewności wśród 181 kart przechodzących: **131× 0,95**, 32× 0,98, 14× 0,99,
4× 1,0. Karty błędne mają te same wartości co czyste (wśród 48 błędnych: conf
0,95–0,99). Skutek:

| wariant | przechodzi | błędnych | precyzja |
|---|---:|---:|---:|
| próg 0,95 (obecny) | 181 | 48 | 73,5% |
| próg 0,97 | 50 | 14 | **72,0%** |
| próg 0,98 | 50 | 14 | **72,0%** |

Podniesienie progu **tnie wolumen o 72% i jednocześnie POGARSZA precyzję**.
Pewność AI w tych danych nie odróżnia kart, które księgowa poprawi, od kart
czystych — bo korekta zwykle wynika z kontekstu klienta (której kolumny używa,
jak rozlicza danego dostawcę), a nie z niepewności klasyfikacji. Wnioski per
klient potwierdzają: u WOJSPOL-a 11 błędnych kart ma conf 0,95–0,98, z czego
9 od dostawców, których księgowa poprawia systematycznie (pozostałe 2 —
HYDRO ZNPHS i TANK — to jedyne korekty swoich par i dokładnie one zostają
błędne w W1).

Progu kwotowego też nie warto ruszać: przy kwota ≤ 1000 zł precyzja **spada**
do 70,3% (48→41 błędnych, ale czystych ubywa szybciej — błędne to głównie drobne
faktury paliwowe i komunalne).

## Ustalenie nr 2: sygnał jest w HISTORII DOSTAWCY, nie w pewności

33 z 48 kart błędnych (69%) pochodzi od dostawców, którzy u tego samego klienta
mają **inną kartę z realną korektą księgowej**. Błędy się klastrują: EKO-CHEM
u Latonia (3), TED + ORLEN u Czajki (5), GAZY TECHNICZNE / CAR-TECH / ALICJA
u WOJSPOL-a (7) + ORLEN u WOJSPOL-a (2), gminy u BADREW (3). To dokładnie ta
wiedza, którą panel już agreguje w sekcji nauki.

## Warianty zacieśnienia

Definicje: „dostawca z korektą" = para (klient, NIP dostawcy) ma ≥1 zakończoną
kartę z `edycja_ksiegowa = true` **INNĄ niż karta oceniana** (leave-one-out —
bez tego zastrzeżenia każda błędna karta wykluczałaby samą siebie i wariant
liczyłby się na 108/0/100%; w żywej bramce karta oceniana nie jest jeszcze
zakończona, więc semantyka „inne karty" jest tą właściwą); „zaufany kontrahent"
= `zaufany = true` w kartotece workera `client_kontrahenci` (864 wiersze,
32 zaufanych).

| wariant | przechodzi | błędnych | precyzja | wolumen vs dziś |
|---|---:|---:|---:|---:|
| **W0** — obecna bramka | 181 | 48 | 73,5% | — |
| **W1** — W0 + wykluczenie dostawców z ≥1 korektą | 123 | 15 | **87,8%** | −32% |
| **W2** — W0 + tylko zaufani kontrahenci | 74 | 14 | 81,1% | −59% |
| **W3** — W0 + oba warunki (W1 ∧ W2) | 50 | 1 | **98,0%** | −72% |

Sprawdzone i odrzucone: `vendor_first_occurrence` (wykluczenie pierwszych
wystąpień dostawcy) nie zmienia nic — W1+pierwsze wystąpienia daje identyczne
123/15/87,8%, bo pierwsze wystąpienia i tak łapią się na inne warunki.

### Rekomendacja

**Start fali 1 na W3 (98,0%), rozszerzanie w stronę W1.** Uzasadnienie:

1. W3 to jedyny wariant nad progiem 98% — jedna błędna karta na 50 księgowań
   (**#1986, ANDREAS STIHL u BADREW**, 3055,87 zł, conf 0,95 — dostawca zaufany
   w kartotece i bez wcześniejszych korekt, więc żaden warunek go nie łapał;
   korekty księgowej: kwoty per kolumna, odliczalność VAT, reżim pojazdowy).
   50 kart wolumenu to mało, ale automat ma najpierw budować zaufanie,
   nie wolumen. Znaczące: to karta klienta, który w zestawieniu per-klient
   i tak jest poniżej progu — automat per-klient by jej nie księgował.
2. W1 to naturalny drugi krok: 87,8% przy 123 kartach. Precyzja rośnie
   samoczynnie wraz z działaniem pętli nauki — każda korekta księgowej wyklucza
   dostawcę z bramki, więc błędy tego samego typu nie powtarzają się.
3. Warunek W1 jest policzalny z danych, które panel już ma (flagi kart);
   warunek W2 wymaga od workera odczytu `client_kontrahenci.zaufany` — obie
   rzeczy worker ma lokalnie.

Per klient przy W1 (najwięksi): Czajecki 37 kart / 89,2%, WOJSPOL 19 / 89,5%,
Czyż 12 / 100%, Kozyra 6 / 100%. Klienci, którzy na W1 nadal są poniżej progu
(Dobrowolski 50%, BADREW 57%, Latoń 50%), po prostu nie dostają automatu —
o tym decyduje per-klient sekcja „Symulacja automatu", nie średnia.

## Ograniczenia analizy (uczciwie)

- **Retrospekcja zna przyszłość.** „Dostawca z korektą" liczony jest na CAŁYM
  zbiorze, więc karta sprzed pierwszej korekty dostawcy też jest wykluczana.
  Żywa bramka zna tylko korekty DO DANEJ CHWILI — realna precyzja W1/W3
  w pierwszych tygodniach będzie nieco niższa niż retro (pierwsza korekta
  u nowego dostawcy zawsze przejdzie). To samo dotyczy flagi `zaufany` —
  używamy stanu dzisiejszego kartoteki.
- Karty bez flagi `edycja_ksiegowa` (sprzed wdrożenia flag) są poza licznikiem
  i mianownikiem precyzji — w tym przebiegu 0 takich kart wśród przechodzących.
- Warunki bramki nieodtwarzalne z panelu (pomijanie klienta DEMO, ewentualne
  przyszłe warunki workera) — wypisane w nagłówku `src/lib/gate-simulation.ts`.
- Implementacja W1/W3 to zmiana `auto_write_gate` w workerze na K1 — poza tym
  repo; wymaga osobnego zlecenia i zgody właściciela (DECISIONS: wszystko, co
  dotyka workera, za jawnym zatwierdzeniem).

## Dane źródłowe

Karty błędne z pełnym rozbiciem (klient, numer, kwota, dostawca, NIP dostawcy,
pewność): wynik `simulateGate` na 780 kartach — do wglądu przez sekcję
„Symulacja automatu" na karcie każdego klienta (lista „Faktury, które automat
zaksięgowałby błędnie" z linkami do historii).
