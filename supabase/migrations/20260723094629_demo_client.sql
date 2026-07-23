-- Dodanie kolumny is_demo do tabeli clients
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
