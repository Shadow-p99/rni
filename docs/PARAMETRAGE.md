# Paramétrage de l'application (Administration)

Depuis la version 2.10.0, ce qui était codé en dur dans `@rni/shared` est réglé **en base**
depuis l'écran **Administration**, accessible aux profils ayant le droit « Administrer
l'application » (par défaut : le super administrateur). Toute modification s'applique
immédiatement sur toutes les instances de l'API (cache invalidé par notification PostgreSQL) et
est tracée dans `t_admin_logs` (auteur, avant / après ; jamais la valeur d'un secret).

| Onglet | Ce qui se règle | Tables |
|---|---|---|
| **Droits** | Pour chaque profil, chaque droit accordé ou retiré d'un clic, avec sa portée | `ref_droit`, `t_profil_droit` |
| **Profils** | Libellé, code, ordre, port d'un planning ; création (copie d'un modèle) et suppression ; profils listés / gérés dans la gestion du personnel | `ref_profil`, `t_profil_classement`, `t_profil_gestion` |
| **Périmètres** | Régions visibles par profil sur la carte et le planning | `t_perimetre_profil` |
| **Positions** | Libellé, couleur, activation, position restreinte, priorité de couleur des groupes sur la carte | `ref_pos_service` |
| **Fiche de crise** | Types de crise ; libellés, ordre et caractère obligatoire des champs ; libellés et impression des sections | `ref_type_crise`, `t_formulaire_section`, `t_formulaire_champ` |
| **Paramètres** | Valeurs de `t_param_app` (secrets masqués) et libellés des messages d'erreur | `t_param_app`, `t_admin_messages` |

## Droits

| Code | Droit | Portées |
|---|---|---|
| `carte.voir` | Voir la carte opérationnelle | — |
| `carte.geoloc` | Voir la géolocalisation des terminaux | — |
| `carte.isochrone` | Point de crise et isochrones | — |
| `planning.voir` | Voir le planning | — |
| `planning.ecrire` | Modifier le planning | toutes les régions / sa région / lui-même |
| `planning.positions_restreintes` | Poser ou retirer une position restreinte | — |
| `formulaire.voir` | Voir les fiches de crise | toutes / auteurs de sa région |
| `formulaire.creer` | Créer une fiche | — |
| `formulaire.modifier` | Modifier une fiche non clôturée | toutes les fiches visibles / ses fiches |
| `formulaire.cloturer` | **Clôturer** une fiche (irréversible) | toutes les fiches visibles / ses fiches |
| `formulaire.supprimer` | Supprimer une fiche | toutes les fiches visibles / ses fiches |
| `gestion.acces` | Gestion du personnel | toutes les régions / sa région |
| `admin.acces` | Administration | — (toujours accordé au super administrateur) |

Les valeurs livrées reproduisent exactement les règles de la version précédente (par exemple :
clôture par l'auteur seul, profils Lecture seule / Fiche de crise / OMS sans accès aux fiches).

**Sécurité.** Le droit est vérifié par l'API à chaque requête (`@RequireDroit` sur les routes, portée
contrôlée dans les services). Une route d'écriture sans droit déclaré est refusée (règle sûre par
défaut, vérifiée par un test). L'interface masque menus et boutons selon les mêmes droits
(`/users/me` → `droits`), mais n'est jamais la seule barrière.

**Effet pour les utilisateurs connectés.** L'API applique le changement immédiatement ; l'interface
d'un utilisateur déjà connecté se met à jour à son prochain rechargement de page.

## Ce qui reste dans le code

- Les **validateurs** (téléphone, nigend, longueurs minimales de recherche).
- La **nature** des champs de la fiche (texte, note, adresse… : ce sont des colonnes de `t_formulaire`).
- Le découpage en créneaux jour / nuit et l'arithmétique des plannings.
- Les codes des droits (chacun correspond à un contrôle) et les identifiants des profils livrés
  (le super administrateur garde deux protections : administration toujours accessible, compte
  géré par un super administrateur seulement).
