# AUDIT: rozbieżność flag edycji vs eventów korekt (12.08.2026)

Audyt read-only (Supabase MCP, wyłącznie SELECT-y) rozbieżności zgłoszonej 11.08:
26 kart z eventami `edited` zawierającymi korekty kwot przy `edycja_ksiegowa=false`.
Pytanie: czy metryka czystości księgowej (`fluinty.client_metrics.pct_ksiegowa`),
fundament decyzji o auto-write, jest zawyżona.

## TL;DR

1. **Metryka czystości NIE jest zawyżona — ani o jedną kartę.** Wszystkie 30 kart
   „rozbieżnych" (`ek=false` + event z kluczem `kwota_*`) ma wartości
   `final_kwoty_per_kolumna` IDENTYCZNE z `ai_kwoty_per_kolumna` (30/30,
   wartość po wartości). Flagi mówią prawdę: księgowa niczego nie zmieniła
   względem propozycji AI. Werdykty auto-write bez zmian; fala 1 bezpieczna
   (Czajecki 210 dekretów / 91.9% / TAK; Czyż 96.8% / „blisko" wyłącznie przez
   próg ≥50 dekretów).
2. **To eventy `edited` nadraportowują, nie flagi kłamią.** Diff eventu ma
   ZAWSZE `z: 0` — nawet gdy AI proponowało niezerową kwotę — bo baseline diffu
   to `ai_kwoty_per_kolumna` z widoku `exceptions_queue_v2`, który serwuje tę
   kolumnę wprost z `faktury` (tam NULL), a `buildEditDiff` robi `?? 0`.
   Event „poprawił(a): kwota z 0 na 280" powstaje przy zatwierdzeniu karty
   z wpisanymi kwotami równymi propozycji AI.
3. Hipoteza wyjściowa (ścieżka `resolveException` bez zapisu `final_*`) —
   **OBALONA**: wszystkie rozbieżne karty mają zapisane `final_*`, przeszły
   normalną ścieżką approve (resolved_by = e-maile księgowych), a
   `resolveException` z modułu wyjątki to martwy kod bez importera.

## Krok 1 — anatomia (45 kart z eventami korekt księgowych)

Grupowanie wszystkich kart wskazywanych przez eventy `edited` (diff z kluczem
innym niż `opis`) lub `rezim_changed`:

| Grupa | kart | status | final_kwoty | relacja czasowa |
|---|---|---|---|---|
| `ek=false` (rozbieżne) | 30 | wszystkie `auto_created` | zapisane (NOT NULL) | resolved_at ≤1 s PRZED eventem |
| `ek=true` (spójne) | 9 | `auto_created` (7) + `approved` (2) | zapisane | jak wyżej |
| `ek=null` | 6 | `external_booked` | zapisane | event 05.08, external 10.08 |

Wspólny mianownik rozbieżnych: **jeden przebieg approve** (brak eventów
rollback/reprocess, resolved_at i event w tej samej sekundzie), zapisany
`final_*`, księgowa jako actor — czyli NIE ścieżka omijająca zapis finali.

## Krok 2 — mechanizm (dane + kod)

**Test rozstrzygający (wartości, nie klucze):** per kolumna diffu porównano
`na` z eventu z `ai_kwoty_per_kolumna->>kolumna` karty:

| ek | realna zmiana vs AI | kart | interpretacja |
|---|---|---|---|
| false | **false** | **30** | fantomowe „poprawki" — wartości = AI |
| true | true | 6 | realne korekty kwot |
| true | false | 3 | flagi z innych wymiarów (reżim 2124, GTU 2219, VAT 2218) |
| null | true | 6 | external_booked (poza mianownikiem metryki) |

Korelacja 100%: flaga `edycja_ksiegowa` odpowiada dokładnie temu, czy księgowa
REALNIE zmieniła wartości — event odpowiada tylko temu, czy formularz kwot
został przy zatwierdzeniu wysłany.

**Skąd fantomowe eventy (kod, `src/app/(auth)/do-akceptacji/actions.ts`):**
- Event i flagi liczone są z TEJ SAMEJ zmiennej diff w jednej akcji
  (`buildEditDiff` → `computeEditFlags` → `logFakturaEvent`), więc w obrębie
  jednego wywołania sprzeczność jest niemożliwa.
- `buildEditDiff` (l. 64-106) porównuje `exception.ai_kwoty_per_kolumna` vs
  przekazane kwoty, z `?? 0` po obu stronach. Gdy akcja dostaje `fakturaId`,
  `exception` pochodzi z widoku **`exceptions_queue_v2`**, a ten (definicja
  pobrana z bazy, brak jej w repo) serwuje `ai_kwoty_per_kolumna` **wprost
  z `faktury`** — bez COALESCE z `exceptions_queue`. `faktury.ai_kwoty_per_kolumna`
  jest NULL dla wszystkich 45 badanych kart ⇒ baseline diffu = 0 ⇒ każde
  zatwierdzenie z wysłanymi kwotami loguje `edited` z `z:0`, nawet bez zmiany.
