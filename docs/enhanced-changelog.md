# PoB2-Enhanced changelog

Versions of the enhanced layer (engine API, MCP server, REST API, web UI). The upstream Path of Building changes
are in `CHANGELOG.md`. The version number lives in `python/pyproject.toml`.

## Unreleased

- Merged upstream Path of Building PoE2 `dev` up to bb52d6b36 (rune mods, gem quality breakdowns, radius jewel and
  crash fixes, Geofri's Sanctuary and Sunken Vessel, updated 0.5 tree data). Our three `patches/` still apply and are
  still needed.
- Tree artwork regenerated for upstream's padded texture sheets; `scripts/build_tree_art.py` reads the new
  `{x, y, w, h, layer}` coordinates and crops to them. The tiled tree background is gone, as in upstream.

## 0.2.0 (2026-10-24)

- Version tracking: the web UI header, `/api/version`, `/api/health` and the MCP server info report the version, git
  commit and build time. `scripts/build-image.sh` stamps images; `scripts/check-deployed.sh` compares a running
  server with the checkout.
- Advisor: normal points no longer route through weapon set nodes (the game refuses them). Steps the guide takes with
  weapon set points say so and are allocated as weapon set points.

## 0.1.0

- Headless engine, MCP server, REST API and web UI.
