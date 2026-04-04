-- ============================================================================
-- Phase 4.1 : Backfill colonnes DM depuis groups vers schedule_courses
-- ============================================================================
-- PREREQUIS : migrate-phase4-columns.sql doit avoir ete execute AVANT
-- SAFE : UPDATE seulement, pas de DELETE, pas de DROP
-- MATCHING : groups.original_name = schedule_courses.id (meme slug)
-- ============================================================================

-- Etape 0 : Diagnostic — voir quels cours matchent et lesquels non
-- (a executer manuellement d'abord pour valider)

-- Cours qui matchent (devrait etre la majorite) :
-- SELECT g.original_name, sc.id, g.courses_per_session, g.counts_for_progression, g.max_capacity
-- FROM dojo.groups g
-- INNER JOIN dojo.schedule_courses sc ON g.original_name = sc.id
-- ORDER BY g.original_name;

-- Cours orphelins (dans un cote mais pas l'autre) :
-- SELECT g.original_name AS group_only, sc.id AS schedule_only
-- FROM dojo.groups g
-- FULL OUTER JOIN dojo.schedule_courses sc ON g.original_name = sc.id
-- WHERE g.original_name IS NULL OR sc.id IS NULL;

-- ============================================================================
-- Etape 1 : Backfill — copier les valeurs de groups vers schedule_courses
-- ============================================================================

UPDATE dojo.schedule_courses sc
SET
  courses_per_session = COALESCE(g.courses_per_session, 10),
  counts_for_progression = COALESCE(g.counts_for_progression, true),
  max_capacity = COALESCE(g.max_capacity, 25)
FROM dojo.groups g
WHERE g.original_name = sc.id;

-- ============================================================================
-- Etape 2 : Resume — voir ce qui a ete mis a jour
-- ============================================================================

SELECT
  sc.id,
  sc.name,
  sc.courses_per_session,
  sc.counts_for_progression,
  sc.max_capacity,
  CASE WHEN g.original_name IS NOT NULL THEN 'backfilled from groups' ELSE 'default values (no match)' END AS source
FROM dojo.schedule_courses sc
LEFT JOIN dojo.groups g ON g.original_name = sc.id
ORDER BY sc.id;
