-- ============================================================================
-- Migration : badge_given.session_id (integer) → schedule_session_id (text)
-- Schema    : dojo
-- Date      : 2026-03-31
-- ============================================================================
--
-- CONTEXTE
--   - badge_given.session_id (integer) pointait vers sessions_config.id
--   - Le backend (PHASE 4.2) utilise maintenant schedule_sessions.id (TEXT)
--     ex: "printemps-2026", "hiver-2026"
--   - On GARDE l'ancienne colonne session_id intacte (rien de supprimé)
--   - On AJOUTE schedule_session_id TEXT et on la remplit via un mapping
--     sessions_config.name ≈ schedule_sessions.name
--
-- IDEMPOTENCE
--   - ADD COLUMN IF NOT EXISTS : relancable sans erreur si colonne existe déjà
--   - UPDATE avec COALESCE/JOIN : les lignes déjà mappées ne sont pas recassées
--   - Pas de DROP, pas de DELETE
--
-- EXECUTION
--   Coller dans Supabase Dashboard > SQL Editor > Run
-- ============================================================================


-- ============================================================================
-- ETAPE 1 : Ajouter la nouvelle colonne schedule_session_id TEXT
-- ============================================================================
-- En gros : on ajoute une colonne vide qu'on remplira à l'étape suivante.
-- IF NOT EXISTS = safe si on relance le script.

ALTER TABLE dojo.badge_given
  ADD COLUMN IF NOT EXISTS schedule_session_id TEXT;


-- ============================================================================
-- ETAPE 2 : Remplir schedule_session_id en mappant via le nom de session
-- ============================================================================
-- En gros : pour chaque badge, on cherche le nom de la session dans
-- sessions_config (via l'ancien integer session_id), puis on trouve l'ID TEXT
-- correspondant dans schedule_sessions en matchant sur le nom.
--
-- Mapping : badge_given.session_id
--              → sessions_config.id  (integer, clé de jonction)
--              → sessions_config.name (ex: "Printemps 2026")
--              ≈ schedule_sessions.name (ex: "Printemps 2026")
--              → schedule_sessions.id (text, ex: "printemps-2026")
--
-- NOTE : le match sur .name suppose que les noms sont identiques (ou très
-- proches) entre les deux tables. Si ce n'est pas le cas, vérifier avec
-- la requête de diagnostic en bas du fichier avant de commiter les données.
--
-- Les lignes où le mapping échoue restent NULL dans schedule_session_id
-- (aucune donnée n'est perdue ou corrompue).

UPDATE dojo.badge_given bg
SET schedule_session_id = ss.id
FROM dojo.sessions_config sc
JOIN dojo.schedule_sessions ss
  ON TRIM(LOWER(sc.name)) = TRIM(LOWER(ss.name))
WHERE bg.session_id = sc.id
  AND bg.schedule_session_id IS NULL;  -- idempotent : ne re-traite pas les lignes déjà mappées


-- ============================================================================
-- ETAPE 3 (optionnelle) : Ajouter un index pour les requêtes fréquentes
-- ============================================================================
-- En gros : accélère les SELECT ... WHERE schedule_session_id = '...' .
-- IF NOT EXISTS = safe si l'index existe déjà.

CREATE INDEX IF NOT EXISTS idx_badge_given_schedule_session_id
  ON dojo.badge_given (schedule_session_id);


-- ============================================================================
-- VERIFICATION POST-MIGRATION
-- ============================================================================
-- Lancer ces SELECT manuellement pour valider :

-- 1. Combien de lignes ont été mappées vs restées NULL
-- SELECT
--   COUNT(*) FILTER (WHERE schedule_session_id IS NOT NULL) AS mapped,
--   COUNT(*) FILTER (WHERE schedule_session_id IS NULL)     AS unmapped,
--   COUNT(*)                                                 AS total
-- FROM dojo.badge_given;

-- 2. Voir les lignes non mappées (pour déboguer si mapping échoue)
-- SELECT bg.id, bg.session_id, sc.name AS old_session_name, bg.schedule_session_id
-- FROM dojo.badge_given bg
-- LEFT JOIN dojo.sessions_config sc ON bg.session_id = sc.id
-- WHERE bg.schedule_session_id IS NULL;

-- 3. Diagnostic mapping — voir quels noms ne matchent pas entre les deux tables
-- SELECT sc.id AS old_id, sc.name AS sessions_config_name, ss.id AS new_id, ss.name AS schedule_sessions_name
-- FROM dojo.sessions_config sc
-- FULL OUTER JOIN dojo.schedule_sessions ss
--   ON TRIM(LOWER(sc.name)) = TRIM(LOWER(ss.name))
-- ORDER BY sc.name;

-- 4. Aperçu du résultat final
-- SELECT id, student_id, session_id, schedule_session_id
-- FROM dojo.badge_given
-- LIMIT 20;
