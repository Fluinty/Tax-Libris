-- Dodanie typu dokumentu (zakup vs sprzedaz) do reguł i wyjątków
-- 28.04.2026 - sesja 3 panelu

-- Reguły
ALTER TABLE fluinty.rules
ADD COLUMN IF NOT EXISTS typ_dokumentu text 
  CHECK (typ_dokumentu IN ('zakup', 'sprzedaz'));

-- Wyjątki
ALTER TABLE fluinty.exceptions_queue
ADD COLUMN IF NOT EXISTS typ_dokumentu text 
  CHECK (typ_dokumentu IN ('zakup', 'sprzedaz'));

-- Indexy dla szybkiego filtrowania
CREATE INDEX IF NOT EXISTS idx_rules_typ_dokumentu 
  ON fluinty.rules (client_nip, typ_dokumentu);

CREATE INDEX IF NOT EXISTS idx_exceptions_typ_dokumentu 
  ON fluinty.exceptions_queue (client_nip, typ_dokumentu, status);

-- Backfill dla istniejących reguł:
-- "Sprzedaż" w nazwie → sprzedaz, reszta → zakup (heurystyka)
UPDATE fluinty.rules
SET typ_dokumentu = 'sprzedaz'
WHERE LOWER(opis_zdarzenia) LIKE '%sprzeda%' 
   OR LOWER(opis_zdarzenia) LIKE '%przychod%'
   OR LOWER(opis_zdarzenia) LIKE '%wynagrodzeni%'
   OR LOWER(pattern_pozycji) LIKE '%sprzeda%';

UPDATE fluinty.rules
SET typ_dokumentu = 'zakup'
WHERE typ_dokumentu IS NULL;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
