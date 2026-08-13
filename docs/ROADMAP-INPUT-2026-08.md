# RAPORT ROZWOJOWY — czego brakuje (2026-08-12)

Wkład produktowy na podstawie kodu, `docs/` i danych produkcyjnych przez
Supabase MCP. Zero zmian w kodzie. Cztery sekcje: luki funkcjonalne,
wydajność, ulepszenia istniejących funkcji, propozycje nowych funkcji.

**Korekta faktów wejściowych:** liczby z zadania (`klasyfikacja_korekty 116`,
`client_kontrahenci 37`, `rules 0`, `user_profiles 0`, `external_booked 360`)
to nieaktualne `n_live_tup`. Świeży `COUNT(*)` 12.08: klasyfikacja_korekty
**2531** (żywa, ostatni wpis dziś), client_kontrahenci **840**, rules **50**
(martwe od 29.04), user_profiles **8**, external_booked **390**,
vat_whitelist_cache **1057**, audit_log `action='error'` **13 277 / 19 037**.

---

## 1. Luki funkcjonalne — obietnica/dane bez UI

| priorytet | luka | dowód | nakład |
|---|---|---|---|
| **wysoki** | **`klasyfikacja_korekty` (2531 wierszy) bez ani jednego konsumenta** — pełna, czysta historia korekt per pole (`wartosc_ai` vs `wartosc_monika`: kwoty 1922, kolumna_kpir 149, vat_odliczalny 138, opis 111, reżim 60, gtu 43) od początku produkcji, pisana triggerem. Sekcja nauki liczy reguły z `faktura_events.edited`, które istnieją dopiero od 05.08 i były dotknięte fantomami — a tu leży brakująca historia sprzed tej daty. | grep `klasyfikacja_korekty` w src = tylko komentarz w `pozycje-actions.ts:26`; +513 wierszy w sierpniu, ostatni dziś. DECISIONS 2026-08-11 błędnie sugeruje „klasyfikacja_korekty nie ma" (kolumny nie ma — tabela JEST). | M |
| **wysoki** | **`external_booked` (390 kart, ~24%) bez badge, filtra i raportu adopcji** — /faktury renderuje je z pustą kolumną statusu; brak widoku „ile faktur księgowane ręcznie obok systemu per klient". PRODUCT.md nazywa to „historycznym ryzykiem adopcji" — a to najszybciej rosnąca kategoria. | 390 kart external_booked; `faktury/page.tsx` `getStatusBadge` bez case'a; jedyny ślad to liczba w `WolumenKpirSection.tsx:190`. | M |
| **wysoki** | **Panel nie umie zlecić rollbacku** — ARCHITECTURE obiecuje asynchroniczny `rollback_requested`, panel NIGDZIE go nie ustawia; jedyne statusy zapisywane to `resolved`/`ignored`. Błędne księgowanie cofa dziś wyłącznie właściciel na K1 — wąskie gardło i warunek zaufania do auto-write. | grep `rollback_requested` w src = tylko renderowanie osi czasu; 5 eventów `rollback`, 0 `rollback_requested` w prod. | M |
| **wysoki** | **`rolled_back` (36 kart, 22 bez `resolved_at`) niewidzialny** — status spoza CLAUDE.md/ARCHITECTURE; 22 faktury cofnięte z Rachmistrza, NIEzaksięgowane, których nikt w panelu nie widzi (kolejka bierze tylko pending/pending_review; /faktury bez badge i filtra) → realne ryzyko dziury w KPiR. | 36×`rolled_back`, 22 bez resolved_at; union `types/database.ts:160` go nie zna. | S |
| **średni** | **`client_kontrahenci` (840, aktualizowana dziś) — kartoteka bez UI** — worker prowadzi per klient: `hit_count`, `suma_brutto`, `kategoria_typowa`, `zaufany` (30), notatki, daty. Zero konsumenta w panelu. „Zaufany kontrahent" to naturalne kryterium bramki auto-write i miejsce na „notatki księgowej" z PRODUCT.md. Pokrewne: `vat_whitelist_cache` (1057) bez wglądu. | grep `client_kontrahenci` w src = brak; max `data_aktualizacji`=2026-08-12. | M |
| **średni** | **Tryb obserwatora auto-write bez wizualizacji** — ARCHITECTURE: kandydaci mają być logowani jako `auto_candidate`. W prod 0 takich eventów; panel nie ma widoku „co by automat zaksięgował". `auto_write_toggled` (2 szt.) bez labelki na osi czasu (surowa nazwa). Z 21 typów CHECK niepokryte są dokładnie te 2 związane z auto-write. | 0 `auto_candidate`, 2 `auto_write_toggled`; `FakturaEventsDrawer` 19 labelek. | M |
| **średni** | **`ignored` (100) i `skipped` (~113) to drzwi jednokierunkowe** — panel umie odrzucić, ale brak akcji powrotu do kolejki (grep „Przywróć/cofnij" = brak). Pomyłkowe odrzucenie = faktura znika na zawsze (chyba że właściciel zrobi reprocess na K1). 213 kart bez drogi powrotnej. | `faktury/page.tsx` tylko badge; brak akcji odwrotnej w żadnym actions.ts. | M |
| **średni** | **`rules` (50 wierszy, martwe od 29.04, `last_used_at` wszędzie NULL)** — funkcja „reguł automatycznych" porzucona; event `rule_created` ma polskie labelki w OBU komponentach osi czasu, ale nigdy nie wyemitowany. Sekcja nauki obiecuje „M zasad", które z tą tabelą nie mają nic wspólnego (mylące dla devów). Decyzja: wskrzesić (część pipeline auto-write) albo wyczyścić. | rules 50 wierszy, max created_at 2026-04-29; 0 eventów `rule_created`. | S |
| **niski** | **`ai_review_log` (0 wierszy) — kolejka robi martwy fetch** — `do-akceptacji/page.tsx:90` przy KAŻDYM ładowaniu odpytuje pustą tabelę (reviewer v1 wyłączony), FakturaCard ma 2 miejsca renderu recenzji. Darmowe zapytanie na najgorętszej stronie + mylący martwy kod. | count=0; `page.tsx:90-111`, `FakturaCard:918,1019`. | S |
| **niski** | **`user_profiles` (8 wierszy) — równoległe źródło ról obok `panel_users`** — zero konsumentów w panelu (autoryzacja idzie po `panel_users`). Dwa źródła prawdy o rolach = ryzyko rozjazdu uprawnień przy rosnącej liczbie kont (onboarding 09.2026). | count=8; grep `user_profiles` w src = brak. Sprawdzić na K1, co ją zasila. | S |
| **niski** | **Widoki `klasyfikacja_3d_stats`/`korekty_stats`/`client_metrics_view` bez konsumentów** — gotowe agregaty, które mogłyby zasilić sekcję nauki/raport jakości bez pisania SQL; `client_metrics_view` dubluje RPC. Na produkcji bez stagingu każdy nieskonsumowany widok to koszt poznawczy przy migracjach. | grep w src = 0 hitów. Weryfikacja użycia przez workera przed dropem. | S |
| **fundament** | **Portal klienta + KSeF API 2.0 — jest tylko negatywny fundament** — GOTOWE: rola `klient` (fail-closed blokada wszędzie), REVOKE na RPC, pełny `podglad_faktury`, typ eventu `comment` z renderowaniem. BRAK: tras portalowych, akcji akceptuj/odrzuć/komentuj (0 eventów `comment`, nawet księgowa nie może dodać komentarza), kodu KSeF API 2.0, pola źródła ingestu. Panelową część portalu (komentarz/akceptacja) można zacząć bez pełnego ingestu. | Glob src/app = brak tras portalowych; 0 eventów `comment`; DECISIONS 2026-08-11. | L |

---

## 2. Wydajność

| priorytet | wąskie gardło | dowód + szacunek zysku | nakład |
|---|---|---|---|
| **wysoki** | **Embedding pgvector (6,1 kB/wiersz) leci do przeglądarki z każdą listą kart** — `do-akceptacji/page.tsx:100` robi `faktury_pozycje.select('*')`, tabela ma `nazwa_embedding` (vector 1536). Dla kolejki admina (943 pozycje pending) to **~17,5 MB JSON** ciągnięte Supabase→Vercel→propsy→klient, przy KAŻDYM wejściu, auto-refreshu co 30 s i po każdej akcji. | avg `pg_column_size(nazwa_embedding)`=6148 B; `SELECT faktury_pozycje.*` = 472 wywołania, śr. 548 ms, 259 s łącznie (nr 1 w bazie). Po zawężeniu kolumn: transfer ~18 MB→<1 MB, zapytanie 548 ms→dziesiątki ms. | **S** |
| **wysoki** | **Po każdej akcji strona przelicza się DWA razy** — akcja kończy `revalidatePath('/do-akceptacji')` (8 miejsc), a FakturaCard po sukcesie dodatkowo `router.refresh()`. Karta ma już optimistic removal → jedno z dwóch odświeżeń to czysta strata. | `actions.ts:353,455,…` + `FakturaCard:308,340,360,377`. Zysk: ~1-2 s mniej na każdym zatwierdzeniu, o połowę mniejszy ruch. | S |
| **wysoki** | **Inline-edycja jednej pozycji przebudowuje całą kolejkę** — `updatePozycjaWymiar` (zmiana kolumny KPiR z dropdownu) robi `revalidatePath` = pełny rebuild 333 kart; `updatePozycjaKpir` woła to 2×. Sekcja i tak trzyma stan lokalnie. | `pozycje-actions.ts:75,87`. Zysk: zmiana klasyfikacji z ~2-4 s na <200 ms. | S |
| **średni** | **Brak paginacji/wirtualizacji: 333 pełne FakturaCard w DOM naraz** — każda karta to komponent 1525-liniowy z Preview i sekcjami → ~100k+ węzłów; auto-refresh co 30 s rekonsyliuje cały DOM. | `FakturaListClient:293` map bez limitu. `content-visibility:auto` na wrapperze = ~70-80% czasu renderu przy zerowym ryzyku; docelowo wirtualizacja/paginacja. | M |
| **średni** | **`select('*')` z `exceptions_queue_v2` (70 kolumn) — pozycje wysyłane 3×** — widok ma 2 skorelowane podzapytania `jsonb_agg` (`pozycje_xml_full` + `ai_klasyfikacja_pozycji`), a `pozycje_editable` idzie osobnym zapytaniem → dane pozycji lecą trzykrotnie; stąd 65 tys. idx_scan na faktury_pozycje. | `page.tsx:33`; v2 select mean 308-654 ms. Zysk: ~1 MB mniej/load + odchudzone zapytanie. | M |
| **średni** | **FakturaCard bez `React.memo`** — każdy filtr/optimistic-remove/refresh rerenderuje 333 karty; w renderze nietanie obliczenia bez memo (`renderZapisVat`, `joinPozycjeWithKlasyfikacja` O(n²)). | `FakturaCard:104,416-483,578-859`. Zysk: klik filtra/approve z ~0,5-2 s do dziesiątek ms. | S |
| **średni** | **Waterfall 8-9 sekwencyjnych round-tripów** w `do-akceptacji/page.tsx` (i 8 w dashboard) — tylko 1 krok zrównoleglony; `clientOpisy/pojazdy/todayStats/sidebar` niezależne. | `page.tsx:23-228`. Jedna `Promise.all` → ~0,5-1 s TTFB mniej na /do-akceptacji, ~0,3-0,5 s na /dashboard. | S |
| **średni** | **`/faktury`: `select('*')` z 80-kolumnowej `exceptions_queue`** dla tabelki renderującej ~10 pól — 150 pełnych wierszy z `pozycje_xml_full`/`zapis_vat_data`/`confidence_reasons`. | avg 2953 B/wiersz, 433 kB, z czego nigdy nierenderowane ~206 kB. Zysk: ~400 kB (-90%)/load. Jedna linia. | S |
| **średni** | **Sidebar i statystyki dnia dublują dane, które strona już ma** — `page.tsx` strzela 3× w v2 (main, drugi raz pending pod liczniki, todayStats jako wiersze zamiast agregatu); lecą co 30 s z każdej otwartej karty. | `page.tsx:180-213`; sidebar 385×116 ms, todayStats 129×214 ms. Zysk: -2 zapytania/refresh, ~300 ms. | S |
| **niski/infra** | **66 MB `faktury_pozycje` = embedding + 23 MB martwy indeks HNSW** (`idx_pozycje_embedding_hnsw`, idx_scan=0). Osobna tabela embeddingów 1:1 eliminuje ryzyko, że jakikolwiek przyszły `select('*')` znów wyśle wektory. | `pg_relation_size(HNSW)`=23 MB, idx_scan=0. Drop = -23 MB od ręki; DDL u właściciela, worker pisze embeddingi. | M |
| **niski/infra** | **Indeksy: 6 martwych + brak indeksu pod sort `created_at`** — martwe: HNSW (23 MB), `idx_exc_auto_created_at`, `…_srodek_trwaly`, `…_rachunek_status`, `idx_faktury_pending_conf`, indeksy pozycji kolumna/kup/vat. Brak: `exceptions_queue`/`faktury` bez indeksu z `created_at` bez prefiksu NIP → /faktury i todayStats robią seq_scan (304/269). Dziś ms; rośnie liniowo (~10k faktur/mies. docelowo). | pg_stat_user_indexes 12.08. Drop martwych: -23,3 MB; DDL u właściciela ze STATUS. | S |
| **średni** | **Approve = ~10 sekwencyjnych round-tripów** zanim wróci sukces (checkStatus → assertCanWrite → getUserEmail → resolveExceptionIds z jsonb_agg → pozycje → baseline → 2× update → audit → 1-3 eventy), potem podwójny rebuild. | `FakturaCard:269-313`, `actions.ts:194-355`. Scalić checkStatus z resolve, zawęzić v2, audit+events równolegle: ~40-60% latencji (0,5-1 s/klik). | M |

---

## 3. Ulepszenia istniejących funkcji (perspektywa księgowej — 100 kart/dzień)

| priorytet | ulepszenie | dowód | nakład |
|---|---|---|---|
| **wysoki** | **Filtr/grupowanie kolejki po dostawcy** — dziś kolejkę tnie się tylko po kliencie (sidebar), typie i „uwaga". Dostawca — najbardziej naturalna jednostka pracy seryjnej — niedostępny; ORLEN (15 kart) rozstrzelony po 12 klientach jest nie do zebrania w jedną sesję. | `page.tsx:15-47` searchParams tylko {client,sort,typ}; brak `nip_dostawcy` w całym flow. | M |
| **wysoki** | **Batch-akceptacja kart tego samego dostawcy** — checkboxy + „Zatwierdź zaznaczone (N)", serwerowo pętla po istniejącym `approveFaktura` (bez nowej ścieżki), tylko karty bez alarmów i confidence≥0.9. Największa redukcja klików. | 233 pending_review: ORLEN 15, TAX-NET 12, P4 11, mBank 7 (conf 0.94), Orange 7; `FakturaListClient` bez zaznaczania. | L |
| **wysoki** | **Cofnij po pomyłkowym zatwierdzeniu (okno undo + rollback_requested z UI)** — toast „Zatwierdzono" z „Cofnij" (10 s): jeśli wciąż `approved` → przywróć pending_review; jeśli `auto_created` → `rollback_requested` z powodem. Enter zatwierdza natychmiast, karta znika, zero drogi odwrotu z panelu. | grep `rollback` w src = tylko render eventów; approveFaktura ustawia `approved` (okno przed księgowaniem istnieje). | M |
| ~~wysoki~~ ZAMKNIĘTE 13.08.2026 (inaczej niż tu zalecano: zachowanie USUNIĘTE, nie zguardowane — Esc nie pomija już faktur, pominięcie tylko przyciskiem; NIE odtwarzać guardu Escape, patrz docs/DECISIONS.md) | **Esc trwale pomija fakturę i wycieka z modali — pilny fix guardu** — handler klawiszy sprawdza tylko INPUT/TEXTAREA i `showEditModal`; Esc na powiększonym podglądzie/drawerze AKTYWNEJ karty po cichu ustawia `ignored` (bez potwierdzenia, bez drogi powrotu). Realny mechanizm gubienia faktur. | `FakturaCard:244-267`; Esc→`handleIgnore`; 100 kart `ignored`. Guard rozszerzyć o modale/SELECT, Esc≠trwałe pomiń. | S |
| **średni** | **Most sekcja nauki ↔ kolejka** — przy regule „Świeża — czeka na weryfikację" link „N kart tego dostawcy czeka" → `/do-akceptacji?dostawca=NIP`; odwrotnie badge „reguła z DD.MM" na karcie w kolejce. Weryfikacja świeżej reguły — jedyna akcja z tej wiedzy — wymaga dziś ręcznego szukania kart dostawcy (niemożliwe bez filtra). | `LearningSection:114-121` badge bez linku; FakturaCard nie czyta learning-actions. Zależy od filtra dostawcy. | M |
| **średni** | **Nawigacja klawiaturą po całej liście (j/k)** — dziś skróty działają WYŁĄCZNIE na pierwszej karcie (`isActive={idx===0}`), sekcja pending ma `isActive={false}` na sztywno → jej Enter/Esc to martwy kod, choć karta pokazuje legendę klawiszy. | `FakturaListClient:298,319`; `FakturaCard:245`. | M |
| **średni** | **Enter na karcie z alarmami wymaga drugiego potwierdzenia** — przycisk celowo zmienia treść/kolor przy alarmach (duplikat, VAT nieaktywny, mismatch rachunku), ale Enter omija tę frykcję → rytm „Enter-Enter-Enter" zatwierdza też czerwone flagi, podważając walidatory. | `FakturaCard:252-254,1246-1251`. | S |
| **średni** | **Sidebar: wiek najstarszej karty zamiast tylko liczby** — sortuje wyłącznie po liczbie kart malejąco → klient z jedną kartą wiszącą od 18.06 (56 dni) jest na dole i nigdy nie klikany; SLA zamknięcia miesiąca tego nie wybacza. Rozdzielić pending_review vs pending. | `page.tsx:247` sort po `pending_count`; 8 klientów z najstarszą kartą 2026-06-18. | S |
| **średni** | **Licznik postępu dnia zamiast napływu** — „Statystyki dnia" mierzą `created_at>=dziś` (napływ), nie pracę; sekcja „Zaksięgowane dziś" nigdy się nie renderuje (`autoCreated={[]}` na sztywno); `todayErrors` = ignored utworzone dziś, podpisane „błędów". | `page.tsx:180-199,273,298`; `FakturaListClient:329-351`. | S |
| **niski** | **Global search (⌘K) nie prowadzi do karty w kolejce** — wyniki „Faktury KSeF" dla kart pending nawigują do `/klienci/[nip]`, skąd do karty w kolejce nie ma przejścia. | `GlobalSearch:118-132`. | S |
| **niski (higiena)** | **Zdublowane sortowanie serwer/klient** — klient resortuje wszystko w JS, więc `ORDER BY` w page.tsx jest martwy, a zestawy opcji się rozjechały (`?sort=lowest` renderuje inaczej niż pokazuje dropdown). Mina przy każdym kolejnym filtrze. | `page.tsx:51-71` vs `FakturaListClient:23,150-273`. | S |

---

## 4. Propozycje nowych funkcji (max 10)

Każda w realiach DECISIONS (żadnej oceny prawa bez groundingu; auto-write tylko
za dwoma kluczami). Priorytet: odblokowanie fali 1 i redukcja kosztu księgowej.

### 1. Retro-symulator bramki auto-write + realny tryb obserwatora [M]
- **Co:** sekcja na karcie klienta symulująca `auto_write_gate` (conf≥0.95,
  kwota≤`auto_max_kwota`, zero czerwonych flag) na JUŻ zakończonych kartach:
  ile przeszłoby bramkę, ile z nich było czystych, **lista kart, które automat
  zaksięgowałby BŁĘDNIE** (z linkiem). Plus licznik żywych `auto_candidate` i
  alarm w healthcheck, gdy obserwator nic nie loguje.
- **Dla kogo:** właścicielka (decyzja o uzbrojeniu fali 1) + admin.
- **Dlaczego teraz:** progi ≥50/>50% mierzą czystość OGÓLEM, nie precyzję samej
  bramki — a to bramka będzie księgować.
- **Dowód:** retro-symulacja 12.08 (conf≥0.95, kwota≤5000): **Czajecki 41 kart
  przechodzi, tylko 35 czystych = 6 błędnych auto-księgowań (85,4% precyzji)** —
  mimo 91,9% czystości ogółem; Czyż 12/12 (100%). W prod **0 eventów
  `auto_candidate`**; obserwator nie produkuje danych → fala 1 startowałaby na
  ślepo.
- **Zależności:** panel — brak (dane w exceptions_queue); logowanie
  `auto_candidate` wymaga workera (K1).

### 2. Zbiorcze zatwierdzanie (batch approve) kart wysokiej pewności [M]
- **Co:** multi-select + „Zatwierdź zaznaczone (N)" — pętla po istniejącej
  akcji approve (eventy/flagi/`resolveAiBaseline` bez zmian) + filtr „przechodzi
  bramkę". Człowiek w pętli, czysty klik masowy.
- **Dla kogo:** księgowa. **Dlaczego teraz:** to pomost do auto-write na tych
  samych kryteriach — u najlepszych klientów 7-9/10 kliknięć to zatwierdzenie
  bez korekty, a każde wymaga otwarcia karty 1525-liniowej.
- **Dowód:** Czajecki 91,9% przy 210 dekretach; 233 pending_review;
  `do-akceptacji/page.tsx` bez multi-selectu.
- **Zależności:** fix fantomów (8603d88, wdrożony) — batch nie wygeneruje
  fałszywych `edited`; filtr po dostawcy (sekcja 3) wzmacnia.

### 3. Destylacja korekt do `fluinty.rules` — zamknięcie pętli nauki [L]
- **Co:** przycisk „zatwierdź jako regułę" przy agregatach sekcji nauki
  (dostawca×kategoria) → zapis do istniejącej, pustej `rules`; worker konsumuje
  reguły przy klasyfikacji i podbija `hit_count`. Tylko korekty z realnym diffem
  (`realDiffKeys`).
- **Dla kogo:** księgowa (mniej powtórek) + właścicielka (rosnąca czystość =
  więcej klientów nad progiem).
- **Dlaczego teraz:** wiedza z korekt istnieje i rośnie, ale NIE wraca do
  klasyfikatora — każda powtórzona korekta to koszt i cios w `pct_ksiegowa`.
- **Dowód:** `rules` 12 kolumn / 0 wierszy od początku projektu;
  `klasyfikacja_korekty` 2531 (kolumna_kpir 149 u 16 NIP, vat_odliczalny 138 u
  22, reżim 60); LearningSection liczy agregaty efemerycznie i nigdzie nie
  utrwala.
- **Zależności:** worker czyta `rules` (K1); DDL u właściciela.

### 4. Podpowiedź „historia dostawcy" na karcie faktury [S]
- **Co:** na FakturaCard kompaktowy baner: ostatnie REALNE korekty dla tego NIP
  dostawcy („3× poprawiono kolumnę KPiR 10→13, ostatnio 04.08"), dane z tej
  samej agregacji co sekcja nauki, lazy.
- **Dla kogo:** księgowa. **Dlaczego teraz:** agregaty istnieją, ale widać je
  tylko na `/klienci/[nip]`, nie tam, gdzie zapada decyzja. Najtańszy sposób,
  by korekta nie powtarzała się u tego samego dostawcy (do czasu poz. 3).
- **Dowód:** `fetchClientLearning` ma logikę grupowania po `nip_dostawcy`;
  FakturaCard nie pokazuje żadnej historii dostawcy; kolumna_kpir poprawiana
  149× u 16 klientów.
- **Zależności:** reuse `gateFakturaHistory` (znane); niezależne od poz. 3.

### 5. Triage błędów workera w panelu [M]
- **Co:** /logi rozszerzone o grupowanie `audit_log action='error'` po typie/
  kliencie/dniu z trendem, sekcja „nowe typy błędów od wczoraj"; healthcheck
  podnosi alert, gdy dzienna liczba odstaje od mediany.
- **Dla kogo:** admin/właścicielka (pośrednio księgowa — faktury nie znikają po
  cichu). **Dlaczego teraz:** awaria ingestu u jednego klienta to dziś cicha
  dziura w KPiR wykrywana przy zamknięciu miesiąca.
- **Dowód:** **13 277 wierszy `action='error'` = 70% audit_log**; healthcheck
  sprawdza tylko świeżość przetwarzania; LogsClient nie grupuje błędów.
- **Zależności:** brak (odczyt); ewentualny indeks u właściciela.

### 6. Dzienny przegląd auto-write z rollbackiem 1-klik (pętla kontrolna fali 1) [M]
- **Co:** po uzbrojeniu fali 1 — widok „Zaksięgowane automatem dziś/wczoraj"
  (karty `auto_created` przez automat, odróżnione od ręcznych), z kwotą,
  pewnością, uzasadnieniem i rollbackiem per karta (istniejąca ścieżka
  statusowa, zawsze z `zapisVatId`).
- **Dla kogo:** księgowa (kontrola następnego dnia) + właścicielka (zaufanie).
- **Dlaczego teraz:** DECISIONS „zaufanie buduje się metrykami" — biuro da
  zielone światło tylko dla automatu w pełni odwracalnego i codziennie
  przeglądanego.
- **Dowód:** 36 kart `rolled_back`, 5 eventów `rollback` — ścieżka
  przetestowana. **Rozjazd do wyjaśnienia:** dane mają `rolled_back`, docs —
  `rollback_requested/failed`; kontrakt do uzgodnienia (patrz Audyt §4).
- **Zależności:** poz. 1 przed uzbrojeniem; worker wykonuje rollbacki (K1);
  tylko otwarty okres (DECISIONS 2026-07).

### 7. Biała lista VAT w panelu + twardy warunek bramki [M]
- **Co:** sekcja weryfikacji kontrahenta z `vat_whitelist_cache` + odświeżenie
  on-demand przez API MF (żywy grounding — rejestr, nie ocena prawna, zgodne z
  DECISIONS); status rachunku jako czerwona flaga BLOKUJĄCA `auto_write_gate` i
  widoczna na karcie przed zatwierdzeniem.
- **Dla kogo:** księgowa (odpowiedzialność solidarna) + bezpieczeństwo automatu.
- **Dlaczego teraz:** bramka sprawdza dziś tylko confidence+kwotę+flagi —
  automat mógłby zaksięgować fakturę z rachunkiem spoza listy bez ostrzeżenia.
- **Dowód:** `vat_whitelist_cache` 1057 wierszy; grep = zero użyć w src.
- **Zależności:** API MF (limity); wpięcie do gate robi worker; panel niezależny.

### 8. Miesięczny raport wartości per klient (amunicja na onboarding 09.2026) [M]
- **Co:** raport per klient: liczba dekretów, czystość, poprawki→reguły, udział
  `external_booked`, status auto-write — do druku/PDF dla właścicielki.
- **Dla kogo:** właścicielka (Monika). **Dlaczego teraz:** onboarding 200 PLN/
  klient od 09.2026 — potrzebny standardowy dowód wartości; `external_booked`
  per klient czyni obchodzenie systemu widocznym i mierzalnym.
- **Dowód:** 390 external_booked (~24%) nigdzie nie raportowane per klient;
  `korekty_stats`/`klasyfikacja_3d_stats` istnieją i nieużywane; infrastruktura
  metryk (RPC, `v_automation_rate`) jest.
- **Zależności:** definicje metryk bez zmian (DECISIONS 2026-08-12).

### 9. Kartoteka kontrahentów + „zaufany" jako kryterium auto-write [M]
- **Co:** zakładka „Kontrahenci" w `/klienci/[nip]` z `client_kontrahenci`
  (hit_count, sumy, kategoria, notatki) i możliwością oznaczenia „zaufany"/
  notatki — bezpośrednio zasila kontekst klasyfikacji AI („notatki księgowej"
  z PRODUCT.md) i daje naturalne kryterium bramki.
- **Dla kogo:** księgowa. **Dlaczego teraz:** tabela żywa (840, aktualizowana
  dziś), a jedyny wpływ księgowej na kontekst dostawcy to dziś korekta
  pojedynczej faktury.
- **Dowód:** `client_kontrahenci` 840, `zaufany`=30; grep = brak konsumenta.
- **Zależności:** uzgodnić z workerem edytowalne pola (bez wyścigów z syncem).

### 10. Spike KSeF API 2.0 (InvoiceRead) + szkielet portalu klienta [L]
- **Co:** Faza A — osobny moduł ingestu z KSeF API 2.0 do stagingu + raport
  pokrycia vs nexo/DDK (bez dotykania produkcji). Faza B — MVP portalu roli
  `klient`: feed własnych faktur + akceptuj/odrzuć/komentarz zanim karta trafi
  do księgowej; komentarz widoczny na FakturaCard.
- **Dla kogo:** klient-końcowy + właścicielka (uniezależnienie od modułu KSeF w
  nexo). **Dlaczego teraz:** kierunek strategiczny nr 2; nowi klienci od 09.2026
  w dual-mode wymagają własnego ingestu. Fundament panelu gotowy (rola `klient`
  zablokowana, `comment` renderowany).
- **Dowód:** brak tras portalowych; `user_profiles` 0→8 (czeka); panel nigdy nie
  dosięga Bridge → ingest KSeF API to jedyna droga do faktur bez nexo.
- **Zależności:** certyfikaty/uprawnienia KSeF (Monika); miejsce ingestu
  (Vercel cron vs K1); Faza B zależy od A; osobny model auth klientów.

---

## TOP 3 — najwyższa dźwignia (do wyboru na start)

1. **Retro-symulator/obserwator auto-write** (poz. 4.1) — jedyne, co odblokowuje
   decyzję o fali 1 na danych, a nie na opinii. Dane pokazują, że precyzja samej
   bramki (85,4% u Czajeckiego) jest niższa niż czystość ogółem (91,9%) — bez
   tego widoku biuro nie wie, co naprawdę zaksięgowałby automat.
2. **Embedding pgvector przestaje wyciekać do przeglądarki** (Wydajność, poz. 1)
   — jednolinijkowy fix (jawna lista kolumn) o największym ROI: ~17,5 MB/load →
   <1 MB, zapytanie 548 ms → dziesiątki ms, na najgorętszej stronie odświeżanej
   co 30 s.
3. **Batch-approve + filtr po dostawcy** (poz. 4.2 + Ulepszenia poz. 1) —
   największa pojedyncza redukcja kosztu księgowej (ORLEN 15 kart po 12 klientach
   dziś nie do zebrania) i naturalny pomost do auto-write na tych samych
   kryteriach, bez uzbrajania automatu.
