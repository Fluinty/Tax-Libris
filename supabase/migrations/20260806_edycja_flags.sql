-- Kolumny flag edycji: edycja_realna / edycja_ksiegowa
-- null = karty sprzed wdrożenia lub external; false/true = jawnie ustawione przy approve
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='fluinty' AND table_name='exceptions_queue' AND column_name='edycja_realna') THEN
    ALTER TABLE fluinty.exceptions_queue ADD COLUMN edycja_realna boolean;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='fluinty' AND table_name='exceptions_queue' AND column_name='edycja_ksiegowa') THEN
    ALTER TABLE fluinty.exceptions_queue ADD COLUMN edycja_ksiegowa boolean;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='fluinty' AND table_name='faktury' AND column_name='edycja_realna') THEN
    ALTER TABLE fluinty.faktury ADD COLUMN edycja_realna boolean;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='fluinty' AND table_name='faktury' AND column_name='edycja_ksiegowa') THEN
    ALTER TABLE fluinty.faktury ADD COLUMN edycja_ksiegowa boolean;
  END IF;
END $$;
