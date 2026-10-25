FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci --include=dev; \
    else npm ci --include=dev; fi
COPY vite.config.mjs ./
COPY web ./web
COPY assets ./assets
RUN npm run build && chmod -R a+rX dist

FROM rust:1.90.0-bookworm AS rust
WORKDIR /build
# The pinned builder already contains Rust 1.90.0. Editor-only rustfmt/clippy
# components from rust-toolchain.toml are not needed to compile this image.
ENV CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=/cargo-target
ARG TARGETARCH
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY assets ./assets
# Keep compiler executables in a dedicated build cache, separate from source
# layers. Lock concurrent access and separate architectures. Copy the final
# binary out in this RUN: cache mounts are not part of the resulting image.
RUN --mount=type=secret,id=build_ca \
    --mount=type=cache,id=research-tool-rust-1.90-${TARGETARCH}-v1,target=/cargo-target,sharing=locked \
    set -eu; \
    rustc --version; \
    if [ -f /run/secrets/build_ca ]; then \
      export SSL_CERT_FILE=/run/secrets/build_ca CARGO_HTTP_CAINFO=/run/secrets/build_ca; \
    fi; \
    cargo build --locked --release; \
    install -D -m 0755 /cargo-target/release/research-tool /out/research-tool

FROM debian:bookworm-slim
RUN apt-get update && apt-get install --yes --no-install-recommends ca-certificates poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 research \
    && mkdir -p /app/dist /data && chown -R research:research /app /data
WORKDIR /app
COPY --from=rust /out/research-tool /app/research-tool
COPY --from=web /build/dist /app/dist
USER research
ENV RESEARCH_BIND=0.0.0.0:3000 RESEARCH_DB_PATH=/data/research.sqlite3 RESEARCH_SECURE_COOKIES=true
EXPOSE 3000
CMD ["/app/research-tool"]