- W tym przebiegu panel ustawia flagi `true` (klucz `kwota_*` w diffie) — a
  jednak w bazie jest `false`. Coś nadpisuje flagi PO zatwierdzeniu.

**Kto nadpisuje flagi — dowody na workera (przy księgowaniu):**
- Panel zapisuje flagi do OBU tabel (`exceptions_queue` + `faktury`).
  Stan obecny: karty `approved` (jeszcze niezaksięgowane, 2218/2219) mają
  flagi `true` w obu tabelach; WSZYSTKIE karty `auto_created` mają w `faktury`
  flagi **NULL** (wyzerowane), a w `exceptions_queue` — wartości idealnie
  zgodne z porównaniem wartościowym final vs AI.
- Wniosek: przy księgowaniu (status → `auto_created`) worker przelicza flagi
  wartościowo (poprawnie semantycznie!) w `exceptions_queue` i zeruje je
  w `faktury`. Kod workera (C:\spike\worker_v3.py, maszyna K1) jest poza tym
  repo — **wymaga potwierdzenia na K1**.
- Test predykcyjny: karty 2218/2219 (fantomowy kształt, dziś `approved`,
  flagi `true`) po zaksięgowaniu powinny dostać `ek` przeliczone wartościowo
  (2218: kwoty = AI, ale zmieniony VAT — wynik zależy od tego, czy worker
  porównuje też `final_zapis_vat_data`). Obserwacja po ich zaksięgowaniu
  zweryfikuje mechanizm bez dostępu do K1.

**Wymiar VAT (możliwe zaniżanie flag przez panel):** `buildEditDiff` ignoruje
własne argumenty `finalVat`/`finalPojazd`, a `updateFinalZapisVAT` nie ustawia
flag ani eventów — panelowa edycja tabeli VAT nie wchodzi do diffu. W danych
jednak: **0 kart zakończonych z `ek=false` i `final_zapis_vat_data ≠ ai`**
(wszystkie 79 kart ze zmienionym VAT ma `ek=true`) — czyli dziś nic nie
umyka, najpewniej dzięki wartościowemu przeliczeniu przy księgowaniu.

## Krok 3 — wpływ na metrykę

Trzy definicje czystości (all-time, mianownik jak w `client_metrics`):
- `pct_flagi` — obecna (RPC): `edycja_ksiegowa IS FALSE`;
- `pct_naive` — flaga + brak JAKIEGOKOLWIEK eventu korekty (logika
  defense-in-depth z sekcji nauki);
- `pct_informed` — flaga + brak eventu z REALNĄ zmianą wartości vs AI.

| NIP | klient | dekrety | czyste flagi | czyste naive | czyste informed | pct flagi | pct naive | werdykt |
|---|---|---|---|---|---|---|---|---|
| 7361610640 | Czajecki-Kałwa (fala 1) | 210 | 193 | 193 | 193 | 91.9 | 91.9 | TAK → TAK |
| 8821052769 | WOJSPOL | 71 | 50 | 50 | 50 | 70.4 | 70.4 | TAK → TAK |
| 9131588139 | Dobrowolski | 70 | 49 | 49 | 49 | 70.0 | 70.0 | TAK → TAK |
| 5531593751 | BADREW | 70 | 48 | 42 | 48 | 68.6 | 60.0 | TAK → TAK |
| 6811948196 | Latoń | 36 | 21 | 21 | 21 | 58.3 | 58.3 | blisko → blisko |
| 6332102515 | Czyż (fala 1) | 31 | 30 | 30 | 30 | 96.8 | 96.8 | blisko → blisko |
| 5491072884 | Jabłoński | 25 | 15 | 8 | 15 | 60.0 | 32.0 | – |
| 6762322219 | W Drodze | 15 | 15 | 10 | 15 | 100.0 | 66.7 | – |
| 9970113985 | Medical Group | 10 | 10 | 3 | 10 | 100.0 | 30.0 | – |
| 6442770442 | Wartak | 6 | 5 | 3 | 5 | 83.3 | 50.0 | – |
| 6481455414 | Pierz | 3 | 1 | 0 | 1 | 33.3 | 0.0 | – |
| 5492032303 | WIALWI | 2 | 2 | 0 | 2 | 100.0 | 0.0 | – |

