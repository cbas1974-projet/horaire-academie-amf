# Phase 4.1 — Ajout colonnes DM a schedule_courses

*2026-03-31*

---

## Colonnes ajoutees

| Colonne | Type | Default | Pourquoi |
|---|---|---|---|
| `courses_per_session` | integer | 10 | Nb de cours que ce groupe donne par session. Utilise pour le calcul de badge (denominateur). |
| `counts_for_progression` | boolean | true | Est-ce que ce cours compte pour la progression de ceinture. JJ l'utilise pour filtrer; MT l'ignore. |
| `max_capacity` | integer | 25 | Capacite max d'eleves. Affiche dans le dashboard d'occupation. |

## Valeurs par defaut — justification

Les defaults viennent directement du code `server.js` de Dojo Manager :

- **`courses_per_session` = 10** : `g.courses_per_session || 10` (ligne 601, 610)
- **`counts_for_progression` = true** : `g.counts_for_progression !== false` — traite null comme true (ligne 603, 611)
- **`max_capacity` = 25** : `max_capacity || 25` dans le POST de creation de groupe (ligne 180)

Ces defaults sont donc identiques au comportement actuel de DM quand les valeurs sont absentes.

## Strategie de backfill

Le matching se fait sur `groups.original_name = schedule_courses.id`. Les deux utilisent le meme slug (ex: "mar-17h45-enfants").

Le backfill :
1. Joint `groups` et `schedule_courses` par ce slug
2. Copie les 3 valeurs (avec COALESCE pour garder les defaults si NULL dans groups)
3. Les cours dans `schedule_courses` sans equivalent dans `groups` gardent les valeurs par defaut

## Instructions d'execution

### Ordre

1. **D'abord** : executer le diagnostic d'orphelins (requete commentee dans `backfill-phase4-columns.sql`, Etape 0) pour verifier qu'il n'y a pas de divergence de slugs
2. **Ensuite** : `migrate-phase4-columns.sql` — ajoute les colonnes
3. **Puis** : `backfill-phase4-columns.sql` — copie les valeurs depuis groups
4. **Verifier** : le SELECT final du backfill montre chaque cours avec sa source (backfilled vs default)

### Verification post-execution

```sql
-- Tous les cours doivent avoir des valeurs non-NULL :
SELECT id, courses_per_session, counts_for_progression, max_capacity
FROM dojo.schedule_courses
WHERE courses_per_session IS NULL
   OR counts_for_progression IS NULL
   OR max_capacity IS NULL;
-- Resultat attendu : 0 lignes
```

### Rollback (si necessaire)

```sql
ALTER TABLE dojo.schedule_courses DROP COLUMN IF EXISTS courses_per_session;
ALTER TABLE dojo.schedule_courses DROP COLUMN IF EXISTS counts_for_progression;
ALTER TABLE dojo.schedule_courses DROP COLUMN IF EXISTS max_capacity;
```

## Fichiers

- `migrate-phase4-columns.sql` — ALTER TABLE (idempotent)
- `backfill-phase4-columns.sql` — UPDATE avec matching + resume
