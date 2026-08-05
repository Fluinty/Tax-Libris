-- Dodanie kolumn idempotnie (IF NOT EXISTS)
ALTER TABLE fluinty.faktury ADD COLUMN IF NOT EXISTS podglad_faktury jsonb;
ALTER TABLE fluinty.client_pojazdy ADD COLUMN IF NOT EXISTS leasingodawca_nip text;
ALTER TABLE fluinty.client_pojazdy ADD COLUMN IF NOT EXISTS vat26 boolean DEFAULT false;
