# Portal klienta (P1) — kamień 1: architektura dostępu

Data: 2026-08-18. Dokument PROJEKTOWY (zero kodu) — realizuje D1 („dostęp jest trudny,
feed trywialny") z decyzji burzy „Portal klienta + własny ingest KSeF" (D1–D8
+ challenge z 18.08: projekcja portalowa zamiast RLS na tabelach produkcyjnych,
„odrzuć po zaksięgowaniu" = alert nie rollback, magic link, ⅓ standalone).
Dokument decyzji burzy prowadzi właściciel poza repo — odwołania po numerach D.

**Pomiary wykonane 18.08.2026 (Management API, read-only)** — każda liczba w tym
dokumencie pochodzi z tych zapytań:
- karty w `fluinty.faktury`: 1756; z `podglad_faktury`: 393 (22%); podgląd pojawia się
  od 18.06.2026, masowo od sierpnia (sierpień: 371/537; po 5.08: 334/388 = 86%);
- **karty BEZ podglądu: 1363 — i 1363/1363 (100%) ma pozycje w `faktury_pozycje`**;
- klienci z kartami: 71; kart per klient: mediana 13, średnia 25, max 252;
- statusy w `exceptions_queue`: 1226 zakończonych (approved/auto_created/resolved/
  external_booked), 409 aktywnych (pending/pending_review).

---

## a) Projekcja portalowa

**Zasada nadrzędna (challenge, przyjęta):** klient końcowy NIGDY nie czyta tabel
produkcyjnych. Powstaje osobny **schemat `portal`** — samodzielna granica grantów:
PostgREST eksponuje `portal` dla ról `anon`/`authenticated`, a `fluinty` pozostaje
default-deny (stan dzisiejszy, potwierdzony: role klienckie nie mają grantów na
`fluinty` — na tym padał stary useEffect w browser.ts). Jeden błąd polityki w nowym
schemacie nie może odsłonić kolumn wewnętrznych, bo ich tam fizycznie nie ma.

**Mechanizm:** widoki w `portal` z WBUDOWANYM filtrem tożsamości
(`WHERE client_nip IN (SELECT client_nip FROM portal.user_klienci
WHERE user_id = auth.uid())`), `security_barrier`, właściciel widoku z dostępem do
`fluinty` (klasyczny wzorzec projekcji Supabase). RLS włączone dodatkowo na
TABELACH schematu `portal` (user_klienci, faktury_decyzje) — podwójny pas.

**Widok `portal.faktury` — kolumna po kolumnie (źródło: `fluinty.faktury` +
`exceptions_queue` po `legacy_queue_id`):**

| Kolumna | Źródło | Uwagi |
|---|---|---|
| `id` | faktury.id | identyfikator karty dla decyzji |
| `numer_ksef` | numer_ksef | 100% pokrycia (pomiar 17.08) |
| `numer_dokumentu` | ksiegowe_numer | |
| `data_wystawienia`, `data_sprzedazy` | wprost | |
| `kontrahent_nazwa`, `kontrahent_nip` | nazwa_dostawcy, nip_dostawcy | |
| `kwota_brutto` | kwota_brutto | |
| `waluta` | podglad_faktury->>'kodWaluty', fallback 'PLN' | |
| `typ` | typ_dokumentu | zakup/sprzedaż |
| `status_portalowy` | mapa ze status (niżej) | NIGDY surowy status wewnętrzny |
| `utworzono` | created_at | |
| `ma_podglad` | podglad_faktury IS NOT NULL | flaga dla UI |

**Mapa `status_portalowy`** (klient widzi TRZY stany, nie dziesięć):
`pending`/`pending_review` → **„w opracowaniu"**; `approved`/`resolved`/
`auto_created`/`external_booked` → **„zaksięgowana"**; `ignored`/`skipped`/
`rolled_back` → **domyślnie NIEWIDOCZNE w MVP** (pominięcia to decyzja wewnętrzna
biura z powodami w adnotacjach — pokazywanie ich klientowi bez kontekstu rodzi
pytania do biura; do przełamania flagą per klient — pytanie otwarte nr 1).

**Widok `portal.faktura_pozycje`** (źródło `fluinty.faktury_pozycje`, filtr jak wyżej
po faktura_id→client_nip): `lp`, `nazwa`, `ilosc`, `jednostka`, `wartosc_netto`,
`wartosc_brutto`, `stawka_vat`. **NIC z klasyfikacji** — bez `ai_*`, `final_*`,
`effective_*` (kolumna KPiR, KUP/NKUP, VAT odliczalny to praca biura, nie treść faktury).

**Widok `portal.faktura_podglad`** — `podglad_faktury` w całości dla kart, które go
mają (to dane WŁASNEJ faktury klienta: strony, wiersze, rozliczenia — nic
wewnętrznego; wyjątek: jeżeli worker dopisuje tam pola diagnostyczne, wyciąć jawną
listą — do weryfikacji przy implementacji).

**Czego klient NIE zobaczy NIGDY** (nie ma tych kolumn w żadnym widoku portalu):
`ai_proponowany_opis`, `ai_uzasadnienie`, `ai_confidence`, `ai_kwoty_per_kolumna`,
`ai_klasyfikacja_pozycji`, wszystkie `final_*`, `effective_*` klasyfikacje,
`edycja_realna`/`edycja_ksiegowa`, `resolved_by`/`resolved_at`, `skip_reason`,
`zapis_vat_data`/`final_zapis_vat_data`, `kpir_pojazdowe_data`, `gtu_*`,
`procedura_jpk*`, `confidence_reasons`, `walidator_*`, `anomalie_historii`,
`vendor_*`, `is_potential_duplicate`, `date_anomaly`, `rachunek_match_*`,
`srodek_trwaly_*`, `rule_*`, `nazwa_embedding`, cokolwiek z `audit_log`
i `client_changes_log`.

**Karty bez `podglad_faktury` — rekomendacja: render z pozycji, BEZ cezury czasowej.**
Pomiar rozstrzyga: 100% kart bez podglądu ma komplet pozycji, więc portal renderuje
każdą kartę jako „metryczka + tabela pozycji + kwota"; karty z podglądem (86% nowych
po 5.08, rosnąco) dostają dodatkowo pełny widok dokumentu. Cezura odcinałaby 78%
historii bez potrzeby. Docelowo P2 (surowe FA(3)) wyrówna wszystko w górę.

## b) Model danych portalu

**`portal.user_klienci`** — mapowanie użytkownik↔NIP-y (CELOWO osobne od
`panel_users`, które pozostaje wyłącznie dla zespołu biura):

```
user_id      uuid  REFERENCES auth.users(id) ON DELETE CASCADE
client_nip   text  (FK logiczne do fluinty.clients.nip — bez twardego FK między schematami)
nadal        text  (email admina biura, który zaprosił)
created_at   timestamptz DEFAULT now()
aktywny      boolean DEFAULT true
PRIMARY KEY (user_id, client_nip)
```

**Jeden user — wiele NIP-ów: TAK** (właściciel kilku spółek to realny przypadek
u biur; model par user↔nip obsługuje to bez dodatkowego kosztu; UI dostaje
przełącznik firmy, gdy par >1).

**Decyzje klienta — analiza dwóch opcji:**

*Opcja A — tylko `faktura_events` z nowymi typami* (`portal_zatwierdzona`,
`portal_odrzucona`, `portal_komentarz`): jedna oś czasu, panel już ją renderuje.
Wady: brak taniego odczytu „AKTUALNA decyzja karty" (agregacja ostatniego eventu
per karta przy każdym renderze kolejki), CHECK `faktura_events` wymaga migracji,
odczyt decyzji przez portal wymagałby projekcji na tabelę wewnętrzną.

