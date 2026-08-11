-- ============================================================================
-- STATUS: DO WYKONANIA RĘCZNIE (Supabase SQL Editor). Agent NIE wykonuje.
-- Rekonesans 11.08.2026 (read-only): kolumny clients.auto_write_enabled
-- i clients.auto_max_kwota, tabela fluinty.config z wierszem
-- ('auto_write_global','off') oraz tabela fluinty.faktura_events JUŻ ISTNIEJĄ
-- na produkcji (utworzone poza repo, najpewniej sesja T5 workera). Skrypt jest
-- w pełni idempotentny — na dziś realnie zmienia tylko uprawnienia
-- (REVOKE/GRANT na fluinty.config). Zostaje w repo jako wersjonowana
-- definicja warstwy konfiguracji bramki auto-write.
-- ============================================================================

-- ============================================================================
-- Bramka auto-write — warstwa konfiguracji (CZĘŚĆ PANELOWA)
--
-- Automat ksieguje TYLKO przy dwoch niezaleznych decyzjach:
--   1) per-klient:  fluinty.clients.auto_write_enabled = true (toggle w panelu,
--      wylacznie admin) + prog fluinty.clients.auto_max_kwota,
--   2) globalnie:   fluinty.config key='auto_write_global' value='on'
--      (kill-switch; przelacza WYLACZNIE wlasciciel recznym SQL-em — panel
--      celowo nie ma zadnego UI do zmiany, tylko odczyt/badge).
--
-- Zmiana kill-switcha (wylacznie wlasciciel):
--   UPDATE fluinty.config SET value='on'  WHERE key='auto_write_global';
--   UPDATE fluinty.config SET value='off' WHERE key='auto_write_global';
--
-- Skrypt NIE zmienia definicji istniejacych kolumn/tabel (ADD COLUMN /
-- CREATE TABLE wylacznie z IF NOT EXISTS; INSERT z ON CONFLICT DO NOTHING).
-- ============================================================================

BEGIN;

-- 1) Kolumny konfiguracji per-klient (no-op jesli istnieja)
ALTER TABLE fluinty.clients
  ADD COLUMN IF NOT EXISTS auto_write_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE fluinty.clients
  ADD COLUMN IF NOT EXISTS auto_max_kwota numeric NULL;

-- 2) Tabela konfiguracji globalnej (no-op jesli istnieje)
CREATE TABLE IF NOT EXISTS fluinty.config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- 3) Kill-switch — seed w pozycji ROZBROJONEJ; nigdy nie nadpisuje istniejacej
--    wartosci (ON CONFLICT DO NOTHING)
INSERT INTO fluinty.config (key, value)
VALUES ('auto_write_global', 'off')
ON CONFLICT (key) DO NOTHING;

-- 4) Uprawnienia — least privilege (wzorzec jak w 2026-08-exclude-demo-metrics):
--    config czytaja wylacznie panel (service_role, server-side) i worker
--    (service key). Role API anon/authenticated nie maja tu czego szukac.
REVOKE ALL ON TABLE fluinty.config FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE fluinty.config TO service_role;

COMMIT;

-- Odswiezenie cache schematu PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- WERYFIKACJA PO URUCHOMIENIU:
--   SELECT column_name, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='fluinty' AND table_name='clients'
--     AND column_name IN ('auto_write_enabled','auto_max_kwota');
--
--   SELECT * FROM fluinty.config WHERE key='auto_write_global';
--     -> dokladnie jeden wiersz, value='off' (kill-switch rozbrojony)
-- ============================================================================


-- ============================================================================
-- CZĘŚĆ 2: rozszerzenie CHECK constraint faktura_events — 11.08
--
-- BUG z testu T1: insert 'auto_write_toggled' pada na
-- faktura_events_event_type_check (zamknieta lista event_type bez nowych typow
-- bramki). Fail-safe panelu zadzialal poprawnie — brakuje tylko typow na liscie.
--
-- Dotychczasowa definicja (odczyt z produkcji 11.08.2026, pg_get_constraintdef):
--   CHECK ((event_type = ANY (ARRAY['ksef_received', 'ai_classified',
--     'validator_adjusted', 'anomaly_flagged', 'duplicate_flagged', 'queued',
--     'edited', 'approved', 'skipped', 'rezim_changed', 'opis_added_to_list',
--     'rule_created', 'booked', 'auto_booked', 'booking_failed',
--     'external_booked', 'rollback', 'reprocessed', 'comment'])))
--
-- Nowa lista = wszystkie 19 dotychczasowych typow + 2 realnie brakujace:
--   + 'auto_write_toggled'  (toggle bramki w panelu — zrodlo buga z T1)
--   + 'auto_candidate'      (czesc workerowa bramki — dokladamy od razu)
-- Uwaga: 'auto_booked' (trzeci planowany) juz JEST na liscie, a
-- 'opis_added_to_list' (0 wierszy w danych) takze — po prostu nieuzyte.
--
-- Blok idempotentny: DROP IF EXISTS + ADD z pelna jawna lista.
-- ============================================================================

BEGIN;

ALTER TABLE fluinty.faktura_events
  DROP CONSTRAINT IF EXISTS faktura_events_event_type_check;

ALTER TABLE fluinty.faktura_events
  ADD CONSTRAINT faktura_events_event_type_check CHECK (event_type = ANY (ARRAY[
    'ksef_received'::text,
    'ai_classified'::text,
    'validator_adjusted'::text,
    'anomaly_flagged'::text,
    'duplicate_flagged'::text,
    'queued'::text,
    'edited'::text,
    'approved'::text,
    'skipped'::text,
    'rezim_changed'::text,
    'opis_added_to_list'::text,
    'rule_created'::text,
    'booked'::text,
    'auto_booked'::text,
    'booking_failed'::text,
    'external_booked'::text,
    'rollback'::text,
    'reprocessed'::text,
    'comment'::text,
    -- bramka auto-write (11.08.2026):
    'auto_write_toggled'::text,
    'auto_candidate'::text
  ]));

COMMIT;

-- ============================================================================
-- WERYFIKACJA CZĘŚCI 2:
--   SELECT pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   JOIN pg_namespace n ON n.oid = t.relnamespace
--   WHERE n.nspname='fluinty' AND t.relname='faktura_events'
--     AND c.conname='faktura_events_event_type_check';
--     -> lista = 19 dotychczasowych typow + auto_write_toggled + auto_candidate
--        (auto_booked i opis_added_to_list byly juz na liscie wczesniej)
--
--   Po ponownym tescie T1 (toggle DEMO):
--   SELECT event_type, actor, payload, created_at FROM fluinty.faktura_events
--   WHERE event_type='auto_write_toggled' ORDER BY created_at DESC LIMIT 5;
-- ============================================================================
