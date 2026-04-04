-- ============================================================================
-- Phase 4.4 : Migration données Hiver 2026
-- ============================================================================
-- REGLE ABSOLUE : ZERO SUPPRESSION. On ajoute, on mappe, on redirige.
-- Script idempotent — peut être relancé sans risque.
-- Exécuter dans Supabase SQL Editor.
-- ============================================================================

-- ============================================================================
-- ÉTAPE 1 : Créer la session Hiver 2026
-- ============================================================================
-- En gros : on ajoute une entrée "hiver-2026" dans schedule_sessions
-- si elle n'existe pas déjà. is_current = false (on ne bascule pas dessus).

INSERT INTO dojo.schedule_sessions (id, name, start_date, end_date, is_current)
VALUES ('hiver-2026', 'Hiver 2026', '2026-01-13', '2026-03-28', false)
ON CONFLICT (id) DO NOTHING;

-- Vérification
SELECT id, name, start_date, end_date, is_current
FROM dojo.schedule_sessions;


-- ============================================================================
-- ÉTAPE 2 : Créer les 12 cours Hiver dans schedule_courses
-- ============================================================================
-- En gros : on crée des copies des cours Printemps avec un préfixe "hiver-"
-- pour éviter les conflits d'ID. Les 2 cours sans équivalent Printemps
-- (JJ adultes lundi, MT adultes lun+mer) sont créés manuellement.

-- 2a. Les 10 cours qui ont un équivalent Printemps
-- On copie day, day_index, start_time, end_time, name, description,
-- age_group, discipline, type, is_advanced, tracks_gc, courses_per_session,
-- counts_for_progression, max_capacity depuis les cours Printemps.

INSERT INTO dojo.schedule_courses (
  id, day, day_index, start_time, end_time, name, description,
  age_group, discipline, type, is_advanced, is_active, tracks_gc,
  sort_order, courses_per_session, counts_for_progression, max_capacity
)
SELECT
  'hiver-' || sc.id,
  sc.day, sc.day_index, sc.start_time, sc.end_time,
  sc.name, sc.description, sc.age_group, sc.discipline, sc.type,
  sc.is_advanced,
  true,  -- is_active
  sc.tracks_gc,
  sc.sort_order,
  sc.courses_per_session, sc.counts_for_progression, sc.max_capacity
FROM dojo.schedule_courses sc
WHERE sc.id IN (
  'dim-16h-superkids',
  'dim-17h-enfants-deb',
  'dim-18h-enfants',
  'dim-19h-avance',
  'jeu-17h45-superkids',
  'jeu-18h30-avance',
  'jeu-19h30-adulte',
  'mar-17h45-enfants',
  'mar-18h45-ado',
  'mar-19h45-adulte'
)
ON CONFLICT (id) DO NOTHING;

-- 2b. Cours #11 : JJ Adultes — Lundi 18h30-20h (pas d'équivalent Printemps)
INSERT INTO dojo.schedule_courses (
  id, day, day_index, start_time, end_time, name, description,
  age_group, discipline, type, is_advanced, is_active, tracks_gc,
  sort_order, courses_per_session, counts_for_progression, max_capacity
) VALUES (
  'hiver-lun-18h30-adulte-jj',
  'Lundi', 1, '18:30', '20:00',
  'Adultes Jiu-Jitsu', 'Jiu-Jitsu d''autodéfense',
  'Adultes', 'jiujitsu', 'Adulte',
  false, true, false,
  20, 10, true, 25
) ON CONFLICT (id) DO NOTHING;

-- 2c. Cours #12 : Muay Thai Adultes — Lundi ET Mercredi 19h30-21h
-- Dans schedule_courses, 1 ligne = 1 jour. On crée 2 entrées.
INSERT INTO dojo.schedule_courses (
  id, day, day_index, start_time, end_time, name, description,
  age_group, discipline, type, is_advanced, is_active, tracks_gc,
  sort_order, courses_per_session, counts_for_progression, max_capacity
) VALUES (
  'hiver-lun-19h30-muaythai',
  'Lundi', 1, '19:30', '21:00',
  'Muay Thai adulte', 'Muay Thai',
  'Adultes', 'muaythai', 'Adulte',
  false, true, false,
  21, 10, true, 25
) ON CONFLICT (id) DO NOTHING;

INSERT INTO dojo.schedule_courses (
  id, day, day_index, start_time, end_time, name, description,
  age_group, discipline, type, is_advanced, is_active, tracks_gc,
  sort_order, courses_per_session, counts_for_progression, max_capacity
) VALUES (
  'hiver-mer-19h30-muaythai',
  'Mercredi', 3, '19:30', '21:00',
  'Muay Thai adulte', 'Muay Thai',
  'Adultes', 'muaythai', 'Adulte',
  false, true, false,
  22, 10, true, 25
) ON CONFLICT (id) DO NOTHING;