*Opcja B — tylko osobna tabela stanu*: tani odczyt stanu, naturalny RLS. Wada:
decyzja klienta niewidoczna w osi czasu karty, którą księgowa już zna i lubi.

**Rekomendacja: HYBRYDA — dokładnie wzorzec panelu (stan w kolumnach, ślad
w events).** Tabela stanu + emisja eventu:

```
portal.faktury_decyzje
  faktura_id    bigint   (fluinty.faktury.id)
  client_nip    text
  user_id       uuid
  decyzja       text CHECK (decyzja IN ('zatwierdzona','odrzucona'))
  komentarz     text     (NULL przy braku; komentarz możliwy też bez decyzji)
  po_zaksiegowaniu boolean NOT NULL  -- TRUE gdy karta była już zaksięgowana
  created_at    timestamptz
  PRIMARY KEY (faktura_id)           -- stan AKTUALNY; zmiana decyzji = UPDATE
portal.faktury_decyzje_historia      -- append-only kopia każdej zmiany
```

+ do `fluinty.faktura_events` nowe typy `portal_zatwierdzona` / `portal_odrzucona` /
`portal_komentarz` (aktor = email klienta) — **wymaga migracji rozszerzającej CHECK
na event_type** (wzorzec `2026-08-restored.sql`; plik przygotowany w P1, wykonanie
ręczne jak zawsze). Panel czyta: badge na karcie z `portal.faktury_decyzje`
(jeden tani odczyt per lista), szczegóły/historia z osi czasu.

