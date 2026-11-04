#!/usr/bin/env bash
# Installation / mise à jour de RNI sur le serveur (exécuté par la CI après rsync des artefacts).
#   API    : /srv/nodejs/rni/releases/<horodatage>, lien /srv/nodejs/rni/current (service systemd rni-api)
#   Client : /srv/nginx/rni/releases/<horodatage>, lien /srv/nginx/rni/current
# Bascule atomique par lien symbolique ; retour arrière : deploy/rollback.sh.
# Les artefacts sont produits par `pnpm release` (dossier release/).
set -euo pipefail

RELEASE_DIR="${1:-/tmp/rni-release}"
API_ROOT=/srv/nodejs/rni
WEB_ROOT=/srv/nginx/rni
KEEP=5
STAMP=$(date +%Y%m%d-%H%M%S)
HERE="$(cd "$(dirname "$0")" && pwd)"
HEALTH="http://127.0.0.1:${APP_PORT:-8096}/rni/api/health/ready"

[ -f /etc/rni/rni-api.env ] || { echo "✗ /etc/rni/rni-api.env absent (modèle : deploy/rni-api.env.example)"; exit 1; }
id rni >/dev/null 2>&1 || useradd --system --home-dir "$API_ROOT" --shell /usr/sbin/nologin rni
mkdir -p "$API_ROOT/releases" "$WEB_ROOT/releases"

echo "→ Copie de la version $STAMP"
rsync -a "$RELEASE_DIR/api/" "$API_ROOT/releases/$STAMP/"
rsync -a "$RELEASE_DIR/web/" "$WEB_ROOT/releases/$STAMP/"
chown -R root:rni "$API_ROOT/releases/$STAMP"
chmod -R o-rwx "$API_ROOT/releases/$STAMP"

echo "→ Migrations du schéma (verrou PostgreSQL : sans risque si une autre instance démarre)"
( cd "$API_ROOT/releases/$STAMP" && set -a && . /etc/rni/rni-api.env && set +a && NODE_ENV=production runuser -u rni -- node dist/migrate.js )

# Ancienne installation pm2 : arrêt et suppression (une seule fois)
if command -v pm2 >/dev/null 2>&1 && pm2 describe rni-api >/dev/null 2>&1; then
  echo "→ Retrait de pm2 (remplacé par systemd)"
  pm2 delete rni-api && pm2 save --force
fi

install -d "$API_ROOT/bin" && install -m 0755 "$HERE/rollback.sh" "$API_ROOT/bin/rollback.sh"

echo "→ Service systemd"
install -m 0644 "$HERE/rni-api.service" /etc/systemd/system/rni-api.service
systemctl daemon-reload
systemctl enable rni-api >/dev/null

PREVIOUS=$(readlink -f "$API_ROOT/current" 2>/dev/null || true)
ln -sfn "$API_ROOT/releases/$STAMP" "$API_ROOT/current.tmp" && mv -T "$API_ROOT/current.tmp" "$API_ROOT/current"
if systemctl is-active --quiet rni-api; then
  echo "→ Redémarrage progressif (sans interruption)"
  systemctl reload rni-api
else
  echo "→ Démarrage"
  systemctl start rni-api
fi

echo "→ Test de disponibilité"
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH" >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done
if [ -z "${OK:-}" ]; then
  echo "✗ L'API ne répond pas : retour à la version précédente"
  if [ -n "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$API_ROOT/current.tmp" && mv -T "$API_ROOT/current.tmp" "$API_ROOT/current"
    systemctl restart rni-api
  fi
  journalctl -u rni-api -n 50 --no-pager || true
  exit 1
fi

echo "→ Client (bascule atomique)"
ln -sfn "$WEB_ROOT/releases/$STAMP" "$WEB_ROOT/current.tmp" && mv -T "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"

echo "→ Nettoyage (conservation des $KEEP dernières versions)"
for root in "$API_ROOT" "$WEB_ROOT"; do
  ls -1dt "$root"/releases/*/ 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf
done
echo "✔ RNI $STAMP déployé"