-- Vérification : on devrait avoir 13 cours hiver (10 copiés + 3 manuels)
SELECT id, day, start_time, end_time, name, discipline
FROM dojo.schedule_courses
WHERE id LIKE 'hiver-%'
ORDER BY day_index, start_time;


-- ============================================================================
-- ÉTAPE 3 : Créer les date_ranges Hiver
-- ============================================================================
-- En gros : on crée 2 plages de dates (JJ + MT) pour la session Hiver,
-- puis on assigne les cours Hiver à ces plages.

-- 3a. Créer les date_ranges
INSERT INTO dojo.schedule_date_ranges (id, session_id, name, start_date, end_date, sort_order)
VALUES
  ('dr-hiver-jiujitsu', 'hiver-2026', 'Jiu-Jitsu Hiver', '2026-01-13', '2026-03-28', 0),
  ('dr-hiver-muaythai', 'hiver-2026', 'Muay Thai Hiver',  '2026-01-13', '2026-03-28', 1)
ON CONFLICT (id) DO NOTHING;

-- 3b. Assigner les cours Hiver JJ à leur date_range
UPDATE dojo.schedule_courses
SET date_range_id = 'dr-hiver-jiujitsu'
WHERE id IN (
  'hiver-dim-16h-superkids',
  'hiver-dim-17h-enfants-deb',
  'hiver-dim-18h-enfants',
  'hiver-dim-19h-avance',
  'hiver-mar-17h45-enfants',
  'hiver-mar-18h45-ado',
  'hiver-mar-19h45-adulte',
  'hiver-jeu-17h45-superkids',
  'hiver-jeu-18h30-avance',
  'hiver-jeu-19h30-adulte',
  'hiver-lun-18h30-adulte-jj'
);

-- 3c. Assigner les cours Hiver MT à leur date_range
UPDATE dojo.schedule_courses
SET date_range_id = 'dr-hiver-muaythai'
WHERE id IN (
  'hiver-lun-19h30-muaythai',
  'hiver-mer-19h30-muaythai'
);

-- Vérification
SELECT sc.id, sc.name, dr.name AS date_range, dr.session_id
FROM dojo.schedule_courses sc
LEFT JOIN dojo.schedule_date_ranges dr ON sc.date_range_id = dr.id
WHERE sc.id LIKE 'hiver-%'
ORDER BY sc.day_index, sc.start_time;


-- ============================================================================
-- ÉTAPE 4 : Mapper student_activities vers schedule_courses
-- ============================================================================
-- En gros : on ajoute une colonne schedule_course_id à student_activities,
-- puis on UPDATE en mappant les noms descriptifs français vers les slugs Hiver.

-- 4a. Ajouter la colonne (idempotent)
ALTER TABLE dojo.student_activities
  ADD COLUMN IF NOT EXISTS schedule_course_id TEXT;

-- 4b. Mapper les 10 cours qui ont un match
-- student_activities.activity_name contient les noms descriptifs DM
-- (ex: "Le dimanche de 16 h à 16 h 45")
-- On mappe vers les cours HIVER (ex: "hiver-dim-16h-superkids")

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-dim-16h-superkids'
WHERE activity_name = 'Le dimanche de 16 h à 16 h 45' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-dim-17h-enfants-deb'
WHERE activity_name = 'Le dimanche de 17 h à 17 h 50' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-dim-18h-enfants'
WHERE activity_name = 'Le dimanche de 18 h à 18 h 55' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-dim-19h-avance'
WHERE activity_name = 'Le dimanche de 19 h à 20 h' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-jeu-17h45-superkids'
WHERE activity_name = 'Le jeudi de 17 h 45 à 18 h 25' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-jeu-18h30-avance'
WHERE activity_name = 'Le jeudi de 18 h 30 à 19 h 25' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-jeu-19h30-adulte'
WHERE activity_name = 'Le jeudi de 19 h 30 à 20 h 30' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-mar-17h45-enfants'
WHERE activity_name = 'Le mardi de 17 h 45 à 18 h 40' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-mar-18h45-ado'
WHERE activity_name = 'Le mardi de 18 h 45 à 19 h 40' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-mar-19h45-adulte'
WHERE activity_name = 'Le mardi de 19 h 45 à 20 h 45' AND schedule_course_id IS NULL;

-- Les 2 cours sans match (lundi JJ + lun/mer MT) :
-- Pas de mapping automatique possible — les élèves de ces groupes
-- ont des activity_name différents. À mapper manuellement si nécessaire.

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-lun-18h30-adulte-jj'
WHERE activity_name = 'Le lundi de 18 h 30 à 20 h' AND schedule_course_id IS NULL;

UPDATE dojo.student_activities SET schedule_course_id = 'hiver-lun-19h30-muaythai'
WHERE activity_name = 'Le lundi et le mercredi de 19 h 30 à 21 h' AND schedule_course_id IS NULL;

-- Vérification
SELECT
  'Mappés' AS statut,
  COUNT(*) AS total
