# Wzorce w kartach błędnych bramki auto-write (2026-08-17)

Kontynuacja `ANALIZA-zaciesnienia-bramki.md`. Pytanie: ile z 48 kart błędnych
(przechodzą bramkę + `edycja_ksiegowa = true`) układa się w powtarzalne wzorce,
a ile to prawdziwie jednostkowe korekty? Wszystkie liczby z zapytań read-only
wykonanych 17.08.2026; korekty łączone z trzech źródeł (eventy `edited` +
`rezim_changed`, `klasyfikacja_korekty` — 228 wierszy dla tych kart), a KAŻDA
korekta kwotowa przeliczona przeciw `ai_kwoty_per_kolumna` z **exceptions_queue**
— nie z wiersza korekty, bo trigger `log_korekta_faktury` porównuje z
`faktury.ai_kwoty`, które bywa NULL (ta sama klasa fantomów co w
AUDIT-flagi-vs-eventy). Skala oczyszczenia: **700 kolumnowych „korekt" okazało
się fantomami** (final == ai z queue), 69 miało inny kierunek niż raportowany.

## Wynik główny: 42 z 48 kart to pięć powtarzalnych rodzin

| rodzina | kart | klienci | korekta księgowej | przykładowe faktury |
|---|---:|---|---|---|
| **A. GTU zdjęte na sprzedaży** | **12** | Czajecki (6), BADREW (5), Latoń (1) | jedyna realna korekta: `gtu_faktura → 0` (GTU_12 = 2048 ×9, GTU_07 = 64 ×2, GTU_06 = 32 ×1) | FS 8/07/2026, FS 21/07/2026 (Czajecki); FS 53/07/2026, FS 41/07/2026 (BADREW); FS 1/07/2026 (Latoń) |
| **B. Reklasyfikacja kolumny → 13** | **11** | WOJSPOL (3), Latoń (3), Kozyra (2), Dobrowolski, Dymitr, Ławnicki | `kolumna_kpir: 10/11 → 13` + przesunięcie kwot (Zakupy→Wydatki) | FV/138/2026/05, FV/1/2026/05 (Kozyra); FS 1356/07/2026, FS 1388/07/2026 (Latoń); FS 1525/05/2026 (WOJSPOL) |
| **C. Pojazd niedowykryty** | **9** | WOJSPOL (2), Dobrowolski (2), Jabłoński (2), CZAJKA (2), Bartman | AI nie wykryło wydatku pojazdowego: dopisany reżim `mieszany_50_75`, `vat_odliczalny: pelny → czesciowe_50`, `rodzaj_odliczenia: 1 → 2`, kwota ×75% | 656/5/2026 (WOJSPOL); 11631/26/26 (Dobrowolski); FS 6778/07/2026 (CZAJKA); F 6491K3/2209/26 (Bartman) |
| **D. Wysokość kwoty w kol. 13** | **6** | WOJSPOL (5), Olszańska (1) | sama korekta wysokości `WydatkiPozostale` (kolumna bez zmian) | 6632/26/16, F 14863/4533/26, 8075/26/16, F 7106/4552/26, 808/6/2026 (WOJSPOL); 26070041619385 (Olszańska) |
| **E. Fantom flagi** | **4** | CZAJKA (3), Jabłoński (1) | **żadna** — `final == ai` co do pół grosza, reżim różni się wyłącznie FORMATEM zapisu (`75%` → `50_75`, koszt identyczny); flagę ustawił diff sprzed fixu KWOTA_EPS (12.08) | F 16064/4022/26, F 16464/4022/26, FS 6665/07/2026 (CZAJKA); 145/00412/26/1/156 (Jabłoński) |
| **F. Prawdziwie jednostkowe** | **6** | 6 różnych | każda inna (13→11, 13→10, KUP↔NKUP, VAT brak, pozycje VAT, reżim wykupu) | FS-SF/6/26/5 (WOJSPOL, 4112 zł); 731245342 (BADREW/STIHL, 3056 zł); FS 3212/MK (Trocha); F/40652480/07/26 (Jabłoński); 03207/F0626 (Dymitr); F 27980/1105/26 (Dobrowolski) |

Wnioski strukturalne:

1. **Hipoteza z Czajeckiego potwierdzona i rozszerzona**: rodzina A pokrywa
   **wszystkie 12 sprzedażowych** kart błędnych — każda błędna sprzedaż to
   dokładnie ten sam gest: zdjęte GTU (+ dopisany przychód, który po
   przeliczeniu przeciw queue.ai okazał się w większości fantomem baseline'u —
   realna korekta to samo GTU).