**„Odrzuć po zaksięgowaniu" (D2 — alert, nie rollback):** decyzja `odrzucona`
z `po_zaksiegowaniu=true` NIE zmienia niczego w torze księgowym; panel pokazuje ją
jako ALERT na karcie (czerwony badge „Klient odrzucił po zaksięgowaniu" + komentarz)
i licznik w widoku kolejki; obsługa = kontakt księgowej z klientem / ewentualna
korekta wg procedur biura. Zapis w events daje trwały ślad.

**Zatwierdzenie klienta jest non-blocking domyślnie (D2):** brak decyzji nie
wstrzymuje niczego. Tryb blocking per klient = flaga `clients.portal_wymaga_akceptacji`
(boolean, default false) — wtedy karta bez `zatwierdzona` nie przechodzi bramki
auto-write i dostaje badge w panelu (zmiana w bramce = konsultacja jak zawsze;
POZA MVP — pytanie otwarte nr 3).

## c) Auth — magic link + zaproszenia biura (D6)

**Ten sam projekt Supabase, wspólne `auth.users`** — osobny projekt auth podwajałby
infrastrukturę i sekrety bez zysku bezpieczeństwa: separacją ról jest CZŁONKOSTWO
w tabelach (`panel_users` = biuro, `portal.user_klienci` = klienci), nie instancja
auth. Użytkownik portalu NIE ma wiersza w `panel_users`; użytkownik biura może
(pytanie otwarte nr 5) dostać podgląd portalu.

**Flow zaproszenia:**
1. Admin biura na karcie klienta (`/klienci/[nip]`) klika „Zaproś do portalu",
   podaje e-mail → server action (bramka: rola admin) tworzy zaproszenie
   `admin.auth.inviteUserByEmail(email, { redirectTo: /portal/callback })`
   + wpis do `portal.user_klienci` (user_id z odpowiedzi, client_nip, nadal);
2. Klient dostaje mail (szablon Supabase „Invite"), klika, ląduje na
   `/portal/callback` → sesja ustanowiona → `/portal`;
3. Kolejne logowania: `/portal/login` z polem e-mail → `signInWithOtp`
   (magic link; ZERO haseł — brak resetów, brak phishingu hasła);
4. Wylogowanie: przycisk w layoucie portalu (wzorzec `WylogujButton`);
5. Wygaśnięcie: standardowe sesje Supabase (refresh token); unieważnienie dostępu =
   `portal.user_klienci.aktywny=false` (bramki i widoki filtrują po `aktywny`)
   — działa NATYCHMIAST, niezależnie od życia sesji.

**Callback portalu:** osobny route `/portal/callback` z tą samą walidacją `next`
co panelowy (lekcja z audytu — open redirect).

## d) Warstwa dostępu

**Stan zastany (zweryfikowany):** `anon`/`authenticated` nie mają grantów na schemacie
`fluinty` (default-deny) — i TAK ZOSTAJE. To wynika z braku `GRANT USAGE/SELECT` dla
tych ról na niestandardowym schemacie (PostgREST expose ≠ grant).

**Co trzeba nadać (wyłącznie na `portal`):**
- `GRANT USAGE ON SCHEMA portal TO authenticated;`
- `GRANT SELECT ON portal.faktury, portal.faktura_pozycje, portal.faktura_podglad,
  portal.user_klienci TO authenticated;` (user_klienci z RLS `user_id = auth.uid()`);
- `portal.faktury_decyzje`: **BEZ grantu INSERT/UPDATE dla authenticated** — zapisy
  wyłącznie przez server actions (service_role) z bramką; SELECT przez widok
  filtrowany;
- dopisać `portal` do `db-schemas` PostgREST (konfiguracja projektu Supabase).

**Zapisy — server actions z bramką:** `assertPortalAccess(fakturaId)` (wzorzec
`assertNipReadAccess`, fail-closed): auth.uid() → pary z `portal.user_klienci`
(aktywne) → client_nip karty ∈ pary → inaczej odmowa. Walidacje wejścia jak
w panelu (długość komentarza, enum decyzji, typ przed `.trim()` — lekcje z recenzji).

**Zasada twarda: przeglądarka portalu NIGDY nie widzi service_role.** Klient JS
używa wyłącznie klucza anon + sesji użytkownika; service_role żyje tylko w server
actions (jak w panelu) i wyłącznie za bramką per user→nip. Spina się z planowaną
rotacją sekretów i rozdzieleniem ról kluczy (burza §5.1).

**Wymagana zmiana W PANELU przed startem portalu (znaleziona przy projekcie):**
layout `(auth)` przy BRAKU wiersza w `panel_users` renderuje shell z rolą fallback
(`'ksiegowa'`), strony robią `redirect('/login')` (getAllowedNips), a middleware
odsyła zalogowanych z `/login` na `/do-akceptacji` — **użytkownik portalowy, który
wejdzie na adres panelu, wpadnie w pętlę przekierowań**. Fix: layout (auth) przy
`panelUser == null` renderuje neutralną stronę (wzorzec blokady roli klient)
zamiast polegać na redirectach stron. Mały diff, duża różnica — do P1.

## e) Trasy i stany brzegowe

```
/portal/login      logowanie magic link (publiczne)
/portal/callback   wymiana kodu na sesję (walidacja next)
/portal            lista faktur wybranej firmy (layout portalowy)
/portal/[fakturaId] szczegół: metryczka + pozycje (+ pełny podgląd gdy jest)
                   + akcje zatwierdź/odrzuć/komentarz
```

Osobny layout `/portal/*` — bez TopBara biura, własna neutralna nawigacja
(logo biura?, przełącznik firmy gdy NIP-ów >1, Wyloguj). Middleware panelu
wyklucza `/portal` ze swoich reguł (osobna gałąź: wymaga sesji, ale NIE panel_users).

**Stany brzegowe (każdy z jawnym ekranem, zero pustych bieli):**
- zalogowany bez ŻADNEJ aktywnej pary w `user_klienci` → „Konto nieaktywne —
  skontaktuj się z biurem" + Wyloguj;
- NIP wyłączony (`clients.aktywny=false`) → jak wyżej (filtr w widokach po JOIN
  z clients.aktywny);
- zero faktur dla NIP → „Brak faktur" z wyjaśnieniem (KSeF/okres);
- karta w statusie niewidocznym (pominięta) → 404 w szczególe (nie „brak dostępu" —
  bez wycieku istnienia);
- multi-NIP → przełącznik; wybór pamiętany (cookie/localStorage, bez wpływu na
  bezpieczeństwo — autoryzacja i tak per żądanie).

Feed jest mały (mediana 13, max 252 kart/klient — pomiar) — paginacja prosta,
bez wyszukiwarki w MVP (D7).

## f) Ryzyka i pytania otwarte — lista decyzyjna dla właściciela

**Ryzyka techniczne:**
1. Multi-tenant portalu = inna liga niż panel (ofiarą klient końcowy) — mitygacja:
   projekcja + RLS + bramki + adwersaryjna recenzja dostępu PRZED pierwszym
   zaproszeniem (jak recenzje falowe, soczewka wyłącznie „cudze dane");
2. Świeżość feedu dziedziczy tor nexo (rotacja sesji) — awaria toru staje się
   widoczna dla klientów; watchdog już alarmuje, ale komunikat w portalu
   („dane mogą być nieaktualne") do rozważenia;
3. Pętla przekierowań panel↔login dla userów spoza panel_users — fix w P1 (§d);
4. `inviteUserByEmail` wysyła mail z szablonu Supabase — branding/treść po polsku
   wymaga konfiguracji szablonów w projekcie.

**Pytania otwarte (decyzje właściciela, nie blokują startu implementacji §a-b):**
1. Czy klient widzi karty pominięte (ignored/skipped)? Rekomendacja: NIE w MVP.
2. Zakres historyczny feedu: wszystko (od maja 2026) czy od daty startu portalu?
   Rekomendacja: wszystko — dane są (100% pozycji), różnicowanie to złożoność.
3. Tryb blocking (`portal_wymaga_akceptacji`) — POZA MVP; kiedy wraca, dotyka
   bramki auto-write → osobna zgoda i projekt.
4. Podgląd portalu dla księgowej/admina (impersonacja read-only „zobacz co widzi
   klient")? Przydatne dla wsparcia; wymaga jawnego trybu w bramkach.
5. Powiadomienia e-mail o nowej fakturze — poza MVP (D7), ale szablony/preferencje
   warto zaprojektować w danych od razu (kolumna w user_klienci?).
6. Domena: `/portal` na tej samej aplikacji Vercel (rekomendacja: tak w MVP —
   jeden deploy, izolacja przez layout/middleware) vs subdomena osobna później.
7. Komentarz bez decyzji (samodzielny) — dopuszczony w modelu (§b); potwierdzić
   produktowo.
8. RODO/DPA: rozszerzenie Umowy Powierzenia o kategorię „użytkownicy portalu"
   + regulamin portalu (burza §5.3) — do prawnika równolegle z implementacją.

**Kolejność implementacji po zatwierdzeniu projektu (propozycja):**
K2: schemat `portal` + widoki + granty + RLS (migracja, wykonanie ręczne) →
K3: auth flow (zaproszenia, callback, layout) + fix pętli panelu →
K4: feed + szczegół (read-only) → K5: decyzje/komentarze + badge/alert w panelu →
recenzja adwersaryjna dostępu → pierwsi zaproszeni.
