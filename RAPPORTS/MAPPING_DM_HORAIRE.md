# Mapping Dojo Manager → Site Horaire

*Généré le 2026-03-31 — Diagnostic seulement, aucun code modifié.*

---

## Tables DM actuelles (à remplacer)

### groups

**Colonnes utilisées dans le code :**
- `id` — clé primaire (integer)
- `original_name` — identifiant textuel du groupe (ex: "mar-17h45-enfants"), clé fonctionnelle principale dans tout le code
- `display_name` — nom affiché à l'UI
- `name` — alias de display_name (legacy, parfois utilisé en parallèle)
- `type` — discipline ("jiujitsu", "muaythai", etc.)
- `schedule_days` — JSON array d'entiers [1, 3] = jours de semaine (0=dim, 1=lun…)
- `courses_per_session` — nb de cours que ce groupe tient par session
- `counts_for_progression` — boolean, compte dans le calcul de ceinture
- `max_capacity` — capacité max d'élèves
- `display_order` — ordre d'affichage
- `is_hidden` — boolean visibilité dans l'UI
- `min_age`, `max_age`, `min_rank_id` — critères d'inscription (peu utilisés en runtime)

**Endpoints qui touchent `groups` (server.js) :**
- `GET /api/groups` — liste tous les groupes
- `POST /api/groups` — crée un groupe
- `POST /api/groups/update` — màj display_name, schedule_days, max_capacity, courses_per_session, counts_for_progression, type
- `POST /api/groups/toggle-visibility` — toggle is_hidden
- Utilisé aussi dans : `/api/students`, `/api/stats`, `/api/attendance/matrix`, `/api/stats/dashboard`, `/api/repair/rebuild-activities`, `/api/repair/groups-names`

**Composants frontend qui consomment `groups` :**
- `App.tsx` — fetch `/api/groups?all=true`, état global
- `AdminPanel.tsx` — groupe par jour (schedule_days), sélecteur de groupe
- `GroupSelector.tsx` — liste cliquable, toggle visibilité, renommage
- `GroupSettingsModal.tsx` — édition complète (display_name, schedule_days, capacity, courses_per_session, counts_for_progression)
- `BadgesTab.tsx` — filtre par groupe visible
- `StatsDashboard.tsx` — occupation (id, display_name, original_name, max_capacity, current_count)
- `StudentCreateModal.tsx`, `StudentModal.tsx`, `QuickEditModal.tsx`, `AttendanceMatrix.tsx` — fetch local de `/api/groups`
- `CsvImportWizard/StepMapping.tsx` — mapping d'import CSV → groupes existants

**FK entrantes (tables qui pointent vers `groups`) :**
- `student_groups` → `group_id` (integer FK vers `groups.id`)
  - pivot entre `students` et `groups`
  - utilisée pour reconstruire `student_activities` au startup (`/api/repair/rebuild-activities`)

---

### sessions_config

**Colonnes utilisées dans le code :**
- `id` — clé primaire
- `name` — nom de la session
- `start_date`, `end_date` — bornes de la session
- `holidays` — JSON array de dates ('["2026-03-29", ...]')
- `is_active` — boolean session courante (une seule active à la fois)
- `courses_per_session` — nb total de cours par session (fallback pour badge)

**Endpoints qui touchent `sessions_config` :**
- `GET /api/session/config` — session active (crée un default si vide)
- `POST /api/session/config` — màj start_date, end_date, holidays, name
- `POST /api/session/new` — archive l'active, crée une nouvelle
- `GET /api/session/archives` — liste les sessions is_active=false
- `POST /api/session/reactivate` — bascule une session archivée en active
- Utilisée aussi dans : `/api/students` (calculs badges/présences), `/api/attendance/matrix`, `/api/badge-given`

**FK entrantes :**
- `badge_given` → `session_id` (FK vers `sessions_config.id`)

---

## Tables Site Horaire (destination)

### schedule_sessions

**Colonnes :**
- `id` — TEXT primary key (ex: "printemps-2026")
- `name` — nom de la session
- `start_date`, `end_date` — bornes de session (DATE)
- `is_current` — boolean session courante (≡ is_active dans sessions_config)
- `is_archived` — boolean (colonne ajoutée via migration)

**Correspondance avec sessions_config :**

