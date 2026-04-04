-- ============================================================================
-- Phase 4.1 : Ajouter colonnes DM manquantes a schedule_courses
-- ============================================================================
-- SAFE : ALTER ... ADD COLUMN IF NOT EXISTS = idempotent, relancable sans risque
-- ZERO perte de donnees : on ajoute des colonnes, on ne touche a rien d'existant
-- ============================================================================

-- courses_per_session : nombre de cours que ce groupe donne par session
-- DM fallback = 10 quand NULL, donc DEFAULT 10
ALTER TABLE dojo.schedule_courses
  ADD COLUMN IF NOT EXISTS courses_per_session integer DEFAULT 10;

-- counts_for_progression : est-ce que ce cours compte pour le calcul de ceinture/grade
-- DM traite NULL comme true (g.counts_for_progression !== false), donc DEFAULT true
ALTER TABLE dojo.schedule_courses
  ADD COLUMN IF NOT EXISTS counts_for_progression boolean DEFAULT true;

-- max_capacity : capacite maximale d'eleves dans ce cours
-- DM fallback = 25 quand NULL, donc DEFAULT 25
ALTER TABLE dojo.schedule_courses
  ADD COLUMN IF NOT EXISTS max_capacity integer DEFAULT 25;

-- Verification rapide apres execution :
-- SELECT id, courses_per_session, counts_for_progression, max_capacity
-- FROM dojo.schedule_courses
-- LIMIT 10;
