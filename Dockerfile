# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG PUBLIC_API_BASE_URL=/api
ENV PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL}

# Origin baked into canonical tags, the RSS feed and the sitemap. Left unset it
# falls back to the production default in astro.config.mjs; set it when
# building for a staging hostname so those URLs don't all point at production.
ARG PUBLIC_SITE_ORIGIN=""
ENV PUBLIC_SITE_ORIGIN=${PUBLIC_SITE_ORIGIN}

RUN npm run check
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