| sessions_config | schedule_sessions | Statut |
|---|---|---|
| `id` (integer) | `id` (TEXT) | **INCOMPATIBLE** — integer vs TEXT |
| `name` | `name` | ✅ direct |
| `start_date` | `start_date` | ✅ direct |
| `end_date` | `end_date` | ✅ direct |
| `is_active` | `is_current` | ✅ renamed — déjà mappé dans le code DM |
| `holidays` (JSON dans la table) | table séparée `schedule_holidays` | **STRUCTURE DIFFÉRENTE** |
| `courses_per_session` | absent | **MANQUANT** |

**Note critique :** `badge_given.session_id` pointe vers `sessions_config.id` (integer). Si on migre vers `schedule_sessions`, il faudra changer ce FK (TEXT id) ou maintenir la table `sessions_config` juste pour ce lien.

---

### schedule_courses

**Colonnes :**
- `id` — TEXT primary key (ex: "mar-17h45-enfants")
- `id_uuid` — UUID (ajouté par migration Phase 1 DM)
- `day` — TEXT nom du jour ("Mardi")
- `day_index` — integer 0-6
- `start_time`, `end_time` — TIME
- `name` — nom affiché du cours
- `description`, `age_group` — texte info
- `discipline` — "jiujitsu" | "muaythai"
- `type` — "Enfants" | "Ado" | "Adulte"
- `is_advanced` — boolean
- `is_active` — boolean
- `tracks_gc` — boolean (track Gracie Combatives)
- `sort_order` — integer
- `date_range_id` — FK vers `schedule_date_ranges.id`

**Correspondance avec groups :**

| groups | schedule_courses | Statut |
|---|---|---|
| `original_name` | `id` (TEXT) | ✅ **identiques en pratique** — c'est le même slug (ex: "mar-17h45-enfants") |
| `display_name` | `name` | ✅ direct |
| `type` | `discipline` + `type` | ⚠️ DM utilise `type` pour la discipline, schedule_courses a les deux |
| `schedule_days` (array jours) | `day_index` (integer) | ⚠️ DM stocke array multi-jours, schedule_courses est 1 ligne = 1 jour |
| `courses_per_session` | absent | **MANQUANT** |
| `counts_for_progression` | absent | **MANQUANT** |
| `max_capacity` | absent | **MANQUANT** |
| `display_order` | `sort_order` | ✅ équivalent |
| `is_hidden` | `is_active` (inverse) | ✅ sémantique inverse mais équivalent |
| `min_age`, `max_age`, `min_rank_id` | absent | manquant (peu critique) |

**Colonnes manquantes dans schedule_courses (à ajouter si migration) :**
- `courses_per_session` INTEGER — nb de cours que ce groupe fait par session
- `counts_for_progression` BOOLEAN — compte pour le calcul de grade
- `max_capacity` INTEGER — capacité max d'élèves

---

### schedule_date_ranges

**Colonnes :**
- `id` — TEXT primary key
- `session_id` — FK vers `schedule_sessions.id`
- `name` — nom de la plage (ex: "Avant relâche")
- `start_date`, `end_date` — DATE
- `sort_order` — SMALLINT

**Pas de correspondance directe dans sessions_config.** Les date ranges sont une fonctionnalité du Site Horaire qui n'existe pas dans DM.

---

## Dépendances critiques (NE PAS CASSER)

### attendance → lié via `activity_name` (TEXT) + `course_id_uuid` (UUID optionnel)

```
attendance.activity_name = groups.original_name = schedule_courses.id
attendance.course_id_uuid → schedule_courses.id_uuid  (Phase 3 migration, peut être NULL)
```

- Le lien `activity_name` est un TEXT (slug), pas une FK stricte.
- C'est le lien le plus fragile : si `groups.original_name` change, les présences historiques gardent l'ancien nom.
- `course_id_uuid` est une FK UUID vers `schedule_courses` (ajoutée par la migration Phase 3 DM). C'est le lien propre, mais pas encore systématiquement rempli.
- **Verdict :** `attendance` est déjà partiellement liée à `schedule_courses`. La migration ne casse rien ici si on garde les mêmes slugs d'ID.

### students → lié via `student_activities.activity_name` + `student_groups.group_id`

```
student_activities.activity_name = groups.original_name  (TEXT, loose FK)
student_groups.student_id → students.id
student_groups.group_id → groups.id  (integer FK stricte)
```

