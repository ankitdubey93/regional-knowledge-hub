# One image: the API (run with tsx) and the built web app it serves (P5d). Build from the repo root:
#   docker build -f server/Dockerfile -t compliance-hub-api:local .
FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build -w client

FROM node:22.23.2-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=5191 WEB_DIST_DIR=/app/client/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# --ignore-scripts: the only install scripts are esbuild's binary check (its nested 0.18.20 copy, pulled in by drizzle-kit, fails it); esbuild runs from its @esbuild/<platform> package without it.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY shared ./shared
COPY server ./server
COPY docs ./docs
COPY --from=build /app/client/dist ./client/dist
USER node
WORKDIR /app/server
EXPOSE 5191
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
