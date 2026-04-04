# QA Baseline PRÉ Phase 4.2

**Date** : 2026-03-31  
**Objectif** : État du code avant migration des endpoints `sessions_config` → `schedule_sessions`  
**Fichier analysé** : `D:/DIGITAL_GARDEN/01_DOJO/DOJO_MANAGER/backend/server.js`

---

## Endpoints sessions_config (server.js)

| Route | Méthode | Lignes | Fait quoi |
|---|---|---|---|
| `/api/students` (interne) | GET | 651-656 | Lit `sessions_config` (id, start_date, end_date, holidays, courses_per_session) où is_active=true pour calcul badges |
| `/api/students` (interne) | GET | 761 | Lit TOUTES les sessions `sessions_config` pour agréger les holidays cross-session (streak) — **NOTE: commentaire dit "PHASE 4.2: déjà migré vers schedule_holidays"** |
| `/api/attendance/matrix` | GET | 2064-2068 | Lit `sessions_config.*` is_active=true pour start_date, end_date, holidays de la matrice |
| `/api/session/config` | GET | 2377-2397 | Lit session active. Si aucune → crée un défaut dans sessions_config |
| `/api/session/config` | POST | 2399-2431 | Update ou Insert dans sessions_config (start_date, end_date, holidays, name) |
| `/api/session/new` | POST | 2434-2456 | Désactive la session active (is_active=false), crée nouvelle session vide dans sessions_config |
| `/api/session/archives` | GET | 2459-2466 | Liste toutes les sessions sessions_config où is_active=false |
| `/api/session/reactivate` | POST | 2469-2489 | Désactive la courante, réactive une session archivée par id dans sessions_config |
| `/api/badge-given/:studentId` | POST | 3588-3608 | Lit sessions_config (id) is_active=true pour obtenir session_id du badge à toggler |
| `/api/badge-given` | GET | 3611-3616 | Lit sessions_config (id) is_active=true pour filtrer badge_given par session active |

**Total : 10 références directes à sessions_config**

### Note importante (ligne 686-690)
Le bloc `activeSession` dans `/api/students` a DÉJÀ été partiellement migré :
- `getActiveSession()` → lit `schedule_sessions` (is_current=true)
- `getHolidayDatesForSession(id)` → lit `schedule_holidays`
- La ligne 761 est annotée "PHASE 4.2 déjà fait" mais le code utilise encore `getAllHolidayDates()` et non plus `sessions_config`

---

## Endpoints schedule_sessions (déjà actifs)

Ces routes lisent `schedule_sessions` (table du Site Horaire) et sont déjà en place :

| Route | Méthode | Lignes | Fait quoi |
|---|---|---|---|
| `/api/schedule/sessions` | GET | 2495-2513 | Liste toutes les sessions. Map `is_current` → `is_active` pour compat frontend |
| `/api/schedule/active-session` | GET | 2515-2532 | Retourne la session is_current=true. Map is_current → is_active |
| `/api/schedule/set-active/:sessionId` | POST | 2534-2564 | Désactive toutes, active la demandée dans schedule_sessions (is_current) |
| `/api/schedule/sessions/:sessionId/date-ranges` | GET | 2539 | Liste les plages de dates d'une session |
| `/api/schedule/sessions/:sessionId/date-ranges` | POST | 2551 | Crée une plage de dates |
| `/api/schedule/date-ranges/:id` | PUT | 2572 | Update une plage |
| `/api/schedule/date-ranges/:id` | DELETE | 2598 | Supprime une plage |
| `/api/schedule/sessions/:sessionId/courses` | GET | 2614 | Liste les cours d'une session |
| `/api/schedule/courses` | POST | 2634 | Crée un cours |
| `/api/schedule/courses/:id` | PUT | 2651 | Update un cours |
| `/api/schedule/courses/:courseId` | DELETE | 2665 | Supprime un cours |
| `/api/schedule/sessions/:sessionId/duplicate-ranges` | POST | 2673 | Duplique les plages d'une autre session |
| `/api/schedule/sessions/:sessionId/holidays` | GET | 2711 | Liste les congés |
| `/api/schedule/sessions/:sessionId/holidays` | POST | 2723 | Crée un congé |
| `/api/schedule/holidays/:id` | PUT | 2746 | Update un congé |
| `/api/schedule/holidays/:id` | DELETE | 2760 | Supprime un congé |
| `/api/schedule/sessions/:sessionId/events` | GET | 2772 | Liste les événements |
| `/api/schedule/sessions/:sessionId/events` | POST | 2784 | Crée un événement |
| `/api/schedule/events/:id` | PUT | 2806 | Update un événement |
| `/api/schedule/events/:id` | DELETE | 2820 | Supprime un événement |

---

## Frontend references

