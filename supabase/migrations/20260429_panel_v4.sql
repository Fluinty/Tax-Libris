-- Sesja 4 panelu (29.04.2026)
-- Rozszerzenia: pojazdy, opisy, dane klienta, audit logs

-- 1. Nowe pola w clients
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'fluinty' AND table_name = 'clients' 
                   AND column_name = 'pkd_glowny') THEN
        ALTER TABLE fluinty.clients ADD COLUMN pkd_glowny varchar(10);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'fluinty' AND table_name = 'clients' 
                   AND column_name = 'pkd_dodatkowe') THEN
        ALTER TABLE fluinty.clients ADD COLUMN pkd_dodatkowe text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'fluinty' AND table_name = 'clients' 
                   AND column_name = 'forma_dzialalnosci') THEN
        ALTER TABLE fluinty.clients ADD COLUMN forma_dzialalnosci varchar(20);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'fluinty' AND table_name = 'clients' 
                   AND column_name = 'sprzedaz_mieszana') THEN
        ALTER TABLE fluinty.clients ADD COLUMN sprzedaz_mieszana boolean DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'fluinty' AND table_name = 'clients' 
                   AND column_name = 'platnik_vat') THEN
        ALTER TABLE fluinty.clients ADD COLUMN platnik_vat boolean DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'fluinty' AND table_name = 'clients' 
                   AND column_name = 'proporcja_vat_odliczalna') THEN
        ALTER TABLE fluinty.clients ADD COLUMN proporcja_vat_odliczalna int DEFAULT 100;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'fluinty' AND table_name = 'clients' 
                   AND column_name = 'dodatkowe_info_ksiegowej') THEN
        ALTER TABLE fluinty.clients ADD COLUMN dodatkowe_info_ksiegowej text;
    END IF;
END $$;

-- 2. Tabela client_changes_log
CREATE TABLE IF NOT EXISTS fluinty.client_changes_log (
    id bigserial PRIMARY KEY,
    client_nip varchar(10) REFERENCES fluinty.clients(nip),
    field_name text NOT NULL,
    old_value text,
    new_value text,
    changed_by text NOT NULL,
    changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_changes_log_client 
    ON fluinty.client_changes_log (client_nip, changed_at DESC);

-- 3. Tabele client_pojazdy i client_opisy (jeśli nie istnieją)
CREATE TABLE IF NOT EXISTS fluinty.client_pojazdy (
    id bigserial PRIMARY KEY,
    client_nip varchar(10) REFERENCES fluinty.clients(nip),
    nr_rejestracyjny varchar(20) NOT NULL,
    marka_model varchar(100),
    nr_umowy_leasingu varchar(100),
    sposob_rozliczenia varchar(50) NOT NULL DEFAULT 'inne',
    aktywny boolean DEFAULT true,
    data_dodania timestamptz DEFAULT now(),
    data_zakonczenia timestamptz,
    notatki text
);

CREATE TABLE IF NOT EXISTS fluinty.client_opisy (
    id bigserial PRIMARY KEY,
    client_nip varchar(10) REFERENCES fluinty.clients(nip),
    opis text NOT NULL,
    typ_dokumentu varchar(20),
    hit_count int DEFAULT 0,
    aktywny boolean DEFAULT true,
    last_used_at timestamptz,
    created_at timestamptz DEFAULT now(),
    created_by text
);

-- 4. Permissions
GRANT ALL ON fluinty.client_changes_log TO anon, authenticated, service_role;
GRANT ALL ON fluinty.client_changes_log_id_seq TO anon, authenticated, service_role;
GRANT ALL ON fluinty.client_pojazdy TO anon, authenticated, service_role;
GRANT ALL ON fluinty.client_pojazdy_id_seq TO anon, authenticated, service_role;
GRANT ALL ON fluinty.client_opisy TO anon, authenticated, service_role;
GRANT ALL ON fluinty.client_opisy_id_seq TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
