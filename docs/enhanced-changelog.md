# PoB2-Enhanced changelog

Versions of the enhanced layer (engine API, MCP server, REST API, web UI). The upstream Path of Building changes
are in `CHANGELOG.md`. The version number lives in `python/pyproject.toml`.

## 0.2.0 (2026-10-24)

- Version tracking: the web UI header, `/api/version`, `/api/health` and the MCP server info report the version, git
  commit and build time. `scripts/build-image.sh` stamps images; `scripts/check-deployed.sh` compares a running
  server with the checkout.
- Advisor: normal points no longer route through weapon set nodes (the game refuses them). Steps the guide takes with
  weapon set points say so and are allocated as weapon set points.

## 0.1.0

- Headless engine, MCP server, REST API and web UI.
