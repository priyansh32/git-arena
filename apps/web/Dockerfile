FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_BASE_URL
ARG VITE_WS_BASE_URL

ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_BASE_URL=$VITE_WS_BASE_URL

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

RUN npm run build -w @gitarena/shared
RUN npm run build -w @gitarena/web


FROM nginx:alpine AS runner

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]