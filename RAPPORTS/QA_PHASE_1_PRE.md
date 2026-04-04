# QA PRÉ-PHASE 1 — Rapport de Conformité

**Date :** 2026-03-31
**Agent :** QA (Claude Sonnet 4.6)
**Scope :** Lecture seule — aucune modification de code

---

## Baseline (état actuel AVANT modifications)

### Fichiers JS analysés
- `admin.js` (~500+ lignes, CRUD complet + sessions)
- `app.js` (~2200+ lignes, 4 vues publiques)
- `seed-date-ranges.js` (one-shot, déjà exécuté)
- `seed-supabase.js` (one-shot, déjà exécuté)

### Fonctions clés — admin.js

| Fonction | Rôle |
|---|---|
| `loadData()` | Orchestre le chargement (Supabase → JSON → vide) |
| `loadFromSupabase()` | Fetch sessions, courses, holidays, events, announcements, date_ranges |
| `sbRequest(table, method, body, query)` | Wrapper REST Supabase (toutes requêtes write) |
| `sbGet(table, query)` | Wrapper GET Supabase |
| `renderAll()` | Appelle toutes les fonctions render |
| `renderSchedule()` | Render onglet Cours (accordion par jour) |
| `buildDayCard(dayObj)` | Construit la carte d'un jour |
| `buildCourseRow(cls, dayIndex)` | Construit une ligne de cours dans le tableau |
| `saveCourse()` | Sauvegarde cours (local + Supabase POST) |
| `deleteCourse(dayIndex, id)` | Supprime cours (local + Supabase DELETE) |
| `openCourseModal(cls, dayIndex)` | Ouvre modal ajout/édition cours (avec dropdown date_range) |
| `renderDateRanges()` | Render tableau des plages de dates |
| `renderSessions` → `loadSessions()` | Carousel des sessions |
| `renderSessionCard()` | Affiche une session dans le carousel |
| `getSessionStatus(s)` | Retourne badge + couleur selon état session |
| `countWeekdayOccurrences()` | Compte jours/semaine dans une plage, excluant congés |
| `buildDayBreakdown()` | Résumé cours/jour par date_range |
| `today()` | Retourne date actuelle en YYYY-MM-DD |
| `formatDate(dateStr)` | Formate DD/MM/YYYY |
| `escHtml(str)` | Escape HTML |

### Fonctions clés — app.js

| Fonction | Rôle |
|---|---|
| `loadSchedule()` | Orchestre chargement (Supabase → JSON → erreur) |
| `loadFromSupabase()` | Fetch sessions (is_current), courses, holidays, events, announcements, date_ranges |
| `sbQuery(table, query)` | Wrapper GET REST Supabase |
| `renderAnnouncements(announcements)` | Bannière annonces actives |
| `renderUpcomingEvents(events)` | Bannière événements à venir |
| `renderUpcomingHolidays(holidays)` | Bannière congés à venir |
| `renderHeader(data)` | Nom session + date ranges dans header |
| `renderLegend(disciplines)` | Légende disciplines |
| `toYMD(date)` | Formate Date → YYYY-MM-DD (safe, utilise getFullYear/getMonth/getDate) |
| `formatDateFr(date)` | Format long en français |
| `getHolidayForDate(ymd, holidays)` | Vérifie si une date est en congé |

### Tables Supabase utilisées

| Table | Utilisée dans |
|---|---|
| `schedule_sessions` | admin.js + app.js |
| `schedule_courses` | admin.js + app.js |
| `schedule_holidays` | admin.js + app.js |
| `schedule_events` | admin.js + app.js |
| `schedule_announcements` | admin.js + app.js |
| `schedule_date_ranges` | admin.js + app.js |

### Requêtes Supabase identifiées

**admin.js :**
- L.116-121 : `Promise.all` — sessions, courses, holidays, events, announcements
- L.126 : `schedule_date_ranges` avec `order=sort_order`
- L.452 : DELETE `schedule_courses`
- L.549-562 : POST `schedule_courses`
- L.606 : DELETE `schedule_holidays`
- L.657-661 : PATCH/POST `schedule_holidays`
- L.718 : DELETE `schedule_events`
- L.909 : DELETE `schedule_announcements`
- L.965-967 : PATCH/POST `schedule_announcements`
- L.1358 : GET `schedule_sessions` order=start_date.desc

**app.js :**
- L.211-216 : `Promise.all` — sessions (is_current=eq.true), courses (is_active=eq.true), holidays, events, announcements
- L.220 : `schedule_date_ranges` avec `order=sort_order`

---

## Checklist Dev Standards

### Dates — localDateStr() ou force midi