**`czyste_informed = czyste_flagi` u każdego klienta** — po odfiltrowaniu
fantomów definicja „skorygowana" pokrywa się z obecną. Zero zawyżenia,
zero zmian werdyktów. Definicja naiwna (obecność eventu) krzywdziłaby
klientów, u których księgowa potwierdzała kwoty zgodne z AI (Medical Group
100→30 p.p.) — NIE wolno jej użyć w RPC.

## Skutek uboczny: sekcja „Czego system nauczył się od księgowej"

Sekcja (11.08) buduje „reguły" z eventów, więc pokazuje fantomowe „poprawki"
(np. Medical Group: „7 poprawek", z których żadna nie zmieniła wartości vs AI),
a jej defense-in-depth nadmiarowo wyklucza czyste karty z dowodu skuteczności.
Wpis DECISIONS z 11.08 uzasadniał to „niewiarygodnością flag" — audyt pokazuje,
że było odwrotnie. Do poprawy (osobne zadanie): korekta = event z realną
zmianą wartości vs AI (lub naprawione logowanie u źródła — patrz niżej).

## Rekomendacje (bez implementacji w tym audycie)

Warianty z zadania:
- **(a) jednorazowy backfill flag z eventów — ODRZUCIĆ.** Flagi są poprawne;
  backfill z nadraportowujących eventów by je ZEPSUŁ (30 czystych kart
  stałoby się „edytowanymi").
- **(b) zmiana definicji RPC na flaga+eventy — ODRZUCIĆ.** Jak wyżej: eventy
  w obecnym kształcie to zły sygnał; pct spadłoby niezasłużenie (tabela wyżej).
- **(c) oba — ODRZUCIĆ** (suma powyższych).

**Właściwy fix — u źródła fałszywego sygnału (eventów):**
1. **Naprawić baseline diffu** (wybór jednej z dróg, nakład ~0.5 dnia + test):
   - migracja widoku `exceptions_queue_v2`: `ai_kwoty_per_kolumna` /
     `ai_proponowany_opis` itd. jako `COALESCE(f.ai_*, eq.ai_*)` (plik w
     migrations/ ze STATUS, wykonuje właściciel), albo
   - w panelu: `buildEditDiff` porównuje wartościowo i pomija klucze, gdzie
     `z == na` po normalizacji, z baseline'em dociąganym z `exceptions_queue`
     gdy v2 daje NULL. Zaleta drogi panelowej: nie dotyka produkcyjnego widoku.
2. **Logować `edited` tylko przy niepustym, realnym diffie** (po fixie 1 —
   samo wychodzi; fantomowe eventy przestają powstawać).
3. **Fantomowych eventów historycznych NIE kasować** (faktura_events to audyt);
   konsumenci (sekcja nauki, przyszłe raporty) mają filtrować po realnej
   zmianie wartości vs AI. Ewentualnie jednorazowe oznaczenie
   `payload.phantom=true` migracją — opcjonalne, niski priorytet.
4. **Zweryfikować workera na K1** (worker_v3.py): potwierdzić przeliczanie
   flag przy księgowaniu (i czy obejmuje VAT/reżim), plus obserwacja kart
   2218/2219 po zaksięgowaniu. Nakład: 1-2 h na K1.
5. Porządki w panelu (niski priorytet, osobne commity): martwe
   `resolveException` (wyjatki/actions.ts) i `approveWithEdit` — usunąć lub
   podpiąć flagi; `approveExceptionFull` nie zapisuje `final_kwoty_per_kolumna`
   do `faktury` (niespójność z `approveFaktura`); porównania kwot bez epsilon
   (zaokrąglone vs surowe) mogą dawać fałszywe diffy w drugą stronę;
   `buildEditDiff` ignoruje argumenty `finalVat`/`finalPojazd`.
6. **Poprawić sekcję nauki** (osobne zadanie): reguły tylko z korekt z realną
   zmianą wartości; wycofać nadmiarowy warunek defense-in-depth; skorygować
   liczniki „N poprawek".

## Metodyka / reprodukcja

Wszystkie zapytania read-only przez Supabase MCP (`execute_sql`, tryb
--read-only). Kluczowe: (1) anatomia — join eventów `edited`/`rezim_changed`
z kartami + relacja czasowa resolved_at↔event; (2) test wartościowy —
`jsonb_each(payload->'diff')`, porównanie `na` z `ai_kwoty_per_kolumna->>kolumna`
per karta; (3) porównanie flag `exceptions_queue` vs `faktury` po
`legacy_queue_id`; (4) `pg_get_viewdef('fluinty.exceptions_queue_v2')`;
(5) metryka w 3 definicjach z progami werdyktu jak w `client_metrics`
(≥50 i >50% → TAK, ≥30 → blisko). Mapa ścieżek kodu: `buildEditDiff`/
`computeEditFlags`/`logFakturaEvent` i 4 akcje kończące kartę w
`src/app/(auth)/do-akceptacji/actions.ts`.
