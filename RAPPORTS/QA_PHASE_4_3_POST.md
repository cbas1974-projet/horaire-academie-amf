# QA POST Phase 4.3 — Rewire DM Courses (groups -> schedule_courses)

**Date** : 2026-03-31
**Statut global** : **BLOQUE — Phase 4.3 non executee**
**Fichier analyse** : `D:/DIGITAL_GARDEN/01_DOJO/DOJO_MANAGER/backend/server.js` (3651 lignes)
**Rapport de phase** : ABSENT (`PHASE_4_3_REWIRE_COURSES.md` n'existe pas)

---

## Contexte

Le rapport de spec `PHASE_4_3_REWIRE_COURSES.md` n'existe pas dans les RAPPORTS.
Le `context.md` du projet confirme que seules les Phases 1-3 (migration sessions_config → schedule_sessions) ont ete completees.
Aucune reference "PHASE 4.3" ne figure dans `server.js`.

**Ce rapport est donc un QA de l'etat ACTUEL (pre-Phase 4.3) — une baseline.**
Toutes les violations documentees ci-dessous sont des CIBLES pour la Phase 4.3, pas des regressions.

---

## Checklist CRITIQUE

### 1. ZERO reference active a la table `groups`

**FAIL — 19 appels actifs a `db.from('groups')`**

| Ligne | Contexte | Nature |
|---|---|---|
| 173 | `GET /api/groups` | CRUD principal groups |
| 201, 210, 238, 257 | POST/update/toggle groups | CRUD |
| 386 | `GET /api/groups/suggest` — badge calc fallback | Fonctionnel |
| 634 | `GET /api/students` — badge calc (courses_per_session, counts_for_progression, schedule_days) | **Critique** |
| 1190 | `GET /api/students` (matrix context) — discipline map | Fonctionnel |
| 1689 | Move student to group (get name) | Fonctionnel |
| 2108 | `GET /api/attendance/matrix` — schedule_days pour le groupe | **Critique** |
| 2207 | `GET /api/attendance/matrix` — courses_per_session, counts_for_progression | **Critique** |
| 2902 | `GET /api/stats/dashboard` — occupation par groupe | Fonctionnel |
| 3011 | `GET /api/stats/details` — resolve group ID to name | Fonctionnel |
| 3266 | Import CSV — get group name for student_activities | Fonctionnel |
| 3310 | `REPAIR: student-activities` — rebuild from student_groups | Utilitaire |
| 3353, 3373 | `REPAIR: groups-names` | Utilitaire |
| 3558 | Startup sync | Startup |
| 3631 | Cleanup test groups | Utilitaire |

**Les 3 appels critiques a migrer vers `schedule_courses` :**
- L634 : badge calc (schedule_days, courses_per_session, counts_for_progression)
- L2108 : attendance matrix (schedule_days)
- L2207 : attendance matrix (courses_per_session, counts_for_progression)

Les appels CRUD groups (L173-257) restent legitimes — `groups` reste la source de verite pour l'admin.
Les appels utilitaires (REPAIR, startup) sont hors scope Phase 4.3.

---

### 2. Aucune donnee supprimee

**PASS — aucune suppression en cours**

Les tables `groups`, `student_groups`, `student_activities` sont toutes intactes.
Aucun DROP, DELETE ou truncate non-utilitaire detecte sur ces tables dans le code actuel.
Les seules suppressions visibles sont dans des endpoints REPAIR/cleanup (utilitaires explicites, non declenches automatiquement).

---

### 3. Cours affiches avec jour + heure + nom

**NON APPLICABLE (pre-Phase 4.3)**

L'endpoint `GET /api/schedule/sessions/:sessionId/courses` (L2665) retourne les champs :
`id, date_range_id, day, day_index, start_time, end_time, name, description, age_group, discipline, type, sort_order, is_active`

**Le format inclut jour + heure + nom.** Conforme a la spec.

Le probleme : le reste du backend (badge calc, attendance matrix) n'utilise PAS encore cet endpoint — il utilise encore `groups.schedule_days`. C'est le coeur du rewire a faire.

---

### 4. Filtre par session active

**PASS partiel**

- `getActiveSession()` (L60-63) lit `schedule_sessions WHERE is_current = true` — correct.
- Badge calc (L689) et attendance matrix (L2100) utilisent `getActiveSession()` — correct.
- Mais `GET /api/schedule/sessions/:sessionId/courses` (L2665) filtre par `session_id` via les `date_range_id` — architecture correcte mais le badge calc ne l'utilise pas encore.

**Post-Phase 4.3 : le badge calc devra charger les cours de la session active via `schedule_courses` + `schedule_date_ranges` + `schedule_sessions`.**

---

### 5. Endpoints API — format compatible frontend

**PASS**

Format retourne par `GET /api/schedule/sessions/:sessionId/courses` :
```json
{
  "id": "mar-17h45-enfants",
  "day": "Mardi",
  "day_index": 2,
  "start_time": "17:45",
  "end_time": "18:45",
  "name": "Enfants",
  "discipline": "jiujitsu",
  "type": "Enfants",
  "is_active": true
}
```
Le frontend consomme ce format via `SessionConfigModal.tsx` — identifie comme compatible.

**Risque identifie :** La colonne `id` dans `schedule_courses` est un TEXT slug (ex: `mar-17h45-enfants`), identique a `groups.original_name`. Le rewire doit preserver cette coherence pour ne pas casser le lien `student_activities.activity_name`.

---

### 6. Dev standards respectes

**PASS partiel (violations pre-existantes, aucune regression Phase 4.3)**

- `localDateStr()` defini L24 — conforme
- `T12:00:00` utilise dans helpers holidays (L35, 36, 50, 51) — conforme
- `const db = supabase.schema('dojo')` L87 — conforme (aucun `supabase.from()` direct)
- **Violation pre-existante** : L2737-2741 dans `duplicate-ranges` utilise `new Date()` sans T12 — non imputable a la Phase 4.3
- **Code smell** : helpers getHolidayDatesForSession/getAllHolidayDates/getActiveSession (L28-63) declares avant `const db` (L87) — sans bug au runtime mais fragile

---

### 7. Presences — lien eleve vers cours non casse

**PASS**

Le lien eleve → cours est assure par `student_activities.activity_name` = `groups.original_name` = `schedule_courses.id`.
Ce slug est commun aux 3 tables — le lien est preserve tant qu'on ne renomme pas les slugs.

L'attendance (L706-735) stocke `activity_name` dans la table `attendance`.
La lecture des presences dans le badge calc (L723) filtre par `activity_name` — stable.

**Risque Phase 4.3 :** Si le rewire cree de nouveaux cours dans `schedule_courses` avec des IDs differents des slugs existants dans `student_activities`, le lien sera casse. Il faut imperativement que `schedule_courses.id` = `groups.original_name` pour tous les cours existants.

---

### 8. Badges — calcul utilise les bonnes donnees

**PASS (pre-Phase 4.3)**

Le badge calc (L634-1150) utilise :
1. `groups` pour `courses_per_session`, `counts_for_progression`, `schedule_days`
2. `student_activities` pour les inscriptions
3. `attendance` pour les presences
4. `schedule_sessions` pour la session active (via `getActiveSession()`)
5. `schedule_holidays` pour les conges (via `getHolidayDatesForSession()`)

Post-Phase 4.3 : les items 1 seront lus depuis `schedule_courses` au lieu de `groups`.

**Risque critique Phase 4.3 :** Le badge calc utilise `groupScheduleDaysMap` (L632-650) indexe par `original_name`. Apres rewire, la source sera `schedule_courses` indexe par `id` (= meme slug). La logique de lookup doit etre preservee exactement.

---

### 9. student_groups.group_id — compatibilite integer ET text slug

**FAIL — gestion partielle seulement**

Le code gere le `group_id` comme un INTEGER dans la plupart des cas (fk vers `groups.id` qui est UUID/integer).

```javascript
// L1685-1686 : group_id = newGroupId (provient du client, probablement integer)
await db.from('student_groups').insert({ student_id: studentId, group_id: newGroupId });

// L1888-1893 : join student_groups -> groups (via FK groups.id)
.from('student_groups').select('group_id, groups(id, original_name, display_name)').eq('student_id', id)
```

Le code **ne gere pas explicitement** la coexistence d'un format integer legacy vs text slug.
La table `groups` utilise un `id` de type UUID (ou integer selon le schema Supabase) — distinct du `original_name` (text slug).

Le `student_groups.group_id` pointe vers `groups.id` (UUID/integer), PAS vers `schedule_courses.id` (text slug).

**Post-Phase 4.3 : si le rewire veut que `student_groups.group_id` accepte aussi des text slugs de `schedule_courses`, un ALTER TABLE + migration des donnees sera necessaire. Actuellement = integer FK only.**

---

## Risques residuels (reportes de Phase 4.2)

### RISQUE BLOQUANT — badge_given.session_id : INTEGER vs TEXT

Identifie dans QA_PHASE_4_2_POST. Toujours NON RESOLU.

```sql
ALTER TABLE dojo.badge_given ALTER COLUMN session_id TYPE text;
```

A verifier et executer avant Phase 4.3.

---

## Tableau recapitulatif

| Critere | Statut | Severite |
|---|---|---|
| 1. Zero reference active a `groups` | FAIL — 19 appels (3 critiques) | Phase 4.3 cible |
| 2. Aucune donnee supprimee | PASS | OK |
| 3. Cours affiches jour + heure + nom | PASS (endpoint existe) | OK |
| 4. Filtre session active | PASS partiel | OK |
| 5. Endpoints API compatibles frontend | PASS | OK |
| 6. Dev standards | PASS (violations pre-existantes) | OK |
| 7. Presences — lien non casse | PASS | OK |
| 8. Badges — bonnes donnees | PASS (pre-phase) | Risque Phase 4.3 |
| 9. student_groups.group_id integer + text | FAIL — integer only | Risque Phase 4.3 |

---

## Recommandations avant execution Phase 4.3

1. **Creer le rapport `PHASE_4_3_REWIRE_COURSES.md`** — spec precise du rewire avant de toucher au code
2. **Resoudre RISQUE badge_given.session_id** (ALTER TABLE) avant de deployer
3. **Verifier que `schedule_courses.id` = `groups.original_name`** pour tous les cours — executer le diagnostic orphelins du PHASE_4_1_COLUMNS.md
4. **Ne pas modifier `student_activities.activity_name`** — c'est la cle de join centrale entre eleves, cours et presences
5. **Tester le badge calc en local** apres rewire avant deploy prod

---

## Conclusion

Phase 4.3 n'a pas ete executee. Ce rapport est une **baseline pre-Phase 4.3**.
L'architecture actuelle est stable et fonctionnelle. Le rewire ciblera 3 appels critiques a `groups` dans le badge calc et l'attendance matrix.
Le risque principal est la preservation des slugs `original_name` comme cle de join.
