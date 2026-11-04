#!/usr/bin/env bash
# Retour à la version précédente (ou à celle passée en argument : horodatage d'un dossier releases/).
# Les migrations sont additives et idempotentes : le schéma n'est pas rétrogradé.
set -euo pipefail
API_ROOT=/srv/nodejs/rni
WEB_ROOT=/srv/nginx/rni
CURRENT=$(basename "$(readlink -f "$API_ROOT/current")")
TARGET="${1:-$(ls -1t "$API_ROOT/releases" | grep -vx "$CURRENT" | head -1)}"
[ -d "$API_ROOT/releases/$TARGET" ] || { echo "✗ Version inconnue : $TARGET"; ls -1t "$API_ROOT/releases"; exit 1; }
echo "→ $CURRENT → $TARGET"
for root in "$API_ROOT" "$WEB_ROOT"; do
  [ -d "$root/releases/$TARGET" ] && ln -sfn "$root/releases/$TARGET" "$root/current.tmp" && mv -T "$root/current.tmp" "$root/current"
done
systemctl reload rni-api
echo "✔ Version $TARGET active"
