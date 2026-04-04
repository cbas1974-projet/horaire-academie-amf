# PHASE 1 — Spec : Association Cours ↔ Sessions

## Schema Supabase (état actuel)

### Tables et colonnes pertinentes

#### `schedule_sessions`
```
id                TEXT         (PRIMARY KEY)
name              TEXT
start_date        DATE
end_date          DATE
is_current        BOOLEAN      (flag pour "cette session est active")
is_archived       BOOLEAN      (defaults FALSE)
created_at        TIMESTAMPTZ
```

#### `schedule_courses`
```
id                TEXT         (PRIMARY KEY)
day               TEXT         (ex: "Lundi")
day_index         SMALLINT     (0=Dimanche…6=Samedi)
start_time        TEXT         (HH:MM format)
end_time          TEXT         (HH:MM format)
name              TEXT         (ex: "Enfants débutants")
description       TEXT
age_group         TEXT         (ex: "4-8 ans")
discipline        TEXT         (enum-ish: jiujitsu, muaythai, superkids, gracie)
type              TEXT         (optional)
is_active         BOOLEAN      (defaults TRUE)
sort_order        SMALLINT     (order within a day)
date_range_id     TEXT         (FOREIGN KEY → schedule_date_ranges.id, ON DELETE SET NULL)
created_at        TIMESTAMPTZ
```

#### `schedule_date_ranges`
```
id                TEXT         (PRIMARY KEY)
session_id        TEXT         (FOREIGN KEY → schedule_sessions.id, ON DELETE CASCADE)
name              TEXT         (ex: "Jiujitsu & Gracie", "Muay Thai")
start_date        DATE
end_date          DATE
sort_order        SMALLINT     (order of display)
created_at        TIMESTAMPTZ
```

Politiques RLS : `schedule_courses`, `schedule_date_ranges`, et `schedule_sessions` permettent tous les CRUD en lecture anonyme.

### Liens entre tables

```
schedule_sessions
        ↓
        └─→ schedule_date_ranges (session_id)
                  ↓
                  └─→ schedule_courses (date_range_id)
                  
Course → date_range_id
  ├─ Si NULL : utilise session.start_date / session.end_date (principal)
  └─ Si rempli : utilise ce date_range.start_date / date_range.end_date
```

**Cas concret (seed-date-ranges.js, ligne 13-32)** :
- Session "printemps-2026" (7 avril → 10 juin 2026)
- Date range "Jiujitsu & Gracie" (7 avril → 10 juin, 9 cours) — liée à 9 courses
- Date range "Muay Thai" (7 avril → 27 mai, 3 cours) — liée à 3 courses

---

## Code actuel (admin.js)

### Comment les cours sont chargés

**Fonction `loadFromSupabase()` (ligne 113-203)** :
1. Requête Supabase : `select=*&order=day_index,sort_order` sur `schedule_courses`
2. Filtre par `session_id` (utilise `currentSessionId`)
3. Transforme en structure locale avec colonnes : `id, time, startTime, endTime, name, description, ageGroup, discipline, duration, dateRangeId` (ligne 164)
4. Stocke dans `data.schedule[dayIndex].classes[]`

**Sauvegarde course** (fonction `saveCourse()`, ligne 511-570) :
- Construit un POST vers `schedule_courses` avec structure Supabase (ligne 549-562) :
  ```
  {
    id, day, day_index, start_time, end_time, name, description, 
    age_group, discipline, date_range_id, is_active, sort_order
  }
  ```
- **Clé : `date_range_id`** est capturé depuis `document.getElementById('courseDateRange').value` (ligne 518)

### Comment les sessions sont gérées

**Gestion session active** (ligne 130, 138-144) :
- Au chargement, cherche `sessions.find(s => s.is_current)` ou prend la première
- Stocke `currentSessionId` globalement (ligne 130)
- Filtre les date_ranges par `r.session_id === sid` (ligne 138)