- [x] **VIOLATION — admin.js L.248** : `function today() { return new Date().toISOString().slice(0, 10); }`
  → Utilise `toISOString()` direct, pas de protection UTC. Standard exige `localDateStr()`.
  
- [x] **VIOLATION — admin.js L.1000** : `holidayDates.add(d.toISOString().slice(0, 10))` dans une boucle
  → Même problème : `toISOString()` sur un Date construit avec `T00:00:00` est risqué si le timezone local n'est pas compensé.

- [x] **VIOLATION — admin.js L.1008** : `cur.toISOString().slice(0, 10)` dans `countWeekdayOccurrences()`

- [x] **VIOLATION — admin.js L.1373** : `new Date().toISOString().slice(0, 10)` dans `getSessionStatus()`

- [x] **VIOLATION — app.js L.261** : `new Date().toISOString().slice(0, 10)` dans `loadFromSupabase()`

- [OK] `app.js` utilise `toYMD(date)` qui elle-même utilise `getFullYear/getMonth/getDate` — safe.
  Mais `toYMD` n'est pas la `localDateStr()` définie dans les standards. Pattern différent mais équivalent. Pas une violation bloquante, mais inconsistance.

- [OK] Toutes les dates reçues de Supabase (YYYY-MM-DD strings) sont parsées avec `'T00:00:00'` — correct.

**Résumé : 5 violations `toISOString()` à corriger globalement avant ou en parallèle de la Phase 2.**

### Supabase — schéma custom obligatoire

- [OK] **admin.js** utilise le pattern `Accept-Profile: dojo` + `Content-Profile: dojo` dans `sbRequest()` (L.26-27). Toutes les requêtes admin passent par `sbRequest` / `sbGet`. Conforme.

- [OK] **app.js** utilise `Accept-Profile: dojo` dans `sbQuery()` (L.168). Conforme pour les lectures.

- [OK] **app.js** L.1722-1724 : le wrapper write dans app.js (sessions admin UI) inclut `Accept-Profile: dojo` + `Content-Profile: dojo`. Conforme.

- [INFO] Le projet n'utilise pas le SDK Supabase JS, donc pas de `supabase.schema('dojo')` — il utilise REST direct avec les headers de profil. C'est une implémentation équivalente valide pour ce stack vanilla JS.

### Nommage snake_case backend / camelCase frontend

- [OK] La transformation snake_case → camelCase est faite dans `loadFromSupabase()` :
  - `c.day_index` → `dayIndex`, `c.start_time` → `startTime`, `c.age_group` → `ageGroup`, `c.date_range_id` → `dateRangeId`
  - Pas de helper formel `getStudentName()` style, mais les transformations sont centralisées dans les fonctions de load. Acceptable pour ce volume.

- [OK] Pas d'accès direct à `c.day_index` dans le render — transformation faite en amont.

---

## Conformité au cahier de charge

### Phase 1 demande : "Badge Session dans onglet Cours"

**État actuel :** ABSENT.

Le `buildCourseRow()` (admin.js L.417-438) génère les colonnes :
- Heure | Nom | Description | Âge | Discipline | Durée | Actions

Il n'y a **aucune colonne Session** ni aucun badge de session/date_range visible dans le tableau des cours.

Le `dateRangeId` est stocké dans l'objet cours (L.165 admin.js : `dateRangeId: c.date_range_id || ''`) et utilisé dans le dropdown de la modale (L.478-483), mais **jamais affiché dans le tableau.**

La variable globale `dateRanges` (L.82) est populée au load et contient les infos de session par plage. Le lien **existe dans les données** mais n'est pas **rendu visuellement** dans l'onglet Cours.

### Phase 1 demande : "Cours inactifs en gris"

**État actuel :** ABSENT.

L'app.js filtre `is_active=eq.true` (L.213) pour la vue publique — seuls les cours actifs sont visibles au public.

Dans admin.js, **tous** les cours sont affichés sans distinction d'activité ni coloration gris pour les inactifs. Aucun style conditionnel sur `is_active` ou sur l'appartenance à une session inactive.

### Lien cours → date_ranges → sessions : existe dans le code?

**État actuel : PARTIEL.**

Le lien de données existe et est correctement modélisé :
- `schedule_courses.date_range_id` → `schedule_date_ranges.id` (L.165 admin.js, L.252 app.js)
- `schedule_date_ranges.session_id` → `schedule_sessions.id` (L.139 admin.js)

La chaîne complète `cours → date_range → session` est disponible en mémoire après le load. Mais aucune fonction ne **résout** cette chaîne pour afficher la session d'un cours donné.

