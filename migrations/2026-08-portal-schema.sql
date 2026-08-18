-- ── PORTAL KLIENTA — K2: schemat, tabele, widoki, granty, RLS ───────────────
-- STATUS: DO WYKONANIA RĘCZNIE. Agent NIE wykonuje.
--
-- Projekt: docs/PORTAL-P1-architektura.md (kamień 1, zatwierdzony 18.08.2026
-- z decyzjami 1-8). Zasady: fluinty pozostaje DEFAULT-DENY dla ról klienckich;
-- klient czyta WYŁĄCZNIE widoki schematu portal (projekcja z wbudowanym filtrem
-- auth.uid()); zapisy TYLKO przez server actions z bramką (tabele bez grantów
-- dla authenticated); decyzja jest PER KARTA (PK faktura_id).
--
-- PO WYKONANIU SQL — DWA KROKI RĘCZNE W DASHBOARDZIE SUPABASE:
--   1) Settings → API → "Exposed schemas" (db-schemas): dopisać `portal`;
--   2) NIE dodawać żadnych grantów na fluinty (kontrola: sekcja TESTY, T5).
--
-- Wykonywać w jednej sesji, krok po kroku, czytając wyniki.

-- ── KROK 1: SCHEMAT ─────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS portal;

-- ── KROK 2: TABELE ──────────────────────────────────────────────────────────
-- Mapowanie użytkownik↔firmy. `nadal` (email admina biura, który zaprosił)
-- CELOWO nie wychodzi do projekcji (review 18.08). `powiadomienia_email` —
-- kolumna preferencji od razu (decyzja 5), bez żadnego kodu wysyłki w MVP.
CREATE TABLE portal.user_klienci (
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_nip          text        NOT NULL CHECK (client_nip ~ '^[0-9]{10}$'),
  nadal               text        NOT NULL,
  powiadomienia_email boolean     NOT NULL DEFAULT false,
  aktywny             boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_nip)
);
CREATE INDEX idx_portal_user_klienci_nip ON portal.user_klienci (client_nip);

-- Stan AKTUALNY decyzji — KONTRAKT: decyzja PER KARTA, nie per user
-- (PK faktura_id; ostatni głos wygrywa; atrybucja w user_id + historii).
CREATE TABLE portal.faktury_decyzje (
  faktura_id       bigint      PRIMARY KEY,
  client_nip       text        NOT NULL CHECK (client_nip ~ '^[0-9]{10}$'),
  user_id          uuid        NOT NULL REFERENCES auth.users(id),
  decyzja          text        CHECK (decyzja IN ('zatwierdzona','odrzucona')),
  komentarz        text        CHECK (komentarz IS NULL OR length(komentarz) <= 2000),
  po_zaksiegowaniu boolean     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- komentarz może istnieć bez decyzji (decyzja 7), ale wiersz pusty — nie
  CONSTRAINT decyzja_lub_komentarz CHECK (decyzja IS NOT NULL OR komentarz IS NOT NULL)
);
CREATE INDEX idx_portal_decyzje_nip ON portal.faktury_decyzje (client_nip);