**Onglet Sessions (Tab invisible, gestion en carousel)** :
- Fonction `loadSessions()` (ligne 1350-1369) : charge ALL sessions en DESC order, puis reverse pour Oldest first
- `getSessionStatus()` (ligne 1371-1378) : détermine "Actif", "En construction", "Archivé", "Inactif"

### Comment les date_ranges sont liées

**Fonctions clés** :

1. **`loadFromSupabase()`** (ligne 137-144) :
   - Récupère `schedule_date_ranges` (try-catch car pré-migration elle peut ne pas exister)
   - Filtre par `session_id` et transforme en `{ id, name, startDate, endDate, sortOrder }`
   - Stocke globalement dans `dateRanges = []` (ligne 81)

2. **`openCourseModal()`** (ligne 477-482) :
   - Populate dropdown `#courseDateRange` avec all `dateRanges`
   - Format : `"dr-jiujitsu" → "Jiujitsu & Gracie (7 avril – 10 juin)"`
   - Pré-sélectionne la valeur depuis `cls.dateRangeId` (ligne 482)

3. **`renderDateRanges()`** (ligne 1045-1091) :
   - Affiche table avec colonnes : Nom, Début, Fin, Cours (count), Séances (breakdown par jour)
   - Compte les cours liés : `coursesInRange = (day.classes || []).filter(c => c.dateRangeId === dr.id)` (ligne 1028)
   - Fonction `buildDayBreakdown()` (ligne 1021-1043) : affiche "Lun: 2x, Mar: 1x" pour montrer où se trouvent les cours

4. **`saveDateRange()`** (ligne 1140-1180) :
   - POST vers Supabase avec `{ id, session_id, name, start_date, end_date, sort_order }`
   - Met à jour local `dateRanges[]` array

5. **`deleteDateRange()`** (ligne 1182-1204) :
   - Supprime la range → Supabase FK `ON DELETE CASCADE`... **WAIT** : non, c'est `ON DELETE SET NULL` sur la colonne course.date_range_id
   - Réinitialise localement `cls.dateRangeId = ''` pour les courses affectées (ligne 1188)

---

## Code public (app.js)

### Comment le site public filtre par session active

**Fonction `loadFromSupabase()`** (ligne 209-297) :
1. Requête Supabase : `is_current=eq.true&limit=1` sur `schedule_sessions`
2. Récupère la session actuelle UNIQUEMENT (ligne 221, 222)
3. Filtre toutes les dépendances par `session_id === sid` (ligne 226-229) :
   - Holidays
   - Events
   - Announcements
4. Récupère `schedule_date_ranges` (try-catch pré-migration)
5. Filtre par `session_id` (ligne 229)
6. Transforme en `appData.dateRanges` (ligne 273-279)

**La cascade** :
```
Site public
   ↓
   Query: is_current=eq.true (une seule session)
   ↓
   Tout le reste (courses, holidays, date_ranges) filtré par session_id
```

**Affichage des date_ranges** (ligne 492-509 dans `renderHeader()`):
- Affiche chaque range dans un petit header : `"Jiujitsu & Gracie : 7 avril — 10 juin"`
- Coloring : muay thai = var(--red-light), others = var(--gold-light)

**Pas de filtre par date_range dans la vue publique** :
- Les courses affichées incluent TOUTES les courses actives (`is_active=eq.true`)
- La colonne `dateRangeId` est chargée (ligne 251) mais **n'est PAS utilisée pour filtrer l'affichage**
- ⚠️ Implication : un cours "Muay Thai" affecté à la range "Muay Thai" (27 mai fin) continue à s'afficher même après 27 mai, car le filtre ne l'applique pas

---

## Proposition UI — Badge Session dans onglet Cours

### État actuel du tableau (admin.html + admin.js)

**Colonnes du tableau "Courses"** (fonction `buildCourseRow()`, ligne 416-437) :
1. Heure (time)
2. Nom (name)
3. Description (hidden md:table-cell)
4. Âge (hidden sm:table-cell)
5. Discipline (avec dot coloré)
6. Durée (hidden sm:table-cell)
7. Actions (Modifier, Supprimer)

