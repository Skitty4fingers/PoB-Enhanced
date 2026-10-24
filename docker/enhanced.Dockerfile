# PoB-Enhanced: headless engine + REST API + web UI + MCP endpoint.
#   docker build -f docker/enhanced.Dockerfile -t pob2-enhanced .
#   docker run --rm -p 8080:8080 pob2-enhanced              # web UI + REST + MCP at /mcp
#   docker run --rm -i pob2-enhanced pob2-mcp               # MCP over stdio
ARG LUAJIT_COMMIT=2460b3ff93a1c955de3d62cfc825de7d68dc272e

FROM node:22-slim AS web
WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM debian:bookworm-slim AS luajit
ARG LUAJIT_COMMIT
RUN apt-get update && apt-get install -y --no-install-recommends build-essential git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/LuaJIT/LuaJIT /tmp/luajit && cd /tmp/luajit && git checkout "$LUAJIT_COMMIT" \
    && make -j"$(nproc)" PREFIX=/opt/luajit && make install PREFIX=/opt/luajit \
    && ln -sf "$(ls /opt/luajit/bin/luajit-2.1.* | tail -1)" /opt/luajit/bin/luajit
RUN git clone --depth 1 --branch 0.1.6 https://github.com/starwing/luautf8 /tmp/luautf8 \
    && mkdir -p /opt/luajit/lib/lua/5.1 \
    && cc -O2 -fPIC -shared -I/opt/luajit/include/luajit-2.1 /tmp/luautf8/lutf8lib.c -o /opt/luajit/lib/lua/5.1/lua-utf8.so

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY --from=luajit /opt/luajit /opt/luajit
ENV PATH="/opt/luajit/bin:/app/python/.venv/bin:$PATH" \
    POB2_ROOT=/app \
    POB2_DATA=/data \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy
RUN useradd --create-home pob && mkdir /data && chown pob /data
WORKDIR /app
COPY python/pyproject.toml python/uv.lock python/README.md python/
RUN uv sync --directory python --frozen --no-dev --no-install-project
COPY --chown=pob src/ src/
# Upstream PoB version, reported at /api/version.
COPY manifest.xml ./
# PoE2 tree artwork, pre-converted to WebP (regenerate with scripts/build_tree_art.py when TreeData changes).
COPY tree-art/ tree-art/
COPY runtime/lua/ runtime/lua/
COPY engine/ engine/
COPY python/ python/
COPY --from=web /repo/python/src/pob2/web/static python/src/pob2/web/static
RUN uv sync --directory python --frozen --no-dev
# Upstream PoB fixes (patches/README.md), applied to copies in .patched/; src/ stays as upstream ships it.
COPY patches/ patches/
COPY library/ library/
RUN python -m pob2.patches
# Build identity, shown in the web UI header and at /api/version. scripts/build-image.sh fills these in;
# declared last so a new commit doesn't invalidate the cached layers above.
ARG GIT_COMMIT=""
ARG BUILD_TIME=""
ARG VERSION=""
ENV POB2_COMMIT=$GIT_COMMIT \
    POB2_BUILT=$BUILD_TIME
LABEL org.opencontainers.image.title="PoB2-Enhanced" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$GIT_COMMIT \
      org.opencontainers.image.created=$BUILD_TIME
USER pob
# The current build and saved builds; mount a volume here to keep them across container updates.
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health')"
CMD ["pob2-web", "--host", "0.0.0.0", "--port", "8080"]