-- Append-only historia każdej zmiany (INSERT-uje server action razem z upsertem stanu)
CREATE TABLE portal.faktury_decyzje_historia (
  id               bigserial   PRIMARY KEY,
  faktura_id       bigint      NOT NULL,
  client_nip       text        NOT NULL,
  user_id          uuid        NOT NULL,
  decyzja          text,
  komentarz        text,
  po_zaksiegowaniu boolean     NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_historia_faktura ON portal.faktury_decyzje_historia (faktura_id);

-- ── KROK 3: RLS NA TABELACH (pas dodatkowy — grantów i tak nie ma) ──────────
-- Tabele NIE dostają grantów dla authenticated (zapisy wyłącznie server action
-- przez service_role, odczyty wyłącznie przez widoki). RLS enable = ochrona
-- przed PRZYSZŁYM przypadkowym grantem: bez polityk INSERT/UPDATE/DELETE
-- każda taka próba i tak zwróci 0 wierszy / odmowę.
ALTER TABLE portal.user_klienci            ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.faktury_decyzje         ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.faktury_decyzje_historia ENABLE ROW LEVEL SECURITY;

-- Jedyne polityki: SELECT self (gdyby kiedyś świadomie nadano grant SELECT,
-- zakres i tak pozostaje własny). Zero polityk zapisu — celowo.
CREATE POLICY user_klienci_select_self ON portal.user_klienci
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY decyzje_select_wlasne ON portal.faktury_decyzje
  FOR SELECT TO authenticated USING (
    client_nip IN (SELECT uk.client_nip FROM portal.user_klienci uk
                   WHERE uk.user_id = auth.uid() AND uk.aktywny)
  );

-- ── KROK 4: WIDOKI (projekcja z wbudowanym filtrem tożsamości) ──────────────
-- Widoki wykonują się z prawami WŁAŚCICIELA (security_invoker=false, domyślne)
-- — dlatego czytają fluinty mimo default-deny dla authenticated. Filtr
-- auth.uid() JEST treścią widoku; security_barrier chroni przed wypchnięciem
-- predykatów. Kolumny: dokładnie katalog z projektu §a — NIC z listy „NIGDY".

-- Firmy zalogowanego użytkownika (BEZ kolumny `nadal` — review 18.08)
CREATE VIEW portal.moje_firmy WITH (security_barrier = true) AS
SELECT uk.client_nip,
       c.nazwa               AS firma_nazwa,
       uk.powiadomienia_email,
       uk.created_at         AS dostep_od
FROM portal.user_klienci uk
JOIN fluinty.clients c ON c.nip = uk.client_nip AND c.aktywny = true
WHERE uk.user_id = auth.uid()
  AND uk.aktywny = true;

-- Feed faktur. Status: źródłem prawdy exceptions_queue (CLAUDE.md), fallback
-- faktury.status po backfillu 17.08 (COALESCE jak v2). Pominięcia/rollback
-- NIEWIDOCZNE (decyzja 1). Zakres: cała historia (decyzja 2).
CREATE VIEW portal.faktury WITH (security_barrier = true) AS
SELECT f.id,
       f.client_nip,
       f.numer_ksef,
       f.ksiegowe_numer                          AS numer_dokumentu,
       f.data_wystawienia,
       f.data_sprzedazy,
       f.nazwa_dostawcy                          AS kontrahent_nazwa,
       f.nip_dostawcy                            AS kontrahent_nip,
       f.kwota_brutto,
       COALESCE(f.podglad_faktury->>'kodWaluty', 'PLN') AS waluta,
       f.typ_dokumentu                           AS typ,
       CASE COALESCE(eq.status, f.status)
         WHEN 'pending'         THEN 'w opracowaniu'
         WHEN 'pending_review'  THEN 'w opracowaniu'
         WHEN 'approved'        THEN 'zaksięgowana'
         WHEN 'resolved'        THEN 'zaksięgowana'
         WHEN 'auto_created'    THEN 'zaksięgowana'
         WHEN 'external_booked' THEN 'zaksięgowana'
       END                                       AS status_portalowy,
       f.created_at                              AS utworzono,
       (f.podglad_faktury IS NOT NULL)           AS ma_podglad
FROM fluinty.faktury f
LEFT JOIN fluinty.exceptions_queue eq ON eq.id = f.legacy_queue_id
JOIN fluinty.clients c ON c.nip = f.client_nip AND c.aktywny = true
WHERE COALESCE(eq.status, f.status) IN
      ('pending','pending_review','approved','resolved','auto_created','external_booked')
  AND f.client_nip IN (SELECT uk.client_nip FROM portal.user_klienci uk
                       WHERE uk.user_id = auth.uid() AND uk.aktywny);

-- Pozycje faktury — BEZ jakiejkolwiek klasyfikacji (ai_/final_/effective_)
CREATE VIEW portal.faktura_pozycje WITH (security_barrier = true) AS
SELECT fp.faktura_id,
       fp.lp,
       fp.nazwa,
       fp.ilosc,
       fp.jednostka,
       fp.wartosc_netto,
       fp.wartosc_brutto,
       fp.stawka_vat
FROM fluinty.faktury_pozycje fp
WHERE fp.faktura_id IN (SELECT pf.id FROM portal.faktury pf);

-- Pełny podgląd KSeF dla kart, które go mają (dane WŁASNEJ faktury klienta).
-- Przy implementacji feedu ZWERYFIKOWAĆ jawną listą, czy worker nie dopisuje
-- do podglad_faktury pól diagnostycznych — wtedy zawęzić do jsonb_build_object.
CREATE VIEW portal.faktura_podglad WITH (security_barrier = true) AS
SELECT f.id AS faktura_id,
       f.podglad_faktury
FROM fluinty.faktury f
WHERE f.podglad_faktury IS NOT NULL
  AND f.id IN (SELECT pf.id FROM portal.faktury pf);

-- Aktualne decyzje moich firm (odczyt stanu przez projekcję, nie tabelę)
CREATE VIEW portal.moje_decyzje WITH (security_barrier = true) AS
SELECT d.faktura_id,
       d.client_nip,
       d.decyzja,
       d.komentarz,
       d.po_zaksiegowaniu,
       d.updated_at
FROM portal.faktury_decyzje d
WHERE d.client_nip IN (SELECT uk.client_nip FROM portal.user_klienci uk
                       WHERE uk.user_id = auth.uid() AND uk.aktywny);

-- ── KROK 5: GRANTY (wyłącznie schemat portal, wyłącznie widoki) ─────────────
GRANT USAGE ON SCHEMA portal TO authenticated;
GRANT SELECT ON portal.moje_firmy,
                portal.faktury,
                portal.faktura_pozycje,
                portal.faktura_podglad,
                portal.moje_decyzje
TO authenticated;
-- CELOWO: zero grantów dla anon (logowanie nie czyta portalu), zero grantów
-- na TABELE portal.* dla authenticated, zero jakichkolwiek grantów na fluinty.

-- ── TESTY ZAPYTANIOWE PLANU (wykonać PO migracji, w tej samej sesji) ────────
-- Symulacja: auth.uid() w Supabase czyta claim `sub` z request.jwt.claims.
-- Podstaw DWA istniejące NIP-y z fluinty.clients (aktywne) w miejscach <NIP_A>/<NIP_B>.
--
-- T0. Przygotowanie fikcyjnego usera testowego (po teście SPRZĄTAMY):
--   INSERT INTO auth.users (id, email) VALUES
--     ('00000000-0000-4000-8000-000000000001', 'test-portal@example.invalid');
--   (jeśli INSERT odrzucą wewnętrzne NOT NULL auth.users — założyć usera przez
--   Dashboard → Authentication → Add user i PODSTAWIĆ jego uuid we wszystkich
--   testach poniżej zamiast 0000...0001)
--   INSERT INTO portal.user_klienci (user_id, client_nip, nadal)
--     VALUES ('00000000-0000-4000-8000-000000000001', '<NIP_A>', 'test@biuro');
--
-- T1. User z parą widzi WYŁĄCZNIE swoją firmę:
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
--   SELECT count(*) AS kart_mojej_firmy FROM portal.faktury;          -- > 0 dla NIP_A z kartami
--   SELECT count(*) AS obcych FROM portal.faktury WHERE client_nip <> '<NIP_A>';  -- MUSI być 0
--   SELECT * FROM portal.moje_firmy;                                  -- 1 wiersz, bez kolumny nadal
--   ROLLBACK;
--
-- T2. User BEZ pary (inny sub) — wszystko puste:
--   BEGIN; SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
--   SELECT count(*) FROM portal.faktury;        -- 0
--   SELECT count(*) FROM portal.moje_firmy;     -- 0
--   ROLLBACK;
--
-- T3. Kolumny „NIGDY" fizycznie nie istnieją (oczekiwany BŁĄD undefined_column):
--   SELECT ai_proponowany_opis FROM portal.faktury LIMIT 1;
--   SELECT resolved_by         FROM portal.faktury LIMIT 1;
--   SELECT effective_kolumna_kpir FROM portal.faktura_pozycje LIMIT 1;
--
-- T4. Statusy niewidoczne odfiltrowane:
--   BEGIN; SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
--   SELECT DISTINCT status_portalowy FROM portal.faktury;
--     -- WYŁĄCZNIE 'w opracowaniu' / 'zaksięgowana'; zero NULL-i
--   ROLLBACK;
--
-- T5. fluinty pozostaje default-deny (oczekiwany BŁĄD permission denied):
--   BEGIN; SET LOCAL ROLE authenticated;
--   SELECT count(*) FROM fluinty.faktury;       -- permission denied for schema fluinty
--   ROLLBACK;
--
-- T6. Tabele portal bez dostępu mimo roli (oczekiwany BŁĄD permission denied):
--   BEGIN; SET LOCAL ROLE authenticated;
--   SELECT count(*) FROM portal.user_klienci;   -- permission denied (brak grantu)
--   INSERT INTO portal.faktury_decyzje (faktura_id, client_nip, user_id, decyzja, po_zaksiegowaniu)
--     VALUES (1, '<NIP_A>', '00000000-0000-4000-8000-000000000001', 'zatwierdzona', false);
--     -- permission denied
--   ROLLBACK;
--
-- T7. Sprzątanie:
--   DELETE FROM portal.user_klienci WHERE user_id = '00000000-0000-4000-8000-000000000001';
--   DELETE FROM auth.users          WHERE id      = '00000000-0000-4000-8000-000000000001';
