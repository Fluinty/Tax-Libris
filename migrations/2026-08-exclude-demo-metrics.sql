-- ============================================================================
-- STATUS: NIE URUCHAMIAĆ. Decyzja 11.08.2026 — wiersz DEMO zachowuje metryki
-- (używany do prezentacji), filtr sum zrealizowany frontendowo w
-- ClientsTableClient. Plik zostaje jako dokumentacja rozważanego wariantu.
-- Fragment uprawnień (REVOKE/GRANT) został wykonany osobno 11.08.2026.
-- ============================================================================

-- ============================================================================
-- Wykluczenie klientow DEMO (clients.is_demo = true) z metryk dashboardu
-- RPC: fluinty.client_metrics(since timestamptz)
--
-- STRATEGIA (bez przepisywania logiki metryk):
--   Definicja client_metrics nie jest wersjonowana w repo, wiec zamiast
--   odtwarzac jej cialo (ryzyko cichej zmiany semantyki), zmieniamy nazwe
--   istniejacej funkcji na client_metrics_all i tworzymy nowy client_metrics
--   jako cienki wrapper, ktory filtruje klientow is_demo = true.
--   Oryginalna logika liczenia metryk pozostaje NIETKNIETA.
--
-- PRZED URUCHOMIENIEM (opcjonalnie, dla kopii bezpieczenstwa) mozesz podejrzec
-- aktualna definicje:
--   SELECT pg_get_functiondef('fluinty.client_metrics(timestamptz)'::regprocedure);
--
-- ROLLBACK (gdyby cos poszlo nie tak):
--   DROP FUNCTION IF EXISTS fluinty.client_metrics(timestamptz);
--   ALTER FUNCTION fluinty.client_metrics_all(timestamptz) RENAME TO client_metrics;
--   NOTIFY pgrst, 'reload schema';
--
-- Skrypt jest transakcyjny i idempotentny (bezpieczny przy ponownym uruchomieniu).
--
-- UWAGA — SWIADOMY SKUTEK UBOCZNY (przeczytaj przed uruchomieniem):
--   client_metrics jest jedynym zrodlem metryk dla /klienci, a admin nadal
--   WIDZI wiersz DEMO w tabeli. Po tej migracji wiersz "Demo Firma" pokaze
--   zera we wszystkich kolumnach i zielony "check" w "Do akceptacji" nawet
--   tuz po "Zainicjuj Demo" (faktury pending istnieja, ale RPC ich nie
--   raportuje). Jesli demo ma dalej pokazywac wlasne metryki w SWOIM wierszu
--   (a byc wykluczone tylko z sum), NIE uruchamiaj tej migracji — filtr sum
--   w stopce /klienci jest juz zrealizowany po stronie frontendu.
-- ============================================================================

BEGIN;

-- 1) Zmiana nazwy oryginalnej funkcji (tylko jesli jeszcze nie zmieniona)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'fluinty' AND p.proname = 'client_metrics_all'
  ) THEN
    RAISE NOTICE 'fluinty.client_metrics_all juz istnieje — pomijam zmiane nazwy';
  ELSE
    ALTER FUNCTION fluinty.client_metrics(timestamptz) RENAME TO client_metrics_all;
  END IF;
END $$;

-- 2) Nowy client_metrics: wrapper filtrujacy klientow DEMO.
--    Kontrakt kolumn zgodny z ClientMetricsRow (src/types/database.ts);
--    jawne rzutowania eliminuja ryzyko niezgodnosci typow z oryginalem.
--    SECURITY INVOKER (domyslne) — wolajacym jest service_role (panel uzywa
--    klienta admin), wiec uprawnienia do fluinty.clients sa zapewnione,
--    a srodowisko wykonania client_metrics_all pozostaje takie jak dotad.
CREATE OR REPLACE FUNCTION fluinty.client_metrics(since timestamptz)
RETURNS TABLE (
  client_nip        text,
  pending_count     bigint,
  ai_count          bigint,
  external_count    bigint,
  skipped_count     bigint,
  czyste_ksiegowo   bigint,
  decyzje_ksiegowe  bigint,
  decyzje_realne    bigint,
  pct_ksiegowa      numeric,
  auto_verdict      text
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    m.client_nip::text,
    m.pending_count::bigint,
    m.ai_count::bigint,
    m.external_count::bigint,
    m.skipped_count::bigint,
    m.czyste_ksiegowo::bigint,
    m.decyzje_ksiegowe::bigint,
    m.decyzje_realne::bigint,
    m.pct_ksiegowa::numeric,
    m.auto_verdict::text
  FROM fluinty.client_metrics_all(since) m
  WHERE NOT EXISTS (
    SELECT 1
    FROM fluinty.clients c
    WHERE c.nip = m.client_nip
      AND c.is_demo IS TRUE
  );
$function$;

-- 3) Uprawnienia — least privilege.
--    Panel wola RPC WYLACZNIE przez service_role (createSupabaseAdmin), a
--    filtrowanie NIP-ow per uzytkownik dzieje sie dopiero w JS. Nowa funkcja
--    dostalaby domyslnie EXECUTE dla PUBLIC, a client_metrics_all dziedziczy
--    stare ACL po rename — dlatego jawnie odbieramy dostep rolom API.
REVOKE ALL ON FUNCTION fluinty.client_metrics(timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fluinty.client_metrics_all(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fluinty.client_metrics(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION fluinty.client_metrics_all(timestamptz) TO service_role;

COMMIT;

-- Odswiezenie cache schematu PostgREST (Supabase zwykle robi to samo przez
-- event trigger, ale jawny NOTIFY nie szkodzi)
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- WERYFIKACJA PO URUCHOMIENIU:
--   SELECT * FROM fluinty.client_metrics(null);
--     -> brak wiersza z client_nip = '9999999901'
--   SELECT * FROM fluinty.client_metrics_all(null);
--     -> wiersz 9999999901 nadal widoczny (oryginalna logika nietknieta)
-- ============================================================================
