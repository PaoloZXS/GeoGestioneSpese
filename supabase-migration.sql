-- =============================================
-- GeoGestioneSpese — Tabelle Supabase
-- =============================================
-- Esegui questo SQL nel SQL Editor di Supabase
-- (https://supabase.com/dashboard/project/pxbgbzizfrojbmvvtpzc/sql/new)
-- =============================================

-- Abilita RLS (Row Level Security) per sicurezza
-- Le tabelle permettono SELECT/INSERT/UPDATE/DELETE per tutti (anon key)
-- In futuro si potrà limitare per utente autenticato

-- 1. CATEGORIE
CREATE TABLE IF NOT EXISTS categorie (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrate', 'uscite')),
  descrizione TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE categorie ENABLE ROW LEVEL SECURITY;

-- 2. RICORRENTI
CREATE TABLE IF NOT EXISTS ricorrenti (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrate', 'uscite')),
  descrizione TEXT NOT NULL,
  importo NUMERIC NOT NULL,
  data_inizio TEXT NOT NULL,
  data_fine TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ricorrenti ENABLE ROW LEVEL SECURITY;

-- 3. SPESE
CREATE TABLE IF NOT EXISTS spese (
  id TEXT PRIMARY KEY,
  data DATE NOT NULL,
  descrizione TEXT NOT NULL,
  importo NUMERIC NOT NULL,
  stato TEXT NOT NULL DEFAULT 'preventivata' CHECK (stato IN ('preventivata', 'eseguita', 'scaduta')),
  ric_id TEXT REFERENCES ricorrenti(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE spese ENABLE ROW LEVEL SECURITY;

-- 4. ENTRATE
CREATE TABLE IF NOT EXISTS entrate (
  id TEXT PRIMARY KEY,
  data DATE NOT NULL,
  descrizione TEXT NOT NULL,
  importo NUMERIC NOT NULL,
  ric_id TEXT REFERENCES ricorrenti(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE entrate ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLICIES RLS — Accesso pubblico (anon key)
-- In produzione, limitare per user_id
-- =============================================

CREATE POLICY "Accesso pubblico spese"
  ON spese FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Accesso pubblico entrate"
  ON entrate FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Accesso pubblico categorie"
  ON categorie FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Accesso pubblico ricorrenti"
  ON ricorrenti FOR ALL USING (true) WITH CHECK (true);
