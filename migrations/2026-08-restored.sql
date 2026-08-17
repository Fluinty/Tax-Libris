-- ============================================================================
-- STATUS: DO WYKONANIA RĘCZNIE (Supabase SQL Editor). Agent NIE wykonuje.
-- KOLEJNOŚĆ WZGLĘDEM INNYCH MIGRACJI: obojętna — plik dokleja do CHECK-a
-- faktura_events.event_type czytanego dynamicznie (pg_get_constraintdef
-- w momencie wykonania, zero hardkodów); 2026-08-fala1.sql (RLS) i
-- 2026-08-status-backfill.sql (faktury.status) dotykają innych obiektów.
-- ============================================================================

-- ============================================================================
-- Nowy typ zdarzenia: 'restored' — przywrócenie pominiętej karty do kolejki
--
-- Panel dostaje akcję „Przywróć do kolejki" dla kart w statusie 'ignored'
-- (pominiętych PRZEZ CZŁOWIEKA z panelu; workerowych 'skipped' nie dotyka).
-- Do osi czasu ma trafiać własny typ zdarzenia, a nie 'queued' — 'queued'
-- należy do pipeline'u ingestu i drugie „Dodana do kolejki" w historii karty
-- myliłoby każdego, kto ją czyta, oraz konsumentów rozróżniających zdarzenia
-- systemowe od decyzji człowieka (decyzja właściciela 13.08.2026).
--
-- fluinty.faktura_events ma CHECK na event_type — bez tej migracji INSERT
-- z typem 'restored' zostanie odrzucony. Panel jest na to przygotowany:
-- logFakturaEvent nie wywraca operacji, tylko zwraca ostrzeżenie (toast),
-- więc do czasu wykonania migracji przywracanie DZIAŁA, ale nie zostawia
-- wpisu na osi czasu.
--
-- UWAGA — dlaczego to DO block, a nie zwykły DROP + ADD z listą 21 wartości:
-- listy dozwolonych typów NIE DA SIĘ odczytać przez PostgREST, a rekonstrukcja
-- z kodu panelu (19 etykiet w FakturaEventsDrawer + auto_write_toggled +
-- auto_candidate = 21) jest tylko poszlaką. Gdyby w CHECK istniał typ
-- dozwolony-ale-nieużywany, którego panel nie zna, ręcznie wpisana lista
-- cicho by go WYKASOWAŁA i wywróciła przyszły INSERT workera — a że taki typ
-- ma z definicji zero wierszy, skan walidacyjny ADD CONSTRAINT też by tego
-- nie wykrył. Blok poniżej NIE parsuje wartości i nie odtwarza ograniczenia
-- z szablonu: bierze AKTUALNĄ definicję i DOKLEJA do jej listy jeden element.
-- Wszystko inne (kształt predykatu, rzutowania, ewentualne NOT VALID) zostaje
-- bit w bit takie, jakie było.
--
-- Idempotentny: przy powtórnym uruchomieniu wykrywa 'restored' i nic nie robi.
-- Fail-closed: każda definicja inna niż pojedynczy `... = ANY (ARRAY[...])`
-- przerywa migrację z komunikatem, zamiast zgadywać.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- KROK 1. Wykonaj SAM ten SELECT i zachowaj wynik (to jedyny zapis stanu
-- sprzed zmiany — Supabase SQL Editor NIE pokazuje komunikatów RAISE NOTICE,
-- więc definicja wypisana przez blok DO nigdzie się nie zmaterializuje).
-- ────────────────────────────────────────────────────────────────────────────
--   SELECT conname, pg_get_constraintdef(oid) AS definicja_przed
--     FROM pg_constraint
--    WHERE conrelid = 'fluinty.faktura_events'::regclass AND contype = 'c';

-- ────────────────────────────────────────────────────────────────────────────
-- KROK 2. Migracja właściwa.
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

DO $$
DECLARE
  v_ile      int;
  v_conname  text;
  v_def      text;
  v_inner    text;   -- zawartość ARRAY[...]
  v_cast     text;   -- rzutowanie pierwszego elementu, np. '::text'
  v_nowa_def text;
