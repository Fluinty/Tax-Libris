-- ============================================================================
-- STATUS: DO WYKONANIA RĘCZNIE (Supabase SQL Editor). Agent NIE wykonuje.
-- ============================================================================

-- ============================================================================
-- Fala 1 po audycie (docs/AUDIT-2026-08.md §1, poz. "faktura_events RLS")
--
-- fluinty.faktura_events to JEDYNA tabela schematu fluinty z WYŁĄCZONYM RLS
-- (rekonesans 12.08.2026, read-only). Dziś nieeksploatowalne — role anon /
-- authenticated nie mają grantów na schemat fluinty, a panel czyta wyłącznie
-- przez service_role — ale to niespójność defense-in-depth: pojedynczy
-- przyszły GRANT na schemacie otworzyłby oś czasu wszystkich klientów.
--
-- Włączenie RLS BEZ definiowania polityk = domyślna odmowa dla każdej roli
-- podlegającej RLS. service_role ma atrybut BYPASSRLS, więc panel i worker
-- działają bez zmian. Skrypt idempotentny.
-- ============================================================================

BEGIN;

ALTER TABLE fluinty.faktura_events ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Weryfikacja po wykonaniu (oczekiwane: relrowsecurity = true):
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE oid = 'fluinty.faktura_events'::regclass;
