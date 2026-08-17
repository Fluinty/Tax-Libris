-- ============================================================================
-- STATUS: DO WYKONANIA RĘCZNIE. Agent NIE wykonuje.
-- WYKONANIE ODŁOŻONE (decyzja właściciela 17.08.2026): migracje 2026-08-*
-- czekają na nową maszynę K1. Pliki ZAMROŻONE — bez poprawek do wykonania.
-- WARUNEK WEJŚCIA: KROK 0 (snapshot CSV) wykonany i NIEPUSTY. Puste CSV =
-- STOP — przy oczekiwanych ~338 rozjechanych pusty snapshot oznacza złą bazę,
-- złe zapytanie albo stan inny niż zakładany; nie kontynuować bez wyjaśnienia.
-- Kolejność na K1: KROK 0 snapshot -> trzy migracje 2026-08-* (między sobą
-- obojętnie) -> KROK 2c VALIDATE -> KROK 3 (T1) -> osobne zlecenie: sync
-- workera (external_booked/rollback) + kolejność zapisu w updateJpkSection.
-- KROK 0 wymaga psql (\copy); KROKI 1-3 działają też w Supabase SQL Editor.
-- KOLEJNOŚĆ WZGLĘDEM INNYCH MIGRACJI: obojętna. 2026-08-fala1.sql (RLS na
-- faktura_events), 2026-08-restored.sql (CHECK na faktura_events.event_type)
-- i ten plik (CHECK na faktury.status + backfill) dotykają rozłącznych
-- obiektów, a oba pliki CHECK czytają definicję dynamicznie w momencie
-- wykonania (pg_get_constraintdef), niczego nie hardkodują.
-- ============================================================================

