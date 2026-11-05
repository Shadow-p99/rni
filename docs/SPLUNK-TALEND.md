# Audit Splunk (BR-SEC-1) : alimentation par Talend

L'API écrit une ligne d'audit par requête métier dans la table PostgreSQL
**`t_admin_log_splunk`**. Un job Talend lit ces lignes et les envoie dans Splunk. L'API n'appelle
jamais Splunk directement.

```
navigateur → reverse-proxy SSO → API RNI ──(SplunkAuditMiddleware, lots de 2 s)──► t_admin_log_splunk
                                                                                 │
                                                       job Talend (v_log_splunk_export, filigrane id_log)
                                                                                 ▼
                                                                              Splunk
```

## Ce qui est tracé

Le middleware `SplunkAuditMiddleware` (`apps/api/src/common/audit`) est le **premier maillon** de
l'API. Il trace donc aussi les requêtes **refusées** avant d'atteindre un contrôleur.

| Inclus | Exclus |
|---|---|
| `/users`, `/planning`, `/formulaire`, `/admin` | référentiels, régions, configuration publique |
| `/service/geoloc`, `/service/coordinates`, `/service/isochrone`, `/service/listTelUser` | sondes `/health/*`, `/service/alive` |
| refus 401 (nigend inconnu, requête hors reverse-proxy), 403 (profil), 404 | routes marquées `@NoAudit()` (ex. rafraîchissement du tableau de bord) |

## Colonnes

| Colonne | Contenu |
|---|---|
| `id_log` | identifiant croissant : **filigrane** de l'extraction |
| `horodatage` | instant de la requête (UTC dans la vue d'export) |
| `ip` | adresse du client, vue à travers les proxys de confiance (`TRUST_PROXY`) : non falsifiable par un en-tête |
| `methode`, `route` | méthode HTTP et chemin, sans les paramètres de requête |
| `statut` | code HTTP de la réponse |
| `authentifie` | `false` : requête refusée avant authentification |
| `rio_user` | nigend de l'utilisateur. Pour une requête refusée : nigend **présenté** (non vérifié), utile aux enquêtes |
| `code_unite`, `role` | unité et profil de l'utilisateur authentifié |
| `institution` | `GN` |
| `duree_ms`, `taille_reponse` | durée de traitement, taille de la réponse en octets |
| `request_id` | identifiant de corrélation (en-tête `X-Request-Id`), commun au journal applicatif (`t_app_logs`) |
| `user_agent`, `hote`, `pid` | navigateur, serveur et processus de l'API |

Les colonnes historiques (`horodatage`, `ip`, `route`, `methode`, `statut`, `rio_user`,
`code_unite`, `role`, `institution`) sont inchangées. Les autres sont arrivées avec la
migration 2.9.0.

## Requête d'extraction (job Talend)

Le job lit la vue **`v_log_splunk_export`** (horodatage au format ISO 8601 UTC) par **filigrane
sur `id_log`**. Il conserve de son côté le dernier `id_log` transmis, dans une variable de contexte
persistée ou une table de suivi :

```sql
SELECT *
  FROM v_log_splunk_export
 WHERE id_log > :dernier_id_transmis
   AND horodatage < to_char((now() - interval '2 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 ORDER BY id_log
 LIMIT 50000;
```

- **Délai de sécurité de 2 minutes.** L'API écrit par lots toutes les 2 s, depuis plusieurs
  workers et serveurs. Ne lire que les lignes de plus de 2 minutes garantit que les lots en cours
  d'écriture sont validés avant d'avancer le filigrane.
- **`LIMIT`** : le job enchaîne les lots tant qu'il reste des lignes.
- **Fréquence conseillée** : toutes les 1 à 5 minutes.
- **Mise à jour du filigrane** : seulement après l'envoi réussi dans Splunk. En cas d'échec, le
  lot est relu au passage suivant, sans perte ; il peut y avoir un doublon si l'échec survient
  après l'envoi.

Enchaînement Talend indicatif :

```
tPostgresqlInput (requête ci-dessus, context.dernier_id)
  → tMap (1 ligne = 1 événement JSON ; _time = horodatage)
  → tSplunkEventCollector / tRESTClient vers le HTTP Event Collector (sourcetype « rni:audit », index au choix)
  → tJava / tPostgresqlOutput : mémorise le plus grand id_log transmis
```

Exemple d'événement :

```json
{
  "time": "2026-11-05T14:02:11.482Z",
  "sourcetype": "rni:audit",
  "event": {
    "id_log": 184223, "institution": "GN", "ip": "10.12.4.27", "methode": "GET",
    "route": "/rni/api/planning/timetable", "statut": 200, "authentifie": true,
    "rio_user": "200073", "code_unite": "10078", "role": "Référent",
    "duree_ms": 23, "taille_reponse": 48211, "request_id": "8f3c2b1e-…", "hote": "srv-rni-01", "pid": 31877
  }
}
```

## Droits et conservation

- **Compte de lecture Talend** : `SELECT` sur `v_log_splunk_export` uniquement.
- **Conservation en base** : `rni.splunk.retention_days` dans `t_param_app` (30 jours par défaut).
  La purge horaire de l'API ne s'exécute que sur un processus à la fois. Garder une durée nettement
  supérieure à l'intervalle du job, pour pouvoir rattraper un arrêt prolongé de Talend.
- **Indisponibilité de la base** : l'API garde jusqu'à 20 000 lignes en mémoire et les réécrit au
  retour de la base, ce qui est journalisé. Au-delà, une erreur indique le nombre de lignes perdues.

## Vérifications

```sql
-- Dernières lignes écrites
SELECT * FROM v_log_splunk_export ORDER BY id_log DESC LIMIT 20;
-- Refus du jour (sécurité)
SELECT statut, count(*) FROM t_admin_log_splunk
 WHERE horodatage >= current_date AND statut IN (401, 403) GROUP BY statut;
-- Retard de l'export : comparer max(id_log) au filigrane mémorisé par Talend
SELECT max(id_log) FROM t_admin_log_splunk;
```
