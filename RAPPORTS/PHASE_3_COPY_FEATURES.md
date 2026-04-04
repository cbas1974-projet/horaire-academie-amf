# Phase 3 — Copie de cours entre sessions

**Date :** 2026-03-31
**Fichiers modifiés :** `admin.js`, `admin.html`

---

## Ce qui a été implémenté

### 3.1 — Dupliquer un seul cours

- Bouton 📋 ajouté dans la colonne Actions de chaque ligne du tableau Cours
- Ouvre `copyCourseModal` avec :
  - Nom du cours source (read-only)
  - Dropdown "Session destination" (toutes les sessions)
  - Dropdown "Plage de dates destination" (peuplé dynamiquement quand on choisit la session)
  - Jour destination (pré-rempli avec le jour source, modifiable)
  - Heure début / fin (pré-remplies, modifiables)
- Anti-doublon : vérifie name + day_index + start_time avant INSERT
- INSERT via `sbRequest('schedule_courses', 'POST', [...])` — même pattern que `saveCourse()`
- Refresh du tableau après copie

### 3.2 — Copier un jour complet

- Bouton "Copier ce jour" (violet) dans le header de chaque section jour
- Ouvre `copyDayModal` avec :
  - Label source : "Lundi (Session X)"
  - Dropdown session destination
  - Dropdown plage de dates destination (dynamique)
  - Dropdown jour destination (pré-rempli avec le même jour)
- Copie tous les cours du jour source (filtrés par la session active dans le dropdown filtre)
- Anti-doublon par cours : skip si déjà existant
- Toast de résultat : "X cours copiés — Y déjà existants ignorés"

### 3.3 — Copier la session complète

- Bouton "Copier la session complète" dans la barre de filtre (à droite du dropdown session)
- S'active uniquement si une session spécifique est sélectionnée dans le filtre (pas "Toutes les sessions")
- Ouvre `copySessionModal` avec :
  - Label source : nom de la session filtrée
  - Dropdown session destination (source exclue automatiquement)
- Copie tous les cours de la session source vers la session destination
- Pour la plage de dates : utilise la première plage disponible de la session destination (ou null = session principale)
- Anti-doublon complet : skip tous les cours qui existent déjà (même nom + jour + heure)
- Toast de résultat : "X cours copiés, Y doublons ignorés"

---

## Fonctions ajoutées dans admin.js

| Fonction | Rôle |
|---|---|
| `getDateRangesForSession(sessionId)` | Retourne les date_ranges d'une session depuis le cache `allDateRanges` |
| `populateDateRangeSelect(selectEl, sessionId, includeMain)` | Peuple un `<select>` avec les plages de la session |
| `populateSessionSelect(selectEl, excludeSessionId)` | Peuple un `<select>` avec toutes les sessions |
| `courseExistsInSession(name, dayIndex, startTime, destSessionId)` | Anti-doublon : vérifie existence dans l'état local |
| `insertCopiedCourse(sourceCls, destDayIndex, destDateRangeId, destSessionId)` | INSERT Supabase + mise à jour local state |
| `openCopyCourseModal(cls, dayIndex)` | Ouvre la modale 3.1 |
| `saveCopyCourse()` | Sauvegarde 3.1 |
| `openCopyDayModal(dayIndex)` | Ouvre la modale 3.2 |
| `saveCopyDay()` | Sauvegarde 3.2 |
| `openCopySessionModal()` | Ouvre la modale 3.3 |
| `saveCopySession()` | Sauvegarde 3.3 |

---

## Modales ajoutées dans admin.html

- `copyCourseModal` — Dupliquer un cours
- `copyDayModal` — Copier un jour
- `copySessionModal` — Copier la session complète

Toutes intégrées au système existant :
- `closeAllModals()` mis à jour pour les inclure
- Backdrop click (`.modal-backdrop`) et boutons `×` (`.modal-close`) déjà couverts par les sélecteurs génériques de `initBindings()`
- Bindings explicites pour les 3 boutons "Enregistrer" dans `initBindings()`

---

## Notes importantes

- **Anti-doublons** : vérification sur données locales (`data.schedule`) — rapide, no extra fetch
- **Plage de dates destination pour 3.3** : utilise `destRanges[0]` si disponible, sinon null (session principale). L'utilisateur peut ajuster individuellement après si besoin.
- **Pas de reload de page** : après chaque copie, `renderSchedule()` suffit car les cours copiés sont ajoutés au local state
- **Pattern Supabase** : identique à `saveCourse()` — POST avec `resolution=merge-duplicates`
