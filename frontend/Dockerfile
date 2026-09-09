# Multi-stage build: compile the Vite app, then serve it (and reverse-proxy
# /api to the backend container) with nginx.
#
# Build context for this Dockerfile is the PROJECT ROOT (see docker-compose.yml),
# not frontend/, so it can reach both frontend/ and deploy/.

FROM node:20-slim AS build
WORKDIR /app
COPY frontend/package.json ./
COPY frontend/package-lock.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.docker.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
