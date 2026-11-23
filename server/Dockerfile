# Multi-stage Dockerfile for Go Authoritative Game Server
FROM golang:alpine AS builder

WORKDIR /app

# Cache module downloads
COPY go.mod go.sum ./
RUN go mod download

# Build statically linked, stripped binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server

# Minimal production runtime image (< 15MB)
FROM alpine:latest

WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /out/server ./server

EXPOSE 8087
ENV PORT=8087

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8087/health || exit 1

CMD ["./server"]