2. **Precyzja W0 jest zaniżona o fantomy flagi**: 4 karty rodziny E nie mają
   ŻADNEJ merytorycznej korekty — realnie błędnych jest 44, prawdziwa precyzja
   obecnej bramki to **137/181 = 75,7%** (raportowane 73,5%).
3. Rodzina C to nie problem księgowej, tylko **klasyfikatora pojazdów**
   (worker) — 9 kart, gdzie AI nie powiązało tankowania/eksploatacji z pojazdem.
4. Rodziny B i D to wiedza per klient×dostawca — dokładnie to, co agreguje
   sekcja nauki i co wykluczałby wariant W1.

## Rozkład sprzedaż vs zakup

| | przechodzi | czyste | błędne | precyzja |
|---|---:|---:|---:|---:|
| zakup | 149 | 113 | 36 | 75,8% |
| sprzedaż | 32 | 20 | 12 | **62,5%** |

Sprzedaż jest wyraźnie gorsza — ale rodzina A pokazuje, że to JEDEN wzorzec,
nie rozproszona losowość. Po hipotetycznym nauczeniu reguły GTU sprzedaż
byłaby czystsza od zakupów (32/32 wśród przechodzących, bo wszystkie 12
błędnych to rodzina A).

## GTU w szczegółach — dane pod pytanie „kto ma rację"

Wszystkie korekty `gtu_faktura` w historii (`klasyfikacja_korekty`, wszyscy
klienci, nie tylko karty błędne): Czajecki 15× `2048→0`, BADREW 10× `2048→0`
i 6× `64→0`, Franczak 2× `2048→0`, Latoń po 1× `32→0`/`128→0`/`2048→0`,
Olszańska 1×, Janas 1× `2048→0`. Odwrotnie (dodane GTU): BADREW 4× `→4`
(GTU_03). Bity: 2048 = GTU_12, 64 = GTU_07, 32 = GTU_06.

Pozycje z faktur (nazwy z `faktury_pozycje`):

- **Czajecki, GTU_12 zdjęte 6×**: „USŁUGA REKLAMOWA — PROGRAM PARTNERSKI"
  (FS 8/07/2026), „Działania marketingowe — program afiliacyjny" (FS 3/07,
  FS 21/07), „Wynagrodzenie za promocję usług serwisu tpay.com" (FS 2/07),
  „TŁUMACZENIE TEKSTU — WPML" (FS 4/07), „USŁUGA GRAFICZNA" (FS 24/07).
  **Katalog GTU_12 obejmuje wprost usługi reklamowe, marketingowe i tłumaczeń**
  — z nazw pozycji wynika, że AI może mieć tu rację, a systematyczne zdejmowanie
  wymaga uzasadnienia (usługa graficzna to jedyna dyskusyjna).
- **BADREW, GTU_12 zdjęte 3×**: „Usługa serwisowa" (FS 53/07, FS 51/07,
  FS 24/07) — serwis NIE jest w katalogu GTU_12 → **księgowa wygląda na mającą
  rację**; AI taguje po słowie „usługa".
- **BADREW, GTU_07 zdjęte 2×**: „Sprzęgło FS 461", „Tarcza dociskowa", „Pilnik"
  (FS 41/07, FS 28/07) — to części do **pilarek Stihl** (FS 461 to model
  pilarki), nie do pojazdów samochodowych → GTU_07 błędne, **księgowa ma
  rację**; AI taguje po słowie „sprzęgło".
- **Latoń, GTU_06 zdjęte 1×**: „konsola wodomierza 3/4″ inox" (FS 1/07) —
  armatura, nie urządzenie elektroniczne → **księgowa ma rację**; AI taguje po
  słowie „konsola".

Obraz: AI nadaje GTU po słowach kluczowych bez kontekstu branży klienta.
U BADREW/Latonia to ewidentne fałszywki; u Czajeckiego sprawa jest merytorycznie
otwarta i **odpowiedź biura decyduje, czy 6 kart to błąd AI, czy błąd korekty**.

## Symulacja „co by było gdyby"

Warianty liczone tym samym silnikiem (`gate-simulation.ts`); W-GTU = karty,
których komplet realnych korekt mieści się we wzorcu rodziny A, liczone jako
czyste (hipoteza: reguła GTU nauczona per klient).

