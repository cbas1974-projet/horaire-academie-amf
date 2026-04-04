# Phase 4.3 — Rewire Dojo Manager: groups -> schedule_courses

**Date**: 2026-03-31
**Statut**: COMPLETE
**Principe**: ZERO perte de donnees. Table `groups` intacte.

---

## Strategie

Approche **dual-source**: `schedule_courses` est la source primaire, `groups` est le fallback.
- Les endpoints de lecture (`GET /api/groups`) lisent `schedule_courses` pour la session active
- Les endpoints d'ecriture essaient `schedule_courses` d'abord, puis `groups` en fallback
- Les lookups internes (type, discipline, courses_per_session) utilisent `buildDualGroupMaps()` qui merge les deux sources
- `student_activities.activity_name` n'est PAS modifie (Phase 4.4)

---

## Changements Backend (server.js)

### Nouvelles fonctions helper

| Fonction | Role |
|---|---|
| `mapDisciplineToLegacyType(course)` | Convertit `schedule_courses.discipline` vers le format legacy (`'Muay Thai'`, `'Adultes'`, etc.) |
| `buildCourseDisplayName(course)` | Genere "Mardi 17h45 -- Enfants debutant" depuis les champs structures |
| `getScheduleCoursesForActiveSession(includeInactive)` | Charge les cours `schedule_courses` lies a la session active (via `schedule_date_ranges`) |
| `buildDualGroupMaps()` | Construit 4 Maps (type, courses_per_session, counts_for_progression, schedule_days) depuis schedule_courses + fallback groups |
| `DAYS_FR` | Constante `['Dimanche', 'Lundi', ...]` pour le mapping day_index -> nom |

### Endpoints modifies

| Endpoint | Avant | Apres |
|---|---|---|
| `GET /api/groups` | `db.from('groups').select('*')` | `getScheduleCoursesForActiveSession()` + mapping vers format legacy |
| `POST /api/groups` | Insert dans `groups` | Insert dans `schedule_courses` (avec fallback check sur `groups`) |
| `POST /api/groups/update` | Update `groups` | Try `schedule_courses` first, fallback `groups` |
| `POST /api/groups/toggle-visibility` | Update `groups.is_hidden` | Try `schedule_courses.is_active` (inverse), fallback `groups` |
| `GET /api/attendance/matrix` | `groups.select('schedule_days, type')` | Try `schedule_courses` first, fallback `groups` |
| `GET /api/students` (big endpoint) | `groups.select(...)` pour groupTypeMap etc. | `buildDualGroupMaps()` |
| `GET /api/students/with-promotion-stats` | `groups.select(...)` pour discipline | `buildDualGroupMaps()` |
| `GET /api/stats/overview` | `groups.select(...)` pour occupation | `getScheduleCoursesForActiveSession()` + legacy fallback |
| `GET /api/stats/details` | `groups.select('original_name').eq('id', value)` | Try `schedule_courses` first, fallback `groups` |
| `POST /api/students/transfer` | `groups.select('name, original_name')` | Try `schedule_courses` first, fallback `groups` |
| `POST /api/repair/student-activities` | `groups.select('id, name, original_name')` | Try `schedule_courses` first, fallback `groups` |
| Import endpoint | `groups.select('name, original_name')` | Try `schedule_courses` first, fallback `groups` |
| Badge week enumeration | Loop sur `allGroups` | Loop sur `groupScheduleDaysMap` (dual) |
| `syncGroupsFromStudents()` | Upsert dans `groups` | DESACTIVE (log only) |

### Format de reponse GET /api/groups

Chaque cours retourne:
```json
{
  "id": "mar-17h45-enfants",
  "original_name": "mar-17h45-enfants",
  "display_name": "Mardi 17h45 -- Enfants debutant",
  "name": "Enfants debutant",
  "is_hidden": false,
  "schedule_days": [2],
  "max_capacity": 25,
  "courses_per_session": 10,
  "counts_for_progression": true,
  "type": "Enfants",
  "display_order": 0,
  "day": "Mardi",
  "day_index": 2,
  "start_time": "17:45",
  "end_time": "18:40",
  "discipline": "jiujitsu",
  "age_group": "6-12"
}
```

---

## Changements Frontend

### types.ts
- `Group.id` accepte `number | string` (slug)
- Nouveaux champs optionnels: `day`, `day_index`, `start_time`, `end_time`, `discipline`, `age_group`, `schedule_days`, `max_capacity`, `courses_per_session`, `counts_for_progression`, `type`, `display_order`

### GroupSelector.tsx
- `getGroupSortData()`: utilise `day_index` et `start_time` structures quand disponibles (fallback parsing nom)
- `availableDays`: utilise `g.day` structure quand disponible
- `filteredGroups`: compare `g.day` structure quand disponible
- Affichage cours: "17h45 -- Enfants debutant" quand champs structures disponibles

### GroupSettingsModal.tsx
- Interface `Group` enrichie avec champs structures

### AdminPanel.tsx
- `getGroupSortData()`: utilise `day_index` et `start_time` structures
- `courseDays`: utilise `g.day` structure pour le groupement par jour

---

## Ce qui n'est PAS modifie (preserv)

- Table `groups` intacte (aucun DELETE, aucun ALTER)
- Table `student_activities` intacte (mapping Phase 4.4)
- Table `student_groups` intacte (mapping Phase 4.4)
- Donnees de `students.activity` intactes
- Attendance records intacts

---

## Dependances Phase 4.4

Pour que les eleves existants apparaissent correctement dans les selecteurs de cours:
1. Migrer `student_activities.activity_name` des anciens noms vers les slugs `schedule_courses.id`
2. Migrer `student_groups.group_id` vers les IDs `schedule_courses`
3. Migrer `students.activity` vers les nouveaux noms
4. Migrer `attendance.activity_name` vers les nouveaux slugs

---

## Fichiers modifies

- `D:\DIGITAL_GARDEN\01_DOJO\DOJO_MANAGER\backend\server.js`
- `D:\DIGITAL_GARDEN\01_DOJO\DOJO_MANAGER\frontend\src\types.ts`
- `D:\DIGITAL_GARDEN\01_DOJO\DOJO_MANAGER\frontend\src\GroupSelector.tsx`
- `D:\DIGITAL_GARDEN\01_DOJO\DOJO_MANAGER\frontend\src\GroupSettingsModal.tsx`
- `D:\DIGITAL_GARDEN\01_DOJO\DOJO_MANAGER\frontend\src\AdminPanel.tsx`
