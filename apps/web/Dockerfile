FROM node:20-alpine
WORKDIR /app

ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_BASE_URL
ARG VITE_WS_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_BASE_URL=$VITE_WS_BASE_URL
ENV WEB_PORT=5173
ENV API_PORT=3001

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

RUN npm run build -w @gitarena/shared
RUN npm run build -w @gitarena/web

EXPOSE 5173
CMD ["sh", "-lc", "npm run preview -w @gitarena/web -- --host 0.0.0.0 --port ${WEB_PORT:-5173}"]