**Structure HTML générée** (ligne 352-377) :
```html
<table>
  <colgroup>
    <col style="width: 5%;">     <!-- Heure -->
    <col style="width: 10%;">    <!-- Nom -->
    <col style="width: 15%;">    <!-- Description (md:hidden) -->
    <col style="width: 5%;">     <!-- Âge (sm:hidden) -->
    <col style="width: 5%;">     <!-- Discipline -->
    <col style="width: 3%;">     <!-- Durée (sm:hidden) -->
    <col style="width: 5%;">     <!-- Actions -->
  </colgroup>
```

### Option A : Colonne "Session" avec badge

Ajouter une 4e colonne after Discipline :

```
| Heure | Nom | Discipline | Session | Actions |
| 17:45 | Enfants | Jiujitsu (dot) | Jiujitsu & Gracie | [Modifier] [Supprimer] |
```

**Avantages** :
- Très clair et lisible
- Permet de voir immédiatement à quelle range un cours appartient

**Désavantages** :
- Utilise de la place horizontale (déjà tight en mobile)
- Colonne pourrait être vide pour beaucoup de cours (si pas assignés)

**Impact code** :
- Modifier `buildCourseRow()` pour ajouter une cellule with contenu : 
  ```js
  <td>${dateRanges.find(r => r.id === cls.dateRangeId)?.name || '— Principale —'}</td>
  ```
- Modifier `colgroup` pour ajouter une `<col>` (~8%)

### Option B : Badge coloré par session (inline avec discipline)

Modifier la cellule "Discipline" pour afficher AUSSI le badge "session" :

```
| Discipline | Badge |
| Jiujitsu (dot) | Jiujitsu & Gracie (petit badge) |
```

**Exemple HTML** :
```html
<td class="px-4 py-2">
  <span class="inline-flex items-center gap-1">
    <span class="discipline-dot" style="background:#c9a227"></span>
    <span class="text-xs text-gray-600">Jiujitsu</span>
  </span>
  ${cls.dateRangeId ? `<span class="badge-session">${rangeNameShort}</span>` : ''}
</td>
```

**Avantages** :
- Compact, pas de colonne supplémentaire
- Visuellement proche du concept "ce cours appartient à cette session"
- Dégradé gracieux si pas assigné

**Désavantages** :
- Colonne devient plus haute / complexe
- Risque de faire trop d'infos par cellule

### Option C : Colonne conditionnelle (affichée only si date_ranges exists)

Ajouter une colonne "Session" MAIS hidden si aucune date_range n'existe :

```js
if (dateRanges.length > 0) {
  // Show "Session" column
} else {
  // Hide it, render default table
}
```

**Avantages** :
- Adaptatif : si admin n'utilise pas les date_ranges, pas de clutter
- Scalable pour futur

**Désavantages** :
- Code plus complexe (deux versions du tableau)

---

## Recommandation

### ✅ Option B + Option A (Dual approach)

**Phase 1 (maintenant)** : Implémenter **Option B** (badge inline) parce que :
- C'est minimal et non-disruptif
- Aucun changement au layout
- Peut être ajouté en 5 lignes
- Prépare le terrain pour les filtres futures

**Phase 2 (futur)** : Ajouter **Option A** (colonne) si :
- Utilisateurs demandent plus de visibilité
- On veut trier/filtrer par session depuis l'admin
- On intègre les date_ranges au Dojo Planner (lien prévu)

### Code concret Phase 1

**Dans `buildCourseRow()` (admin.js, ligne 416-437)** :

