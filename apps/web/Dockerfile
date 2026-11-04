# syntax=docker/dockerfile:1
# =============================================================================
# Client RNI (Angular) servi par Nginx, avec reverse-proxy /rni/api → API.
# Contexte de build : racine du monorepo.
#   docker build -f apps/web/Dockerfile -t rni-web .
# =============================================================================
ARG NODE_VERSION=22-alpine

# --- Build Angular -----------------------------------------------------------
FROM node:${NODE_VERSION} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
# Proxy d'entreprise : --build-arg HTTPS_PROXY=… ; autorité de certification interne (facultative) :
#   --secret id=ca_certs,src=/etc/ssl/certs/ca-interne.pem
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=secret,id=ca_certs,required=false \
    if [ -f /run/secrets/ca_certs ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_certs npm_config_cafile=/run/secrets/ca_certs; fi \
 && pnpm install --frozen-lockfile --filter @rni/web...

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @rni/shared build \
 && pnpm --filter @rni/web exec node scripts/check-output-names.mjs \
 && pnpm --filter @rni/web exec ng build --configuration production

# --- Nginx (non root, port 8080) ---------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Adresse de l'API vue depuis le conteneur (modèle Nginx, substitué au démarrage)
ENV API_UPSTREAM=http://api:8096 \
    PROXY_SHARED_SECRET= \
    CSP_EXTRA_SRC=
COPY apps/web/docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html/rni
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/rni/ >/dev/null || exit 1