| Fichier | Lignes | Référence |
|---|---|---|
| `SessionConfigModal.tsx` | 114 | `GET /api/schedule/sessions` — fetch liste sessions |
| `SessionConfigModal.tsx` | 119 | `s.is_active` — détecte session active dans la liste |
| `SessionConfigModal.tsx` | 138-141 | Fetch date-ranges, courses, holidays, events par session_id |
| `SessionConfigModal.tsx` | 155-165 | `POST /api/schedule/set-active/:sessionId` — activation session |
| `SessionConfigModal.tsx` | 15, 39 | Type `Session` avec champ `is_active: boolean` |
| `SessionConfigModal.tsx` | 20, 45, 53 | Type avec `session_id: string` |
| `SessionConfigModal.tsx` | 421 | Filtre cours actifs par `c.is_active !== false` |
| `App.tsx` | 54 | `GET /api/schedule/active-session` — fetch session active au démarrage |
| `App.tsx` | 121-140 | Logique de date courante basée sur la session active |
| `AdminPanel.tsx` | 349-384 | Filtre élèves par `s.is_active` (students, pas sessions) |
| `AdminPanel.tsx` | 1142-1145 | Affiche badge "inactif" si `student.is_active === false` |
| `AttendanceMatrix.tsx` | 662-663 | `student.session_total_courses` pour afficher le ratio |
| `types.ts` | 35 | `Student.is_active?: boolean \| number` |
| `types.ts` | 41-44 | `extra_sessions`, `required_sessions`, `custom_session_count_override`, `session_total_courses` |
| `StudentModal.tsx` | 175, 181, 208 | `custom_session_count_override` — objectif cours/session par élève |
| `GradeEditorModal.tsx` | 13, 69, 246-249 | `required_sessions` dans grade config |
| `GroupSettingsModal.tsx` | 12, 75, 109, 193, 231 | `courses_per_session` dans la config groupe |
| `services/supabaseService.ts` | 61, 78, 101, 114, 125 | `is_active` pour students (toggle actif/inactif) |
| `utils/promotionRules.ts` | 65, 71, 154 | `required_sessions` pour règles de promotion |
| `utils/studentHelpers.ts` | 74 | `required_lessons ?? required_sessions` — fallback naming |

---

## Structure schedule_sessions (destination)

Colonnes inférées des fichiers SQL et du seed :

| Colonne | Type | Notes |
|---|---|---|
| `id` | TEXT (PK) | Slug ex: `printemps-2026` |
| `name` | TEXT | Nom affiché ex: "Printemps 2026" |
| `start_date` | DATE | Début de la session |
| `end_date` | DATE | Fin de la session |
| `is_current` | BOOLEAN | Remplace `is_active` de sessions_config |
| `is_archived` | BOOLEAN DEFAULT FALSE | Ajouté par migrate-sessions-admin.sql |
| `created_at` | TIMESTAMPTZ | (implicite Supabase) |

**Tables liées (schedule_*) :**

| Table | Colonnes clés | Lien |
|---|---|---|
| `schedule_date_ranges` | id, session_id, name, start_date, end_date, sort_order | FK → schedule_sessions.id |
| `schedule_courses` | id, day, day_index, start/end_time, name, discipline, type, is_active, tracks_gc, courses_per_session, counts_for_progression, max_capacity, date_range_id | FK → session via date_range_id |
| `schedule_holidays` | (implicite) id, session_id, date, end_date, label | FK → schedule_sessions.id |
| `schedule_events` | (implicite) id, session_id, date, end_date, title/label | FK → schedule_sessions.id |

---

## Différences clés sessions_config vs schedule_sessions

| Aspect | sessions_config | schedule_sessions |
|---|---|---|
| **Table** | `dojo.sessions_config` | `dojo.schedule_sessions` |
| **Champ "active"** | `is_active: boolean` | `is_current: boolean` |
| **Holidays** | Colonne JSONB `holidays` (array de dates strings) dans la même table | Table séparée `schedule_holidays` avec FK session_id |
| **Cours** | Pas de lien direct (via `groups.schedule_days`) | Table `schedule_courses` avec FK via `date_range_id` |
| **Plages de dates** | Inexistant | Table `schedule_date_ranges` (sous-divisions de session) |
| **ID** | UUID auto-généré | Slug texte ex: `printemps-2026` |
| **courses_per_session** | Colonne dans sessions_config | Dans `schedule_courses` (par cours) et `groups` (par groupe) |
| **Archivage** | `is_active = false` | `is_archived = true` + `is_current = false` |
| **Propriétaire** | Dojo Manager (CRUD complet) | Site Horaire Académie (source de vérité), DM en lecture |
| **Mapping frontend** | Natif (`is_active`) | Adapté côté server (`is_current` → `is_active` dans la réponse) |

---

## Points de risque

1. **Double source de vérité active** : `sessions_config.is_active` ET `schedule_sessions.is_current` coexistent. Les endpoints `/api/session/*` (legacy) écrivent encore dans sessions_config. Les endpoints `/api/schedule/*` écrivent dans schedule_sessions. Un admin qui utilise l'ancien UI peut avoir une session "active" différente des deux côtés.

2. **badge_given.session_id** : Les endpoints `/api/badge-given` utilisent encore l'ID de sessions_config comme `session_id` étranger. Si on bascule, tous les badges existants pointent vers des IDs morts (UUID → slug).

3. **attendance/matrix (ligne 2064)** : Lit encore `sessions_config` pour start_date, end_date, holidays. Après migration, la matrice affichera une session vide ou la mauvaise plage si sessions_config n'est plus maintenu.

4. **holidays cross-session (ligne 761)** : Commenté comme "déjà migré" mais la logique de fallback dans `allHolidaysSet` pourrait produire un Set vide si `getAllHolidayDates()` échoue et que l'ancienne branche `sessions_config` est retirée.

5. **sessions_config.courses_per_session** : Utilisé dans le calcul de `session_total_courses` pour les étudiants. La structure schedule_sessions stocke cette valeur PAR COURS dans schedule_courses, pas par session globale. Le mapping n'est pas 1-pour-1.

6. **Nommage conflictuel frontend** : `SessionConfigModal.tsx` gère DÉJÀ les routes `/api/schedule/*` (schedule_sessions). Mais d'autres composants (GroupSettingsModal, StudentModal) référencent `courses_per_session` qui vient du groupe (pas de la session). Risque de confusion si les deux implémentations divergent.

7. **Migration données manquante** : Aucun script SQL trouvé qui migre les données de `sessions_config` → `schedule_sessions`. Si les deux tables sont en prod avec des données différentes, la bascule va créer un gouffre de données.
