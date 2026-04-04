# QA Phase 4.4b — Validation Post-Implémentation

**Date**: 2026-03-31  
**Auditeur**: ZED (Agent-QA)  
**Fichiers analysés**: `server.js` (46 842 tokens)  
**Rapport de spec lu**: PHASE_4_4b_FIX_STUDENTS.md — **INTROUVABLE**

---

## VERDICT GLOBAL : ❌ PHASE 4.4b NON IMPLÉMENTÉE

La spec n'existe pas encore (`PHASE_4_4b_FIX_STUDENTS.md` absent) et le code ne contient aucune des modifications attendues.

---

## Checklist — Résultats

| # | Item | Statut | Evidence |
|---|------|--------|----------|
| 1 | Dual-lookup implémenté (schedule_course_id first, fallback activity_name) | ❌ ABSENT | Aucune occurrence de `schedule_course_id` dans server.js. Seul `activity_name` est utilisé. |
| 2 | `GET /api/students?group=X` cherche par schedule_course_id | ❌ ABSENT | Ligne 771: `.eq('activity_name', group)` uniquement — aucun fallback par course_id |
| 3 | `GET /api/attendance/matrix?group=X` cherche par schedule_course_id | ❌ ABSENT | Ligne 2352-2356: `.eq('activity_name', group)` uniquement pour récupérer les étudiants |
| 4 | Badges/stats utilisent schedule_course_id | ❌ ABSENT | `buildDualGroupMaps()` et `getScheduledDatesInSession()` opèrent sur `activity_name` uniquement |
| 5 | Anciens formats (activity_name) toujours fonctionnels | ✅ OK | Toute la logique repose sur `activity_name` — rien n'est cassé, mais rien n'est migré non plus |
| 6 | Helper créé si pattern se répète | ❌ ABSENT | Aucun helper de lookup dual par course_id |
| 7 | Dev standards respectés | ✅ OK | Code actuel propre, dual-source Phase 4.3 intact |

---

## Problème exact identifié (hérité de QA 4.3)

`student_activities.activity_name` pointe vers les **anciens noms de groupes** (ex: `"Mardi JJ Enfants"`), pas vers les slugs `schedule_courses.id` (ex: `"mar-17h45-enfants"`).

Résultat :
- `GET /api/students?group=mar-17h45-enfants` → retourne 0 élèves (le `.eq('activity_name', 'mar-17h45-enfants')` ne matche rien)
- `GET /api/attendance/matrix?group=mar-17h45-enfants` → 0 étudiants récupérés via `student_activities`
- Badges : `getScheduledDatesInSession('mar-17h45-enfants')` → dates calculées, mais aucun élève ne les reçoit

---

## État réel du code (Phase 4.3 en place, 4.4b absent)

**Ce qui fonctionne** (Phase 4.3 intacte) :
- `GET /api/groups` → lit `schedule_courses` ✅
- `buildDualGroupMaps()` → couvre les deux sources pour les métadonnées ✅
- `GET /api/attendance/matrix` → config du groupe (jours, discipline) via dual-lookup ✅

**Ce qui est cassé / manquant** (Phase 4.4b) :
- Filtrage des **élèves** par groupe via `schedule_course_id` : absent
- Filtrage des **présences** par cours dans matrix : absent  
- Backfill de `student_activities.activity_name` vers slugs 4.3 : non fait

---

## Prochaines étapes requises

1. **Écrire PHASE_4_4b_FIX_STUDENTS.md** — spec du dual-lookup dans `student_activities`
2. **Implémenter le helper** : `getStudentIdsByGroup(group)` qui essaie `schedule_course_id` en premier, fallback `activity_name`
3. **Patcher** `GET /api/students` et `GET /api/attendance/matrix` avec ce helper
4. **Optionnel** : backfill `student_activities` pour migrer les anciens `activity_name` vers slugs

---

## Conclusion

Aucune régression introduite. La Phase 4.3 est intacte. Mais la Phase 4.4b **n'a pas démarré** — ni spec, ni code. Le risque documenté dans QA-4.3 (students invisibles sous les nouveaux slugs) est toujours actif.
