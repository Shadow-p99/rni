# syntax=docker/dockerfile:1
# =============================================================================
# API RNI (NestJS) — image de production.
# Contexte de build : racine du monorepo.
#   docker build -f apps/api/Dockerfile -t rni-api .
# =============================================================================
ARG NODE_VERSION=22-alpine

# --- Dépendances et build ----------------------------------------------------
FROM node:${NODE_VERSION} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# Couche de dépendances : ne dépend que des manifestes (cache tant que le lockfile ne change pas)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# Proxy d'entreprise : --build-arg HTTPS_PROXY=… ; autorité de certification interne (facultative) :
#   --secret id=ca_certs,src=/etc/ssl/certs/ca-interne.pem
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=secret,id=ca_certs,required=false \
    if [ -f /run/secrets/ca_certs ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_certs npm_config_cafile=/run/secrets/ca_certs; fi \
 && pnpm install --frozen-lockfile --filter @rni/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @rni/shared build \
 && pnpm --filter @rni/api build \
 && pnpm --filter @rni/api deploy --prod --legacy /out

# --- Exécution ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
# Heure locale (créneaux Jour / Nuit, borne « jours glissants ») : Node applique TZ via ICU,
# sans paquet tzdata.
# Production : primaire node:cluster + WEB_CONCURRENCY worker(s) (redémarrage progressif sur SIGHUP).
# Un conteneur = un worker par défaut ; augmenter WEB_CONCURRENCY ou le nombre de réplicas.
ENV NODE_ENV=production \
    TZ=Europe/Paris \
    APP_PORT=8096 \
    API_PREFIX=rni/api \
    WEB_CONCURRENCY=1 \
    LOG_FORMAT=json
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8096
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${APP_PORT}/${API_PREFIX}/health/ready" >/dev/null || exit 1
STOPSIGNAL SIGTERM
# Migrations : `docker run … rni-api node dist/migrate.js` (ou MIGRATE_ON_START=true)
CMD ["node", "--enable-source-maps", "dist/main.js"]