- Double système : `student_activities` (TEXT, loose) + `student_groups` (integer FK stricte)
- `student_activities.activity_name` = slug du groupe = `schedule_courses.id` → **déjà compatible**
- `student_groups.group_id` → integer FK vers `groups.id` → **CASSE si on supprime groups**
- **Verdict :** La table `groups` ne peut pas être supprimée tant que `student_groups` existe avec une FK integer. Soit on migre `student_groups.group_id` vers un TEXT slug, soit on garde `groups` comme table de liaison vide.

### badge_given → lié via `session_id` (FK vers sessions_config.id, integer)

```
badge_given.student_id → students.id
badge_given.session_id → sessions_config.id  (INTEGER FK)
```

- Lien direct sur `sessions_config` (integer PK).
- `schedule_sessions.id` est TEXT → **incompatible directement**.
- **Verdict :** Si on migre sessions vers `schedule_sessions`, il faut soit : (a) ajouter une colonne `schedule_session_id TEXT` à `badge_given`, soit (b) garder `sessions_config` uniquement pour cette FK, soit (c) migrer les IDs.

### student_extras → lié via `student_id` uniquement

```
student_extras.student_id → students.id
```

- Pas de lien vers groups ni sessions. **Aucun risque.**

### stripe_history → lié via `student_id` + `grade_id`

```
stripe_history.student_id → students.id
stripe_history.grade_id → grades.id
stripe_history.grade_name — TEXT denormalisé
stripe_history.earned_at — DATE
```

- Aucun lien vers groups ni sessions. **Aucun risque.**

---

## Plan de migration suggéré

### Étape 1 — Ajouter les colonnes manquantes à schedule_courses

```sql
ALTER TABLE dojo.schedule_courses
  ADD COLUMN IF NOT EXISTS courses_per_session INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS counts_for_progression BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 25;
```

Copier les valeurs depuis `groups` en faisant le join sur `groups.original_name = schedule_courses.id`.

### Étape 2 — Migrer badge_given vers schedule_sessions

Option A (recommandée, non destructive) :
```sql
ALTER TABLE dojo.badge_given
  ADD COLUMN IF NOT EXISTS schedule_session_id TEXT REFERENCES dojo.schedule_sessions(id);
```
Backfiller en croisant les dates (schedule_sessions.start_date ≈ sessions_config.start_date).
Garder `session_id` (integer) intact pour l'historique.

### Étape 3 — Migrer student_groups vers TEXT slug

```sql
ALTER TABLE dojo.student_groups
  ADD COLUMN IF NOT EXISTS course_id TEXT REFERENCES dojo.schedule_courses(id);
```
Backfiller via `student_groups.group_id → groups.id → groups.original_name = schedule_courses.id`.
Ensuite DM peut lire `student_groups.course_id` au lieu de `group_id`.

### Étape 4 — Rewirer les endpoints DM

Ordre de priorité (impact croissant) :

1. **`/api/session/config`** → lire depuis `schedule_sessions` (is_current), gérer holidays via `schedule_holidays`
2. **`/api/groups`** → lire depuis `schedule_courses` (is_active=true), mapper les colonnes
3. **`/api/groups/update`** → écrire dans `schedule_courses` + colonnes ajoutées à l'étape 1
4. **`/api/badge-given`** → utiliser `schedule_session_id` (étape 2)
5. **`/api/students/:id/groups`** → utiliser `student_groups.course_id` (étape 3)

### Ce qu'on NE touche PAS

- Table `attendance` — déjà liée à `schedule_courses` via `course_id_uuid` + `activity_name`
- Table `student_extras` — aucune dépendance externe
- Table `stripe_history` — aucune dépendance externe
- Table `student_activities` — les slugs sont déjà identiques à `schedule_courses.id`

### Risque principal

Le slug `groups.original_name` = `schedule_courses.id` semble être la même chose en pratique (ex: "mar-17h45-enfants"), mais il faut **vérifier qu'il n'y a aucune divergence** avant de couper le pont. Un simple SELECT de comparaison suffit :

```sql
SELECT g.original_name, sc.id
FROM dojo.groups g
FULL OUTER JOIN dojo.schedule_courses sc ON g.original_name = sc.id
WHERE g.original_name IS NULL OR sc.id IS NULL;
```

Si ça retourne des lignes, il faut réconcilier avant de migrer.