**Ce qu'il manque pour la Phase 2 :**
1. Une fonction `getSessionForCourse(cls)` qui résout `cls.dateRangeId → dateRanges → sessions`
2. Un badge dans `buildCourseRow()` affichant le nom de la session + état actif/inactif
3. Un style `opacity-50 text-gray-400` ou similar sur les lignes de cours inactifs

---

## Risques identifiés

1. **Cours sans `date_range_id`** — L.165 admin.js : `dateRangeId: c.date_range_id || ''`. Une valeur vide string `''` signifie "session principale" selon le commentaire L.479. Lors de l'affichage du badge, il faudra gérer ce cas (fallback = nom de la session courante).

2. **Multi-session dans admin** — L.114-130 admin.js : `loadFromSupabase()` charge tous les cours sans filtre de session (`select=*&order=day_index,sort_order`). Si plusieurs sessions ont des cours, l'onglet Cours affiche les cours de TOUTES les sessions mélangés. Un cours d'une session inactive peut apparaître dans la même liste. **Risque de confusion UI.**

3. **`is_active` non exploité dans admin** — Le champ `is_active` est SET à `true` lors de la création (L.558), mais n'est jamais lu pour filtrer ou styliser dans l'admin. Si un cours est désactivé directement en DB, l'admin l'affiche quand même normalement.

4. **`toISOString()` en UTC** — 5 occurrences identifiées. À UTC-4/UTC-5 (Rouyn-Noranda), une date créée en soirée peut glisser au jour précédent. Risque faible pour les dates de session (saisie manuelle) mais réel pour `today()` utilisée dans `data.updated`.

5. **HTML malformé admin.html** — L.114-116 : `</main>` est fermé, puis `<` seul sur une ligne (L.115 raw), suivi des sections de tabs en dehors du `<main>`. Structure HTML anormale — les tabs Cours, Congés, etc. sont techniquement hors du `<main>`. Fonctionne visuellement (navigateurs permissifs) mais fragile.

6. **Carousel sessions** — `loadSessions()` est appelé séparément (au switch d'onglet Sessions) alors que `loadData()` charge aussi les sessions. Deux sources de données séparées pour les sessions. Pas de sync entre `allSessions` et `data.session`. Si une session est activée dans le carousel, `currentSessionId` dans la modale de cours ne se met pas à jour automatiquement.

---

## Violations existantes (dev_standards)

| # | Fichier | Ligne(s) | Violation | Correction requise |
|---|---|---|---|---|
| V1 | admin.js | 248 | `today()` utilise `toISOString()` | Remplacer par `localDateStr()` |
| V2 | admin.js | 1000 | `toISOString()` dans boucle holidays | Utiliser `localDateStr(d)` |
| V3 | admin.js | 1008 | `toISOString()` dans `countWeekdayOccurrences` | Utiliser `localDateStr(cur)` |
| V4 | admin.js | 1373 | `toISOString()` dans `getSessionStatus` | Utiliser `localDateStr()` |
| V5 | app.js | 261 | `toISOString()` dans `loadFromSupabase` | Utiliser `localDateStr()` |

**Note :** Grep global effectué sur les deux fichiers JS. Ces 5 sont les seules occurrences de `toISOString()` utilisées pour extraire une date locale. Les `new Date(str + 'T00:00:00')` sont corrects.

---

## Verdict PRÉ-PHASE

### GO — avec notes de vigilance

**Raison du GO :**
- L'architecture de données est en place et fonctionnelle : `courses → date_ranges → sessions`
- Le `dateRangeId` est stocké sur chaque cours et disponible au render
- La variable globale `dateRanges` contient toutes les infos nécessaires pour le badge
- La Phase 1 (spec/analyse) ne touche pas au code — elle documente et prépare la Phase 2
- Les violations identifiées (surtout `toISOString`) n'empêchent pas la Phase 2, mais DOIVENT être corrigées en même temps dans la Phase 2

**Ce que l'Agent-Code doit faire en Phase 2 :**
1. Corriger les 5 violations `toISOString()` (grep global, fix dans les deux fichiers)
2. Ajouter colonne "Session" dans `buildCourseRow()` — résoudre `dateRangeId → session`
3. Styliser les cours inactifs (appartenant à session `is_current=false`) en gris
4. Gérer le cas `dateRangeId = ''` (fallback = session courante)
5. Corriger le HTML malformé dans admin.html (sections hors `<main>`)

**Risque principal à surveiller :** Le fait que l'admin charge TOUS les cours (sans filtre session) signifie qu'ajouter un badge "session" va révéler des cours d'autres sessions dans la même liste. Décider avec Seb si on filtre par session active ou si on affiche tout avec le badge.