BEGIN
  -- Ile ograniczeń CHECK w ogóle wspomina event_type. Więcej niż jedno =
  -- rozszerzenie jednego z nich nie odblokuje INSERT-a (drugie dalej odrzuci),
  -- a idempotencja sprawiłaby, że powtórne uruchomienie już nigdy tego nie
  -- naprawi. Nie zgadujemy który — przerywamy.
  SELECT count(*) INTO v_ile
    FROM pg_constraint
   WHERE conrelid = 'fluinty.faktura_events'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%event_type%';

  IF v_ile = 0 THEN
    RAISE EXCEPTION
      'Nie znaleziono CHECK na event_type w fluinty.faktura_events — sprawdź ręcznie, nie zgaduję';
  END IF;
  IF v_ile > 1 THEN
    RAISE EXCEPTION
      'Znaleziono % ograniczeń CHECK wspominających event_type: %. Rozszerzenie jednego nie wystarczy — rozstrzygnij ręcznie',
      v_ile,
      (SELECT string_agg(conname, ', ' ORDER BY conname)
         FROM pg_constraint
        WHERE conrelid = 'fluinty.faktura_events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%event_type%');
  END IF;

  SELECT conname, pg_get_constraintdef(oid)
    INTO v_conname, v_def
    FROM pg_constraint
   WHERE conrelid = 'fluinty.faktura_events'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%event_type%';

  RAISE NOTICE 'Obecne ograniczenie % : %', v_conname, v_def;

  IF v_def LIKE '%''restored''%' THEN
    RAISE NOTICE 'Typ ''restored'' jest już dozwolony — migracja nic nie zmienia.';
    RETURN;
  END IF;

  -- Zawartość jedynej listy ARRAY[...]
  v_inner := (regexp_match(v_def, 'ARRAY\[(.*)\]'))[1];
  IF v_inner IS NULL THEN
    RAISE EXCEPTION
      'Definicja nie ma postaci ARRAY[...] (jest: %) — nie umiem jej rozszerzyć bezpiecznie, zrób to ręcznie', v_def;
  END IF;
  IF v_inner LIKE '%ARRAY[%' THEN
    RAISE EXCEPTION 'Zagnieżdżone ARRAY[] w definicji (%) — przerywam', v_def;
  END IF;

  -- Poza listą w definicji nie może być ŻADNEGO literału ani drugiego
  -- predykatu: gdyby CHECK brzmiał np. „event_type = ANY (...) AND actor =
  -- ANY (...)", doklejenie elementu do pierwszej tablicy byłoby poprawne, ale
  -- warto o tym wiedzieć, a przy „... OR event_type IS NULL" zmienia się sens.
  IF replace(v_def, v_inner, '') LIKE '%''%' THEN
    RAISE EXCEPTION
      'W definicji są literały poza listą ARRAY[...] (%) — sprawdź ręcznie, nie ruszam', v_def;
  END IF;
  IF replace(v_def, v_inner, '') ~* '\m(AND|OR)\M' THEN
    RAISE EXCEPTION
      'Definicja łączy kilka warunków (%) — sprawdź ręcznie, nie ruszam', v_def;
  END IF;
  IF v_def NOT LIKE '%= ANY %' THEN
    RAISE EXCEPTION 'Definicja nie jest porównaniem = ANY (...) (%) — przerywam', v_def;
  END IF;

  -- Sanity na liczbie elementów: tyle wartości, ile przecinków + 1.
  -- Rozjazd = w wartości siedzi przecinek albo lista jest inaczej zbudowana.
  IF (SELECT count(*) FROM regexp_matches(v_inner, '''[^'']*''', 'g'))
     <> (length(v_inner) - length(replace(v_inner, ',', ''))) + 1 THEN
    RAISE EXCEPTION
      'Nie potrafię jednoznacznie policzyć elementów listy (%) — przerywam zamiast nadpisać ograniczenie', v_inner;
  END IF;

  -- Rzutowanie bierzemy z pierwszego elementu (::text, ::character varying…),
  -- żeby dokleić element w tej samej postaci, w jakiej są pozostałe.
  v_cast := coalesce((regexp_match(v_inner, '''[^'']*''(::[a-zA-Z ]+)'))[1], '');

  -- Rebuild przez PODMIANĘ w oryginalnej definicji, nie przez szablon:
  -- zachowuje kształt predykatu, rzutowania i ewentualny sufiks NOT VALID.
  v_nowa_def := replace(
    v_def,
    'ARRAY[' || v_inner || ']',
    'ARRAY[' || v_inner || ', ' || quote_literal('restored') || v_cast || ']'
  );
  IF v_nowa_def = v_def THEN
    RAISE EXCEPTION 'Podmiana listy nie zmieniła definicji (%) — przerywam', v_def;
  END IF;

  EXECUTE format('ALTER TABLE fluinty.faktura_events DROP CONSTRAINT %I', v_conname);
  EXECUTE format('ALTER TABLE fluinty.faktura_events ADD CONSTRAINT %I %s', v_conname, v_nowa_def);

  RAISE NOTICE 'Dodano ''restored''. Nowa definicja: %', v_nowa_def;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- KROK 3. Weryfikacja — wykonaj i sprawdź, że w definicji jest 'restored',
-- a reszta wartości została nietknięta (porównaj z wynikiem z KROKU 1).
-- ────────────────────────────────────────────────────────────────────────────
--   SELECT conname, pg_get_constraintdef(oid) AS definicja_po
--     FROM pg_constraint
--    WHERE conrelid = 'fluinty.faktura_events'::regclass AND contype = 'c';
--
-- Smoke test panelu po migracji: przywróć jedną kartę i sprawdź, że w osi czasu
-- pojawiło się zdarzenie „Przywrócono do kolejki" (a akcja nie zwróciła
-- ostrzeżenia o niezapisanym zdarzeniu).

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (gdyby trzeba było cofnąć): odtwórz ograniczenie z definicji
-- zapisanej w KROKU 1 — podstaw ją w miejsce <DEFINICJA_PRZED>.
-- ────────────────────────────────────────────────────────────────────────────
--   BEGIN;
--   ALTER TABLE fluinty.faktura_events DROP CONSTRAINT <NAZWA_Z_KROKU_1>;
--   ALTER TABLE fluinty.faktura_events ADD CONSTRAINT <NAZWA_Z_KROKU_1> <DEFINICJA_PRZED>;
--   COMMIT;
-- Uwaga: cofnięcie nie przejdzie, jeśli w tabeli są już wiersze z event_type
-- 'restored' — najpierw sprawdź:
--   SELECT count(*) FROM fluinty.faktura_events WHERE event_type = 'restored';