| wariant | przechodzi | błędne | precyzja | komentarz |
|---|---:|---:|---:|---|
| W0 — obecna bramka | 181 | 48 | 73,5% | realnie 44 błędne / **75,7%** po odjęciu fantomów flagi |
| W-zakup | 149 | 36 | 75,8% | usuwa całą rodzinę A, ale i 20 czystych sprzedaży |
| W-GTU | 181 | 36 | 80,1% | rodzina A czysta, wolumen bez zmian |
| W1 (bez dostawców z korektą) | 123 | 15 | 87,8% | z poprzedniej analizy |
| **W1+GTU** | **123** | **8** | **93,5%** | najlepszy stosunek precyzja/wolumen |
| W-zakup+W1 | 100 | 8 | 92,0% | to samo 8 błędnych, mniejszy wolumen — zdominowany przez W1+GTU |
| W3 (W1 + zaufany kontrahent) | 50 | 1 | 98,0% | rekomendacja startowa z poprzedniej analizy — bez zmian |
| W-zakup+W3 | 44 | 1 | 97,7% | gorszy od W3 — jedyna błędna W3 (#1986) to zakup |

Per klient przy W-zakup najciekawsze: Czajecki 32/0 = **100%** (cała jego
nieczystość to rodzina A), BADREW 12/1 = 91,7%; ale WOJSPOL/Dobrowolski/CZAJKA
zostają nisko — ich problemy to rodziny B/C/D, których typ dokumentu nie tyka.

## Pytania do biura (do przeczytania Karolinie)

1. **Czajecki, GTU_12 przy sprzedaży**: faktury FS 2/07, FS 3/07, FS 4/07,
   FS 8/07, FS 21/07, FS 24/07/2026 — pozycje to usługi reklamowe, marketingowe
   (programy afiliacyjne/partnerskie), tłumaczenie, grafika. AI oznacza GTU_12,
   księgowa za każdym razem zdejmuje (15× w całej historii). Katalog GTU_12
   obejmuje usługi reklamowe, marketingowe i tłumaczeń. **Czy zdejmowanie jest
   celowe (jaka podstawa?), czy GTU_12 powinno zostawać?** Od odpowiedzi zależy,
   czy uczymy automat reguły „Czajecki sprzedaż → bez GTU", czy przeciwnie —
   przestajemy korygować AI.
2. **BADREW**: „Usługa serwisowa" dostaje GTU_12, a części do pilarek (Sprzęgło
   FS 461, Tarcza dociskowa — FS 41/07, FS 28/07/2026) — GTU_07. Zakładamy, że
   oba tagowania AI są błędne (serwis to nie katalog GTU_12, części do pilarek
   to nie części samochodowe). **Potwierdzić — wtedy to trafia do poprawki
   klasyfikatora, nie do reguł per klient.**
3. **WOJSPOL, wysokość kwot w kol. 13**: 5 faktur (6632/26/16, F 14863/4533/26,
   8075/26/16, F 7106/4552/26, 808/6/2026), gdzie jedyną korektą jest zmiana
   WYSOKOŚCI kwoty w Wydatkach pozostałych. **Co jest źródłem różnicy —
   proporcja, składnik faktury wyłączany z kosztów, coś stałego dla tego
   klienta?** Jeśli reguła istnieje, jest do nauczenia.
4. **Pojazdy (rodzina C)**: 9 faktur, gdzie AI nie rozpoznało wydatku
   pojazdowego (tankowania, eksploatacja) i księgowa ręcznie ustawiała reżim
   50/75. Zgłaszamy do poprawki klasyfikatora po stronie workera — **czy są
   klienci, u których wydatek „paliwowy" celowo NIE idzie w reżim pojazdu?**

## Rekomendacja końcowa

**Start bez zmian: W3 (98,0% / 50 kart).** Analiza wzorców nie podważa
poprzedniej rekomendacji — podmienia natomiast ŚCIEŻKĘ ROZSZERZANIA:

1. Po odpowiedzi biura na pytanie 1-2: **W1+GTU (93,5% / 123 karty)** zamiast
   czystego W1 (87,8%) — reguła GTU per klient (destylacja korekt do `rules`,
   poz. 3 ROADMAP) zdejmuje 7 z 15 błędnych W1 jednym mechanizmem.
   W-zakup odpada: ten sam efekt co W1+GTU przy mniejszym wolumenie (100 vs 123)
   — wycina 20 czystych sprzedaży bez zysku w precyzji.
2. Rodzina C (9 kart) to zlecenie na K1 — poprawka wykrywania pojazdów
   w klasyfikatorze; każda naprawiona karta z tej rodziny podnosi precyzję
   bez zmian w bramce.
3. Fantomy flagi (rodzina E) — flagi `edycja_*` ustawione przed fixem
   KWOTA_EPS przez różnice pół grosza / format reżimu. Dla symulatora to szum
   zaniżający precyzję o ~2 p.p.; NIE czyścić flag w danych (zapis historyczny),
   ale przy interpretacji wyników wiedzieć, że W0 realnie ma 75,7%.

Prawdziwie jednostkowych korekt jest **6 na 48** — automatyzacja nie walczy
z losowością, tylko z pięcioma nazwanymi zjawiskami, z których dwa (A, C) mają
adres poza bramką: katalog GTU i klasyfikator pojazdów.
