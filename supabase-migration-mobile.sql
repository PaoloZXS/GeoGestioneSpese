-- =============================================
-- GeoGestioneSpese — Migrazione APP MOBILE
-- =============================================
-- Esegui questo SQL nel SQL Editor di Supabase
-- (https://supabase.com/dashboard/project/pxbgbzizfrojbmvvtpzc/sql/new)
-- =============================================
--
-- Aggiunge alle tabelle spese/entrate i campi per:
--  - origine: 'desktop' (web) oppure 'mobile' (app Android)
--  - visto_da_desktop: TRUE quando il desktop ha già mostrato la voce
--    nel modale "Nuove voci dal cellulare" (per mostrarla solo una volta)
-- =============================================

-- 1. SPESE
ALTER TABLE spese
  ADD COLUMN IF NOT EXISTS origine TEXT NOT NULL DEFAULT 'desktop';

ALTER TABLE spese
  ADD COLUMN IF NOT EXISTS visto_da_desktop BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. ENTRATE
ALTER TABLE entrate
  ADD COLUMN IF NOT EXISTS origine TEXT NOT NULL DEFAULT 'desktop';

ALTER TABLE entrate
  ADD COLUMN IF NOT EXISTS visto_da_desktop BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Indici per velocizzare la query delle voci mobile non ancora viste
CREATE INDEX IF NOT EXISTS idx_spese_mobile_nonviste
  ON spese (origine, visto_da_desktop);
CREATE INDEX IF NOT EXISTS idx_entrate_mobile_nonviste
  ON entrate (origine, visto_da_desktop);

-- =============================================
-- Riepilogo verifica (opzionale)
-- =============================================
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('spese','entrate')
--   AND column_name IN ('origine','visto_da_desktop');
