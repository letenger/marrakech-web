# Fly.io deploy image for the Marrakech API.
#
# Design note: this project has NO compile step — the engine is consumed as TS
# source (packages/engine exports ./src/index.ts) and the server runs under tsx.
# So we don't build to dist/; we ship the source and run it with tsx, exactly
# like `npm start` does locally. Simpler and matches the real architecture.
#
# Build context must be the REPO ROOT (not apps/api), because npm workspaces and
# the @marrakech/engine symlink span the whole repo:
#   fly deploy --dockerfile apps/api/Dockerfile   (run from repo root)
FROM node:22-slim

WORKDIR /app

# 1) Install deps first (better layer caching). Copy every workspace manifest so
#    `npm ci` sees the full workspace graph and links @marrakech/engine.
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/engine/package.json ./packages/engine/
RUN npm ci

# 2) Copy the source the server actually needs: the API and the engine it imports.
COPY apps/api ./apps/api
COPY packages/engine ./packages/engine

# 3) Run from the API workspace. `npm start` is `tsx src/server.ts`.
WORKDIR /app/apps/api

# Fly sets PORT (fly.toml [env]); server.ts reads process.env.PORT (default 8787).
EXPOSE 3000
CMD ["npm", "start"]
