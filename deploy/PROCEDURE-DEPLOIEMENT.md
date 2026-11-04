# Procédure de déploiement RNI

## Prérequis serveur

- Node.js 22, pm2 (`npm i -g pm2`), Nginx, rsync.
- PostgreSQL 16 (extension `btree_gist` disponible — paquet `postgresql-contrib`).
- Certificat d'autorité interne pour les appels HTTPS sortants : `NODE_EXTRA_CA_CERTS`.
- Reverse-proxy SSO en amont injectant les en-têtes `nigend`, `cn`, `title`, `codeunite`, `lib_region`
  (et les écrasant systématiquement s'ils sont fournis par le navigateur).

## 1. Base de données (première installation)

```bash
psql -h <hôte> -U <admin> -c "CREATE DATABASE rni"
psql -h <hôte> -U <admin> -d rni -f apps/api/db/init/01-schema.sql
psql -h <hôte> -U <admin> -d rni -f apps/api/db/init/02-referentiels.sql
psql -h <hôte> -U <admin> -d rni -f apps/api/db/init/03-param-app.sql
# Adapter puis appliquer le paramétrage de l'environnement (URLs, jetons, permanence GIGN…)
psql -h <hôte> -U <admin> -d rni -f apps/api/db/env/param-app.template.sql
```

Les tables `ref_unite`, `rpsi_personnel` (et `lien_departement_region` si besoin) sont alimentées par
le flux RH RPSI. **Ne jamais exécuter `db/dev/90-seed-dev.sql` hors développement.**

## 2. Fichier d'environnement de l'API

`/srv/nodejs/rni/.env` (non versionné, conservé entre deux déploiements) :

```dotenv
NODE_ENV=production
APP_PORT=8096
API_PREFIX=rni/api
PG_HOST=...
PG_PORT=5432
PG_USER=...
PG_PASSWORD=...
PG_DATABASE=rni
PG_SSL=true
```

`RNI_MOCK_AUTH` est refusé en production (l'API ne démarre pas) ; `RNI_MOCK_EXTERNAL` vaut `false` par défaut.

## 3. Construction des artefacts

```bash
pnpm install --frozen-lockfile
pnpm release          # → release/api (API autonome + node_modules de prod) et release/web (client)
```

## 4. Installation

```bash
rsync -a release/ deploy/ user@serveur:/tmp/rni-release/
ssh user@serveur 'sudo /tmp/rni-release/install.sh /tmp/rni-release'
```

Le script sauvegarde la version courante dans `/var/backups/rni-api`, synchronise l'API dans
`/srv/nodejs/rni` et le client dans `/srv/nginx/rni`, redémarre `pm2 rni-api` puis exécute le test de vie.

## 5. Vérifications

- `https://<hôte>/rni/testvie` : API, base, Facade, GEOLOC, REMOP au vert.
- `pm2 logs rni-api`.

## Retour arrière

```bash
pm2 stop rni-api
tar -xzf /var/backups/rni-api/rni-api-<horodatage>.tgz -C /srv/nodejs/rni
pm2 restart rni-api
```