```js
// Ligne 424-428 actuelle
<td class="px-4 py-2">
  <span class="inline-flex items-center gap-1">
    <span class="discipline-dot" style="background:${disc.color}"></span>
    <span class="text-gray-600 text-xs hidden lg:inline">${escHtml(disc.label)}</span>
  </span>
</td>

// AJOUTER après : 
${cls.dateRangeId ? `
<td class="px-4 py-2">
  <span class="inline-block bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-1 rounded">
    ${escHtml(dateRanges.find(r => r.id === cls.dateRangeId)?.name || 'N/A')}
  </span>
</td>
` : '<td class="px-4 py-2"><span class="text-gray-300 text-xs">Principale</span></td>'}
```

**Et dans le `<table>` (admin.html)** :

```html
<colgroup>
  <col style="width: 5%;">      <!-- Heure -->
  <col style="width: 10%;">     <!-- Nom -->
  <col style="width: 15%;">     <!-- Description (md:hidden) -->
  <col style="width: 5%;">      <!-- Âge (sm:hidden) -->
  <col style="width: 5%;">      <!-- Discipline -->
  <col style="width: 8%;">      <!-- Session (NOUVELLE) -->
  <col style="width: 3%;">      <!-- Durée (sm:hidden) -->
  <col style="width: 5%;">      <!-- Actions -->
</colgroup>
<thead>
  <tr class="border-b border-gray-100">
    <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Heure</th>
    <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Nom</th>
    <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs hidden md:table-cell">Description</th>
    <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs hidden sm:table-cell">Âge</th>
    <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Discipline</th>
    <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs">Session</th><!-- NOUVELLE -->
    <th class="text-left px-4 py-2 font-semibold text-gray-500 text-xs hidden sm:table-cell">Durée</th>
    <th class="text-right px-4 py-2 font-semibold text-gray-500 text-xs">Actions</th>
  </tr>
</thead>
```

---

## Points d'attention

### Architecturaux

1. **Pre-migration** : Si `schedule_date_ranges` n'existe pas encore en Supabase, le code admin (ligne 125) fait un try-catch. ✅ Graceful.

2. **FK cascade** : Quand on supprime une `date_range`, la FK `schedule_courses.date_range_id` a `ON DELETE SET NULL`, donc les courses restent en DB mais passent à `date_range_id = NULL`. ✅ Safe.

3. **Session filtering** : Admin charge la session active (`is_current = true`). Si plusieurs sessions existent, les date_ranges et courses d'autres sessions ne sont pas affichées. ✅ Isolation correcte.

4. **Public site** : Charge UNIQUEMENT la session active. Les date_ranges s'affichent dans le header mais ne filtrent PAS l'affichage des courses. ⚠️ À définir : voulez-vous que le site public cache les courses "hors de leur date_range" ?

### Edge cases

1. **Cours sans date_range assignée** : Affiche "Principale" dans l'admin, utilise les dates de session. ✅ Clear.

2. **Date_range sans courses** : Peut exister (edge case). L'admin affiche "0 cours". ✅ OK.

3. **Deux date_ranges qui se chevauchent** : Aucune validation actuellement. Un cours ne peut être assigné qu'à une seule range à la fois (colonne `date_range_id` unique). ✅ Model correct.

4. **Changer la date_range d'un cours** : Via le modal "Modifier cours" → change le dropdown. La requête PATCH met à jour `date_range_id`. ✅ Works.

### Dépendances futures

- **Junior Combative / Dojo Planner** : Devrait aussi utiliser `schedule_date_ranges` de la même schema `dojo`. Actuellement il y a un lien dans admin.js vers `JUNIOR_COMBATIVE_URL = 'http://localhost:5173'` (ligne 11).
- **Filtrage public par date_range** : À implémenter si on veut cacher les cours hors-session sur le site public.

---

## Fichiers à modifier pour Phase 1

1. **`admin.html`** : Ajouter colonne "Session" au tableau `<table>` de l'onglet Cours
2. **`admin.js`** : Modifier `buildCourseRow()` pour afficher le badge session

**Pas de changement** :
- SQL migrations (déjà exécutées en dev)
- `app.js` (site public fonctionne, juste affiche les ranges dans header)
- Structure Supabase (stable)
