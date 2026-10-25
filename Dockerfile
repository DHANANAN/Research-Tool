FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci --include=dev; \
    else npm ci --include=dev; fi
COPY web ./web
COPY assets ./assets
RUN npm run build && chmod -R a+rX dist

FROM rust:1.90.0-bookworm AS rust
WORKDIR /build
ENV CARGO_BUILD_JOBS=2
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src ./src
COPY assets ./assets
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then \
      SSL_CERT_FILE=/run/secrets/build_ca CARGO_HTTP_CAINFO=/run/secrets/build_ca cargo build --locked --release; \
    else cargo build --locked --release; fi

FROM debian:bookworm-slim
RUN apt-get update && apt-get install --yes --no-install-recommends ca-certificates poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 research \
    && mkdir -p /app/dist /data && chown -R research:research /app /data
WORKDIR /app
COPY --from=rust /build/target/release/research-tool /app/research-tool
COPY --from=web /build/dist /app/dist
USER research
ENV RESEARCH_BIND=0.0.0.0:3000 RESEARCH_DB_PATH=/data/research.sqlite3 RESEARCH_SECURE_COOKIES=true
EXPOSE 3000
CMD ["/app/research-tool"]
