-- ── Czyszczenie fałszywej atrybucji resolved_by w fluinty.faktury ───────────
-- STATUS: DO WYKONANIA RĘCZNIE. Agent NIE wykonuje.
--
-- PROBLEM (DECISIONS 2026-08-17, wpis o backfillu statusów): dla kart
-- external_booked wartość resolved_by = 'auto_detect_external_booking' to
-- SYSTEMOWY znacznik wykrycia (worker), nie osoba, która zaksięgowała.
-- W exceptions_queue ta wartość ZOSTAJE (źródło prawdy workera + jedyny nośnik
-- informacji „skąd wiemy, że zaksięgowano zewnętrznie"). W tabeli faktury jest
-- czystą fałszywą atrybucją serwowaną do UI (v2/„resolved_by") — do wyczyszczenia.
--
-- LICZNOŚĆ: zlecenie właściciela mówiło o 71 wierszach; pomiar 18.08.2026 =
-- 168 wierszy (klasa PRZYRASTA z każdym wykryciem workera — stąd warunek
-- KLASOWY, nie liczbowy). Wszystkie 168 miało status='external_booked'
-- (pomiar 18.08); wiersze o innym statusie migracja RAPORTUJE i POMIJA.
-- resolved_at celowo NIETKNIĘTE (data wykrycia nie jest atrybucją osobową).
--
-- WZORZEC jak migrations/2026-08-status-backfill.sql:
--   KROK 0 (warunek wejścia): snapshot CSV — puste = stop.
--   KROK 1: kontrola klasy (odchylenia od external_booked → obejrzeć przed dalszym).
--   KROK 2: UPDATE z powtórzonym pełnym warunkiem (TOCTOU).
--   KROK 3: kontrola po — oczekiwane 0.
-- Wykonywać w JEDNEJ sesji psql/edytora SQL, krok po kroku, czytając wyniki.

-- ── KROK 0: SNAPSHOT PRZED (zapisz wynik jako CSV; PUSTY WYNIK = STOP) ──────
SELECT id, client_nip, status, resolved_by, resolved_at
FROM fluinty.faktury
WHERE resolved_by = 'auto_detect_external_booking'
ORDER BY id;

-- ── KROK 1: KONTROLA KLASY ──────────────────────────────────────────────────
-- Oczekiwane: jeden wiersz z status='external_booked' i liczbą = liczności
-- snapshotu z KROKU 0. KAŻDY inny status w wyniku = najpierw obejrzeć te
-- wiersze (zapytaniem z KROKU 0 zawężonym do tego statusu) i dopiero
-- świadomie zdecydować — UPDATE w KROKU 2 i tak ich NIE dotknie.
SELECT status, count(*) AS ile
FROM fluinty.faktury
WHERE resolved_by = 'auto_detect_external_booking'
GROUP BY status
ORDER BY ile DESC;

-- ── KROK 2: CZYSZCZENIE (pełny warunek powtórzony — bez TOCTOU) ─────────────
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

UPDATE fluinty.faktury
SET resolved_by = NULL
WHERE resolved_by = 'auto_detect_external_booking'
  AND status = 'external_booked';

-- Przeczytaj liczbę zaktualizowanych wierszy: ma się zgadzać z KROKIEM 1
-- (pozycja external_booked). Niezgodność = ROLLBACK i diagnoza.
COMMIT;

-- ── KROK 3: KONTROLA PO ─────────────────────────────────────────────────────
-- Oczekiwane: 0 wierszy external_booked z fałszywą atrybucją. Jeśli KROK 1
-- pokazał inne statusy — pojawią się tu nadal (celowo pominięte; decyzja
-- właściciela per status).
SELECT status, count(*) AS pozostale
FROM fluinty.faktury
WHERE resolved_by = 'auto_detect_external_booking'
GROUP BY status;

-- Kontrola sanity: exceptions_queue NIETKNIĘTE — licznik ma być IDENTYCZNY
-- jak przed migracją (18.08: 440 external_booked + 2 auto_created).
SELECT status, count(*) AS queue_bez_zmian
FROM fluinty.exceptions_queue
WHERE resolved_by = 'auto_detect_external_booking'
GROUP BY status;
