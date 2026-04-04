# Phase 4.4b - Fix eleves = 0 quand navigation entre sessions

## Date: 2026-03-31

## Probleme
Quand le frontend envoie `group=hiver-dim-16h-superkids` (un schedule_course_id), le backend cherchait seulement dans `activity_name` (ancienne colonne). Resultat: 0 eleves retournes pour les cours Hiver.

## Solution: DUAL-LOOKUP partout

### Helper cree
- `dualLookupStudentIds(table, groupName)` — cherche dans `schedule_course_id` d'abord, fallback `activity_name`

### Endpoints corriges

#### 1. GET /api/students?group=X
- **Avant**: `student_activities.eq('activity_name', group)` 
- **Apres**: `dualLookupStudentIds('student_activities', group)` (schedule_course_id first, fallback activity_name)

#### 2. GET /api/attendance/matrix?group=X
- **Student lookup**: Remplace `students.eq('activity', group)` par `dualLookupStudentIds('student_activities', group)`
- **Activity student IDs**: Idem, dual-lookup au lieu de `eq('activity_name', group)`
- **Attendance discipline filter**: Utilise `schedule_course_id || activity_name` comme cle

#### 3. POST /api/attendance (toggle)
- **Existing check**: Utilise `.or(schedule_course_id.eq.X, activity_name.eq.X)` au lieu de `.eq('activity_name', group)`
- **Insert**: Ecrit dans `schedule_course_id` ET `activity_name` simultanement

#### 4. Badge/Stats calculations (GET /api/students enrichment loop)
- Fetch `schedule_course_id` en plus de `activity_name` pour attendance et student_activities
- Utilise `schedule_course_id || activity_name` comme cle pour les lookups dans groupTypeMap, groupCoursesMap, etc.

#### 5. GET /api/students/with-promotion-stats
- Meme pattern: fetch `schedule_course_id`, prefer comme cle pour discipline map et groups map

## Fichier modifie
- `D:\DIGITAL_GARDEN\01_DOJO\DOJO_MANAGER\backend\server.js`

## Backward compatibility
- Tous les anciens cours sans `schedule_course_id` continuent de fonctionner via le fallback `activity_name`
- Les nouveaux cours Hiver (213 mappings dans student_activities) sont trouves via `schedule_course_id`
- Rien n'est casse
