-- Sesja 7 panelu: pełna kontrola JPK_V7 + confidence aggregation + weryfikacja kontrahenta
-- 05.05.2026
-- ⚠️ Adam odpala ręcznie w Supabase Dashboard SQL Editor

-- A. Confidence aggregation (worker zapisuje, panel czyta)
ALTER TABLE fluinty.exceptions_queue
  ADD COLUMN IF NOT EXISTS confidence_overall NUMERIC(3,2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS confidence_reasons JSONB NULL;

COMMENT ON COLUMN fluinty.exceptions_queue.confidence_overall IS 
'MIN(confidence ze wszystkich wymiarów: opis, kpir, vat, gtu, procedury, kontrahent, daty). 0.0-1.0';

COMMENT ON COLUMN fluinty.exceptions_queue.confidence_reasons IS
'Array obiektów: [{dim, score, msg}]. Pokazujemy w panelu posortowane po score ASC.';

-- B. Weryfikacja kontrahenta (Adam dorobi w workerze równolegle)
ALTER TABLE fluinty.exceptions_queue
  ADD COLUMN IF NOT EXISTS vendor_vat_active BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS vendor_vat_checked_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS vendor_first_occurrence BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vendor_invoice_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_potential_duplicate BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS duplicate_of_zapis_id INT NULL,
  ADD COLUMN IF NOT EXISTS date_anomaly TEXT NULL;

COMMENT ON COLUMN fluinty.exceptions_queue.vendor_vat_active IS
'TRUE = sprzedawca czynny VAT na dzień faktury (sprawdzone w białej liście MF). NULL = nie sprawdzony.';

COMMENT ON COLUMN fluinty.exceptions_queue.vendor_first_occurrence IS  
'TRUE = pierwsze wystąpienie tego sprzedawcy dla tego klienta. Wymaga uwagi.';

COMMENT ON COLUMN fluinty.exceptions_queue.is_potential_duplicate IS
'TRUE = znaleziono podobną fakturę w ZapisyKsiegowe. Wymaga uwagi.';

COMMENT ON COLUMN fluinty.exceptions_queue.date_anomaly IS
'NULL=OK, future=data wystawienia >dziś, too_old=data >90 dni, wrong_period=okres VAT nie pasuje';

-- C. Pozycje VAT - finalne edytowane
ALTER TABLE fluinty.exceptions_queue
  ADD COLUMN IF NOT EXISTS pozycje_vat_final JSONB NULL,
  ADD COLUMN IF NOT EXISTS pozycje_vat_edited BOOLEAN DEFAULT FALSE;

-- D. Reżim paliwowy - finalne
ALTER TABLE fluinty.exceptions_queue
  ADD COLUMN IF NOT EXISTS rezim_paliwowy_final TEXT NULL,
  ADD COLUMN IF NOT EXISTS pojazd_id_final BIGINT NULL,
  ADD COLUMN IF NOT EXISTS rezim_edited BOOLEAN DEFAULT FALSE;

-- E. Procedury + Typ dokumentu JPK - finalne
ALTER TABLE fluinty.exceptions_queue
  ADD COLUMN IF NOT EXISTS procedura_jpk_final INT NULL,
  ADD COLUMN IF NOT EXISTS typ_dokumentu_jpk_final SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS jpk_procedury_edited BOOLEAN DEFAULT FALSE;

-- F. GTU - finalne
ALTER TABLE fluinty.exceptions_queue
  ADD COLUMN IF NOT EXISTS gtu_bitmask_final INT NULL,
  ADD COLUMN IF NOT EXISTS gtu_edited_by_user BOOLEAN DEFAULT FALSE;

-- G. Index na confidence_overall (sortowanie listy faktur)
CREATE INDEX IF NOT EXISTS idx_exceptions_queue_confidence 
  ON fluinty.exceptions_queue (confidence_overall ASC, created_at DESC)
  WHERE status IN ('pending_review', 'pending');
