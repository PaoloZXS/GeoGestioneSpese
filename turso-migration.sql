-- =============================================
-- GeoGestioneSpese — Tabelle Turso (SQLite)
-- =============================================
-- Esegui questo SQL nel Turso CLI o SQL Editor
--   turso db shell <database-name> --file turso-migration.sql
-- oppure incollalo nel pannello "Explore/Query" del DB.
--
-- NOTA: non è più necessario eseguirlo a mano: js/data.js
-- crea automaticamente le tabelle all'avvio (CREATE TABLE IF NOT EXISTS)
-- e migra i dati da Supabase una sola volta.
-- Questo file serve come riferimento/schema ufficiale.
--
-- Conversioni dalla versione Supabase:
--   TIMESTAMPTZ  -> TEXT (timestamp ISO 8601)
--   DATE         -> TEXT (formato YYYY-MM-DD)
--   NUMERIC      -> REAL
--   BOOLEAN      -> INTEGER (0/1)
--   RLS/POLICY   -> rimosse (Turso non ha RLS)
-- =============================================

-- 1. CATEGORIE
CREATE TABLE IF NOT EXISTS categorie (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrate', 'uscite')),
  descrizione TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 2. RICORRENTI
CREATE TABLE IF NOT EXISTS ricorrenti (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrate', 'uscite')),
  descrizione TEXT NOT NULL,
  importo REAL NOT NULL,
  giorno INTEGER DEFAULT 1,
  data_inizio TEXT NOT NULL,
  data_fine TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 3. SPESE
CREATE TABLE IF NOT EXISTS spese (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  descrizione TEXT NOT NULL,
  importo REAL NOT NULL,
  stato TEXT NOT NULL DEFAULT 'preventivata' CHECK (stato IN ('preventivata', 'eseguita', 'scaduta')),
  origine TEXT DEFAULT 'desktop',
  visto_da_desktop INTEGER DEFAULT 0,
  ric_id TEXT REFERENCES ricorrenti(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 4. ENTRATE
CREATE TABLE IF NOT EXISTS entrate (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  descrizione TEXT NOT NULL,
  importo REAL NOT NULL,
  stato TEXT NOT NULL DEFAULT 'preventivata' CHECK (stato IN ('preventivata', 'eseguita', 'scaduta')),
  origine TEXT DEFAULT 'desktop',
  visto_da_desktop INTEGER DEFAULT 0,
  ric_id TEXT REFERENCES ricorrenti(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 5. SNAPSHOT STORICO (backup automatici)
CREATE TABLE IF NOT EXISTS snapshot_storico (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  operazione TEXT,
  spese TEXT NOT NULL,
  entrate TEXT NOT NULL,
  categorie TEXT NOT NULL,
  ricorrenti TEXT NOT NULL,
  dati TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Indici utili
CREATE INDEX IF NOT EXISTS idx_spese_data ON spese (data);
CREATE INDEX IF NOT EXISTS idx_entrate_data ON entrate (data);
CREATE INDEX IF NOT EXISTS idx_spese_mobile ON spese (origine, visto_da_desktop);
CREATE INDEX IF NOT EXISTS idx_entrate_mobile ON entrate (origine, visto_da_desktop);
