-- Sesja 6 panelu (30.04.2026)
-- Rozszerzenie statusów exceptions_queue + nowe pola dla pre-fill

-- 1. Constraint dla statusu (pozwól na nowe statusy)
ALTER TABLE fluinty.exceptions_queue
DROP CONSTRAINT IF EXISTS exceptions_queue_status_check;

ALTER TABLE fluinty.exceptions_queue
ADD CONSTRAINT exceptions_queue_status_check CHECK (status IN ('pending', 'pending_review', 'resolved', 'approved', 'auto_created', 'ignored'));

-- 2. Pole na pre-filled kwoty (przez AI) oraz finalnie zatwierdzone kwoty per kolumna (po edycji księgowej)
ALTER TABLE fluinty.exceptions_queue
ADD COLUMN IF NOT EXISTS ai_kwoty_per_kolumna jsonb,
ADD COLUMN IF NOT EXISTS final_kwoty_per_kolumna jsonb;

-- 3. Index dla szybkiego pobierania per status
CREATE INDEX IF NOT EXISTS idx_exceptions_status_lookup ON fluinty.exceptions_queue (client_nip, status, created_at DESC);

NOTIFY pgrst, 'reload schema';
