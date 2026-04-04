# QA Phase 4.3 — Recheck sur code ACTUEL

**Date**: 2026-03-31  
**Auditeur**: ZED (Agent-QA)  
**Code lu**: server.js + GroupSelector.tsx + AdminPanel.tsx + types.ts

---

## Checklist — Résultats

| # | Item | Statut | Evidence |
|---|------|--------|----------|
| 1 | `GET /api/groups` lit `schedule_courses` | ✅ PASS | `getScheduleCoursesForActiveSession()` appelé ligne ~275. Log: "PHASE 4.3: Reading from schedule_courses" |
| 2 | Badge calc utilise `schedule_courses` ou fallback | ✅ PASS | `buildDualGroupMaps()` utilisé pour `groupScheduleDaysMap`. Badge_weeks_present compte les semaines de présence depuis `sessionRecords`. |
| 3 | Attendance matrix utilise `schedule_courses` ou fallback | ✅ PASS | Try `schedule_courses` (`.eq('id', group)`) en premier, fallback `groups` (`.eq('original_name', group)`). Dual maps pour `groupCoursesMap`. |
| 4 | Frontend affiche jour + heure + nom | ✅ PASS | GroupSelector: `${group.start_time.replace(':', 'h')} — ${group.name}` quand champs structurés présents. AdminPanel: groupement par `g.day` structuré avec fallback parsing. |
| 5 | Filtre par session active | ✅ PASS | `getScheduleCoursesForActiveSession()` joint via `schedule_date_ranges` → session active only. `includeInactive=false` par défaut pour `GET /api/groups`. |
| 6 | Zéro suppression de données | ✅ PASS | `syncGroupsFromStudents()` désactivé (log only). Aucun `DELETE` sur `groups`. Dual-source = lecture seule sur `groups`. |
| 7 | Table `groups` intacte | ✅ PASS | Confirmé: table lue en fallback uniquement, jamais modifiée par les nouveaux flux. |

---

## Points notables

- **Fallback robuste**: chaque lookup critique (matrix, badge, type/discipline) tente `schedule_courses` d'abord, puis `groups` — aucun point de défaillance unique.
- **Types.ts**: champs `day`, `day_index`, `start_time`, `end_time` ajoutés à l'interface `Group`. Compatible avec le format de réponse `GET /api/groups`.
- **AdminPanel `courseDays`**: utilise `g.day` structuré quand disponible, fallback parsing du nom. Tri par rotation depuis aujourd'hui — bon UX.
- **Risque résiduel (Phase 4.4)**: `student_activities.activity_name` pointe encore vers les anciens noms. Les élèves existants peuvent ne pas matcher les slugs `schedule_courses`. Hors scope Phase 4.3, documenté dans le rapport de phase.

---

## Verdict

**Phase 4.3: VALIDÉE** — Toutes les 7 conditions passent sur le code actuel. Aucune régression détectée.