FROM dojo.student_activities
WHERE schedule_course_id IS NOT NULL
UNION ALL
SELECT
  'Non mappés' AS statut,
  COUNT(*) AS total
FROM dojo.student_activities
WHERE schedule_course_id IS NULL;


-- ============================================================================
-- ÉTAPE 5 : Mapper student_groups vers schedule_courses
-- ============================================================================
-- En gros : même chose pour student_groups, mais ici on joint via
-- student_groups.group_id → groups.id → groups.original_name pour trouver
-- le nom descriptif, puis on mappe vers le slug Hiver.

-- 5a. Ajouter la colonne (idempotent)
ALTER TABLE dojo.student_groups
  ADD COLUMN IF NOT EXISTS schedule_course_id TEXT;

-- 5b. Mapper via JOIN sur la table groups
-- groups.original_name contient les noms descriptifs DM

UPDATE dojo.student_groups sg
SET schedule_course_id = CASE g.original_name
  WHEN 'Le dimanche de 16 h à 16 h 45'               THEN 'hiver-dim-16h-superkids'
  WHEN 'Le dimanche de 17 h à 17 h 50'                THEN 'hiver-dim-17h-enfants-deb'
  WHEN 'Le dimanche de 18 h à 18 h 55'                THEN 'hiver-dim-18h-enfants'
  WHEN 'Le dimanche de 19 h à 20 h'                   THEN 'hiver-dim-19h-avance'
  WHEN 'Le jeudi de 17 h 45 à 18 h 25'                THEN 'hiver-jeu-17h45-superkids'
  WHEN 'Le jeudi de 18 h 30 à 19 h 25'                THEN 'hiver-jeu-18h30-avance'
  WHEN 'Le jeudi de 19 h 30 à 20 h 30'                THEN 'hiver-jeu-19h30-adulte'
  WHEN 'Le mardi de 17 h 45 à 18 h 40'                THEN 'hiver-mar-17h45-enfants'
  WHEN 'Le mardi de 18 h 45 à 19 h 40'                THEN 'hiver-mar-18h45-ado'
  WHEN 'Le mardi de 19 h 45 à 20 h 45'                THEN 'hiver-mar-19h45-adulte'
  WHEN 'Le lundi de 18 h 30 à 20 h'                   THEN 'hiver-lun-18h30-adulte-jj'
  WHEN 'Le lundi et le mercredi de 19 h 30 à 21 h'    THEN 'hiver-lun-19h30-muaythai'
  ELSE NULL
END
FROM dojo.groups g
WHERE sg.group_id = g.id
  AND sg.schedule_course_id IS NULL;

-- Vérification
SELECT
  'Mappés' AS statut,
  COUNT(*) AS total
FROM dojo.student_groups
WHERE schedule_course_id IS NOT NULL
UNION ALL
SELECT
  'Non mappés' AS statut,
  COUNT(*) AS total
FROM dojo.student_groups
WHERE schedule_course_id IS NULL;


-- ============================================================================
-- ÉTAPE 6 : Vérifications finales
-- ============================================================================

-- 6a. Résumé des cours Hiver créés
SELECT 'Cours Hiver créés' AS check_name, COUNT(*) AS total
FROM dojo.schedule_courses
WHERE id LIKE 'hiver-%';

-- 6b. Date ranges Hiver
SELECT 'Date ranges Hiver' AS check_name, COUNT(*) AS total
FROM dojo.schedule_date_ranges
WHERE session_id = 'hiver-2026';

-- 6c. student_activities — détail par cours
SELECT
  sa.schedule_course_id,
  COUNT(*) AS nb_eleves
FROM dojo.student_activities sa
WHERE sa.schedule_course_id IS NOT NULL
GROUP BY sa.schedule_course_id
ORDER BY sa.schedule_course_id;

-- 6d. student_activities non mappés — montrer les activity_name orphelins
SELECT
  sa.activity_name,
  COUNT(*) AS nb
FROM dojo.student_activities sa
WHERE sa.schedule_course_id IS NULL
GROUP BY sa.activity_name
ORDER BY nb DESC;

-- 6e. student_groups — détail par cours
SELECT
  sg.schedule_course_id,
  COUNT(*) AS nb_eleves
FROM dojo.student_groups sg
WHERE sg.schedule_course_id IS NOT NULL
GROUP BY sg.schedule_course_id
ORDER BY sg.schedule_course_id;

-- 6f. student_groups non mappés
SELECT
  g.original_name,
  COUNT(*) AS nb
FROM dojo.student_groups sg
JOIN dojo.groups g ON sg.group_id = g.id
WHERE sg.schedule_course_id IS NULL
GROUP BY g.original_name
ORDER BY nb DESC;

-- 6g. Session Hiver
SELECT * FROM dojo.schedule_sessions WHERE id = 'hiver-2026';

-- ============================================================================
-- FIN — Zéro suppression. Tout est additif.
-- ============================================================================
