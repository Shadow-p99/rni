#!/usr/bin/env bash
# Installation / mise à jour de RNI sur le serveur (exécuté par la CI après rsync des artefacts).
#   API    : /srv/nodejs/rni      (pm2 « rni-api »)
#   Client : /srv/nginx/rni
# Les artefacts sont produits par `pnpm release` (dossier release/).
set -euo pipefail

RELEASE_DIR="${1:-/tmp/rni-release}"
API_DIR=/srv/nodejs/rni
WEB_DIR=/srv/nginx/rni
BACKUP_DIR=/var/backups/rni-api
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR" "$API_DIR" "$WEB_DIR"

echo "→ Sauvegarde de la version courante"
if [ -d "$API_DIR/dist" ]; then
  tar -czf "$BACKUP_DIR/rni-api-$STAMP.tgz" -C "$API_DIR" --exclude=node_modules dist package.json
fi

echo "→ API"
rsync -a --delete --exclude .env "$RELEASE_DIR/api/" "$API_DIR/"

echo "→ Client"
rsync -a --delete "$RELEASE_DIR/web/" "$WEB_DIR/"

echo "→ Redémarrage pm2"
if pm2 describe rni-api >/dev/null 2>&1; then
  pm2 restart rni-api --update-env
else
  pm2 start "$(dirname "$0")/ecosystem.config.cjs"
fi
pm2 save

echo "→ Test de vie"
sleep 3
curl -fsS http://127.0.0.1:8096/rni/api/service/alive && echo
