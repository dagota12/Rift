# Multi-stage Dockerfile for React Canvas Client
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Build arguments for WebSocket target URL
ARG VITE_WS_URL
ENV VITE_WS_URL=$VITE_WS_URL

# Cache dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build production bundle
COPY . .
RUN bun run build

# Production web server
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
