FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN mkdir -p /out && go build -o /out/server ./cmd/server

FROM alpine:latest
WORKDIR /app
COPY --from=builder /out/server ./server
EXPOSE 8080
CMD ["./server"]