-- ============================================================================
-- Backfill rozjazdu statusów faktury ↔ exceptions_queue (wariant b, 17.08.2026)
--
-- Źródłem prawdy o statusie karty jest exceptions_queue (z niej księguje
-- worker; widok v2 liczy status jako COALESCE(eq.status, f.status) — sprawdzone
-- pg_get_viewdef 17.08). Tabela faktury prowadzi własny status, który dla
-- 338 kart został w tyle: panel przed falą 1 pomijał karty bez zapisu do
-- faktury (60× ignored), a operacje po stronie K1 — oznaczenie external_booked
-- (253) i rollback (25) — piszą wyłącznie do queue.
--
-- POZA ZASIĘGIEM backfillu (świadomie): 131 wierszy queue BEZ wiersza faktury
-- w ogóle — 116 skipped, 11 rolled_back, 2 external_booked, 1 auto_created,
-- 1 pending (sprawdzone per wiersz 17.08: faktury_id IS NULL dla wszystkich).
-- Nie ma czego UPDATE-ować; to też dokładna różnica między COUNT-ami
-- queue vs v2 (external_booked 436/434, rolled_back 36/25) — v2 jest budowane
-- FROM faktury, więc wiersz queue bez faktury nie istnieje w v2 z konstrukcji.
--
-- Plik robi dwie rzeczy, obie idempotentne i fail-closed:
--  1. rozszerza CHECK faktury_status_check o 'rolled_back' (constraint go nie
--     zna, queue-owy zna — pg_get_constraintdef 17.08). ADD ... NOT VALID +
--     osobny VALIDATE (KROK 2c): walidacyjny skan tabeli schodzi z ACCESS
--     EXCLUSIVE (blokującego zapisy workera) na SHARE UPDATE EXCLUSIVE,
--     który zwykłych zapisów nie blokuje. NOT VALID i tak EGZEKWUJE nowy
--     CHECK dla nowych zapisów, więc backfill w KROKU 2b przechodzi.
--  2. przepisuje faktury.status := queue.status dla rozjechanych par —
--     kierunek sprawdzany ZAPYTANIEM (nie założeniem): dozwolone wyłącznie
--     pary zaobserwowane 17.08 (queue dalej w cyklu niż faktury), biała
--     lista POWTÓRZONA w WHERE UPDATE-u (okno TOCTOU: para powstała między
--     kontrolą a zapisem zostaje rozjechana i widoczna w KROKU 3, zamiast
--     po cichu skopiowana). Każda para spoza listy przerywa migrację.
--
-- ZAKRES ŚWIADOMIE MINIMALNY: wyłącznie kolumna status. resolved_by/resolved_at
-- NIE są dotykane (decyzja właściciela 17.08): dla external_booked
-- queue.resolved_by bywa wartością systemową wykrycia (worker), nie osobą,
-- która realnie zaksięgowała — kopiowanie utrwaliłoby fałszywą atrybucję.
-- updated_at też nietknięte — sync techniczny, nie zmiana merytoryczna.
--
-- TRIGGER trg_log_korekta_faktury (AFTER UPDATE): sprawdzony 17.08 — reaguje
-- wyłącznie na zmiany final_* (OLD vs NEW). Zmiana samego statusu nie wstawi
-- ani jednego wiersza do klasyfikacja_korekty.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- KROK 0 (psql). Snapshot „przed" do pliku — podstawa rollbacku.
-- Z katalogu repo:
--
--   \copy (SELECT f.id AS faktura_id, f.legacy_queue_id, f.status AS faktury_status_przed, q.status AS queue_status FROM fluinty.faktury f JOIN fluinty.exceptions_queue q ON q.id = f.legacy_queue_id WHERE f.status IS DISTINCT FROM q.status ORDER BY f.id) TO 'migrations/snapshots/2026-08-status-before.csv' WITH CSV HEADER
--
-- (Supabase SQL Editor nie zna \copy — wykonaj sam SELECT z nawiasu
--  i zapisz wynik przyciskiem „Download CSV" pod tą samą nazwą.)
--
-- ROLLBACK (gdyby trzeba było cofnąć backfill) — z zachowanego snapshotu:
--   CREATE TEMP TABLE snapshot_przed
--     (faktura_id int, legacy_queue_id int, faktury_status_przed text, queue_status text);
--   \copy snapshot_przed FROM 'migrations/snapshots/2026-08-status-before.csv' WITH CSV HEADER
--   UPDATE fluinty.faktury f
--      SET status = s.faktury_status_przed
--     FROM snapshot_przed s
--    WHERE f.id = s.faktura_id
--      AND f.status IS DISTINCT FROM s.faktury_status_przed;
-- Zwężenie CHECK z powrotem (usunięcie rolled_back) możliwe dopiero, gdy
-- żaden wiersz faktury nie ma już tego statusu.
-- ────────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- KROK 1. Skala rozjazdu PRZED — wykonaj i zachowaj wynik.
-- (Stan 17.08: 338 rozjechanych — external_booked 253, ignored 60,
--  rolled_back 25; 1392 zgodnych; 131 wierszy queue bez wiersza faktury.)
-- ────────────────────────────────────────────────────────────────────────────
--   SELECT coalesce(q.status, '(brak q)') AS queue_status,
--          coalesce(f.status, '(brak f)') AS faktury_status,
--          count(*) AS n
--     FROM fluinty.exceptions_queue q
--     FULL OUTER JOIN fluinty.faktury f ON f.legacy_queue_id = q.id
--    GROUP BY 1, 2
--    ORDER BY n DESC;

-- ────────────────────────────────────────────────────────────────────────────
-- KROK 2. Migracja właściwa — jedna transakcja, lock_timeout 3 s.
-- DDL (DROP+ADD NOT VALID) trzyma ACCESS EXCLUSIVE do COMMIT-u, ale bez
-- walidacyjnego skanu jest to milisekundowe okno; przy kolizji z lockiem
-- workera całość czysto pada po 3 s — wtedy uruchomić ponownie.
-- ────────────────────────────────────────────────────────────────────────────
SET lock_timeout = '3s';  -- sesyjnie: obejmuje też KROK 2c poniżej
BEGIN;

-- 2a. CHECK faktury_status_check + 'rolled_back' (doklejenie do AKTUALNEJ
--     definicji — wzorzec z 2026-08-restored.sql; fail-closed przy definicji
--     innej niż pojedyncze `status = ANY (ARRAY[...])`).
DO $$
DECLARE
  v_ile      int;
  v_conname  text;
  v_def      text;
  v_inner    text;
  v_cast     text;
  v_nowa_def text;
BEGIN
  SELECT count(*) INTO v_ile
    FROM pg_constraint
   WHERE conrelid = 'fluinty.faktury'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%'
     AND pg_get_constraintdef(oid) NOT LIKE '%typ_dokumentu%';
  IF v_ile <> 1 THEN
    RAISE EXCEPTION
      'Oczekiwano dokładnie 1 CHECK na faktury.status, znaleziono % — rozstrzygnij ręcznie', v_ile;
  END IF;

  SELECT conname, pg_get_constraintdef(oid)
    INTO v_conname, v_def
    FROM pg_constraint
   WHERE conrelid = 'fluinty.faktury'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%'
     AND pg_get_constraintdef(oid) NOT LIKE '%typ_dokumentu%';

  IF v_def LIKE '%''rolled_back''%' THEN
    RAISE NOTICE 'CHECK % zna już rolled_back — bez zmian.', v_conname;
  ELSE
    v_inner := (regexp_match(v_def, 'ARRAY\[(.*)\]'))[1];
    IF v_inner IS NULL OR v_inner LIKE '%ARRAY[%' THEN
      RAISE EXCEPTION 'Definicja CHECK bez pojedynczego ARRAY[...] (%) — przerywam', v_def;
    END IF;
    IF replace(v_def, v_inner, '') LIKE '%''%'
       OR replace(v_def, v_inner, '') ~* '\m(AND|OR)\M'
       OR v_def NOT LIKE '%= ANY %' THEN
      RAISE EXCEPTION 'Definicja CHECK złożona (%) — przerywam, nie zgaduję', v_def;
    END IF;
    v_cast := coalesce((regexp_match(v_inner, '''[^'']*''(::[a-zA-Z ]+)'))[1], '');
    v_nowa_def := replace(
      v_def,
      'ARRAY[' || v_inner || ']',
      'ARRAY[' || v_inner || ', ' || quote_literal('rolled_back') || v_cast || ']'
    );
    IF v_nowa_def = v_def THEN
      RAISE EXCEPTION 'Podmiana listy nie zmieniła definicji (%) — przerywam', v_def;
    END IF;
    -- pg_get_constraintdef zwraca 'CHECK ((...))' — NOT VALID doklejamy
    -- na końcu: metadane bez skanu tabeli; walidacja w KROKU 2c.
    EXECUTE format('ALTER TABLE fluinty.faktury DROP CONSTRAINT %I', v_conname);
    EXECUTE format('ALTER TABLE fluinty.faktury ADD CONSTRAINT %I %s NOT VALID', v_conname, v_nowa_def);
    RAISE NOTICE 'Rozszerzono % o rolled_back (NOT VALID — walidacja w KROKU 2c).', v_conname;
  END IF;
END $$;

-- 2b. Backfill statusów — fail-closed na klasach rozjazdu.
DO $$
DECLARE
  v_niespodziewane int;
  v_przyklady      text;
  v_zmienione      int;
BEGIN
  -- Kierunek sprawdzany ZAPYTANIEM: dozwolone wyłącznie pary zaobserwowane
  -- 17.08 (queue terminalny, faktury w tyle). Pojawienie się JAKIEJKOLWIEK
  -- innej pary rozjazdu (w tym odwrotnej: faktury dalej niż queue) = STOP
  -- i ręczna analiza, nie ciche nadpisanie.
  SELECT count(*),
         left(string_agg(format('faktury#%s: %s vs queue#%s: %s', f.id, f.status, q.id, q.status), '; ' ORDER BY f.id), 1500)
    INTO v_niespodziewane, v_przyklady
    FROM fluinty.faktury f
    JOIN fluinty.exceptions_queue q ON q.id = f.legacy_queue_id
   WHERE f.status IS DISTINCT FROM q.status
     AND NOT (
           (q.status = 'external_booked' AND f.status IN ('pending', 'pending_review', 'approved', 'resolved', 'auto_created'))
        OR (q.status = 'ignored'         AND f.status IN ('pending', 'pending_review'))
        OR (q.status = 'rolled_back'     AND f.status IN ('pending', 'pending_review', 'auto_created'))
     );
  IF v_niespodziewane > 0 THEN
    RAISE EXCEPTION
      'Rozjazd poza znanymi klasami (% wierszy) — NIE nadpisuję, obejrzyj ręcznie: %',
      v_niespodziewane, v_przyklady;
  END IF;

  -- Biała lista POWTÓRZONA w WHERE (nie tylko w kontroli wyżej): kontrola
  -- i UPDATE to dwa statementy — para spoza listy powstała POMIĘDZY nimi
  -- (zapis workera) zostaje ROZJECHANA i KROK 3 ją pokaże, zamiast zostać
  -- po cichu skopiowana.
  UPDATE fluinty.faktury f
     SET status = q.status
    FROM fluinty.exceptions_queue q
   WHERE q.id = f.legacy_queue_id
     AND f.status IS DISTINCT FROM q.status
     AND (
           (q.status = 'external_booked' AND f.status IN ('pending', 'pending_review', 'approved', 'resolved', 'auto_created'))
        OR (q.status = 'ignored'         AND f.status IN ('pending', 'pending_review'))
        OR (q.status = 'rolled_back'     AND f.status IN ('pending', 'pending_review', 'auto_created'))
     );
  GET DIAGNOSTICS v_zmienione = ROW_COUNT;
  RAISE NOTICE 'Zsynchronizowano % wierszy faktury (oczekiwane przy stanie 17.08: 338).', v_zmienione;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- KROK 2c. Walidacja constraintu — OSOBNO, po COMMIT-cie KROKU 2.
-- VALIDATE bierze SHARE UPDATE EXCLUSIVE: skanuje tabelę, ale NIE blokuje
-- zwykłych zapisów workera. Na już-zwalidowanym constraincie jest no-opem,
-- więc krok jest idempotentny.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_conname text;
  v_valid   boolean;
BEGIN
  SELECT conname, convalidated INTO v_conname, v_valid
    FROM pg_constraint
   WHERE conrelid = 'fluinty.faktury'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%'
     AND pg_get_constraintdef(oid) NOT LIKE '%typ_dokumentu%';
  IF v_conname IS NULL THEN
    RAISE EXCEPTION 'Nie znaleziono CHECK na faktury.status — sprawdź ręcznie';
  END IF;
  IF v_valid THEN
    RAISE NOTICE 'CHECK % już zwalidowany.', v_conname;
  ELSE
    EXECUTE format('ALTER TABLE fluinty.faktury VALIDATE CONSTRAINT %I', v_conname);
    RAISE NOTICE 'Zwalidowano %.', v_conname;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- KROK 3. Weryfikacja (T1) — zwraca WIERSZE, nie licznik. Oczekiwane: 0 wierszy.
-- Jeśli wiersze są, kolumna `klasa` rozróżnia:
--   'whitelista'      — para, którą backfill MIAŁ zsynchronizować, a jest
--                       rozjechana => BUG migracji (zgłoś, nie ponawiaj w ciemno);
--   'poza-whitelista' — para spoza dozwolonych klas => OCZEKIWANE przy oknie
--                       TOCTOU (worker zmienił status między kontrolą a UPDATE)
--                       albo świeży rozjazd PO migracji (worker jeszcze bez
--                       synca external/rollback — zlecenie K1); obejrzyj i
--                       zdecyduj, zwykle wystarczy ponowić KROK 2.
-- ────────────────────────────────────────────────────────────────────────────
--   SELECT f.legacy_queue_id AS legacy_id,
--          q.status AS queue_status,
--          f.status AS faktury_status,
--          CASE WHEN (
--                  (q.status = 'external_booked' AND f.status IN ('pending', 'pending_review', 'approved', 'resolved', 'auto_created'))
--               OR (q.status = 'ignored'         AND f.status IN ('pending', 'pending_review'))
--               OR (q.status = 'rolled_back'     AND f.status IN ('pending', 'pending_review', 'auto_created'))
--               ) THEN 'whitelista'
--               ELSE 'poza-whitelista'
--          END AS klasa
--     FROM fluinty.faktury f
--     JOIN fluinty.exceptions_queue q ON q.id = f.legacy_queue_id
--    WHERE f.status IS DISTINCT FROM q.status
--    ORDER BY klasa, legacy_id;
-- ============================================================================
