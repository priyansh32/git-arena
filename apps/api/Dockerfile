FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

RUN npm run build -w @gitarena/shared && npm run build -w @gitarena/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache docker-cli kubectl util-linux

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci --omit=dev --workspace @gitarena/api --workspace @gitarena/shared --include-workspace-root=false

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/scenarios ./apps/api/scenarios
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

EXPOSE 3001
CMD ["node", "apps/api/dist/server.js"]
