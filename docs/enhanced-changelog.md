# PoB-Enhanced changelog

Versions of the enhanced layer (engine API, MCP server, REST API, web UI). The upstream Path of Building changes
are in `CHANGELOG.md`. The version number lives in `python/pyproject.toml`.

## 0.2.2 (2026-11-05)

- **Fixed: item checks dropped your off hand.** Putting a Sceptre in Weapon 1 in a what-if made PoB ignore the Focus (it
  treats weapon types missing from its table as two-handed), so checking a Sceptre against your own cost a spell build
  roughly half its damage, chaos resistance and Energy Shield, and every Sceptre verdict was too harsh. New upstream
  fix `patches/poe2/0004`. The patch loader now also covers files PoB loads with `require` (CalcSetup), which it
  silently skipped before.
- Explain: each mod line is measured on a parsed copy of the item with a control run, and flagged approximate when the
  copy doesn't reproduce the real item.
- **Why did this skill change?** Click a skill row in the item check to see the mod lines of the replaced item that carry
  its damage (what you lose), the new item's lines that bring some back, and the stats that moved (damage per hit by
  type, speed, crit). New `explain_item_change` MCP tool and `POST /api/items/explain`; the REST check now echoes the
  item text.
- Item check: replacing an item that grants a skill (Sacred Flame's Purity of Fire) no longer reports the skill as lost
  when the new item grants it too.
- **Jewel plan** (Jewels tab, `suggest_unique_jewels` -> `plan`): jewels are picked one after another and
  re-measured with the earlier picks in place (Heart of the Well then Prism of Belief is worth far more than each
  alone). Each unique is used once, a unique you already wear stays where it is, and Limited-to-1 uniques you wear are
  no longer suggested for other sockets.
- **Item-created jewel sockets** (e.g. gloves with Cadigan's Epiphany): listed on the Jewels tab and in `gear.slots`
  as `itemSocket`. Only rare or magic jewels fit them (PoB and the game refuse uniques), so no unique is suggested
  there, and the slot's trade search is for a rare jewel.
- Gem advice shows levels added by items and jewels (`effectiveLevel`, `bonusLevels`), e.g. Prism of Belief's
  "+3 to Level of all Grim Pillars Skills".
- Merged upstream Path of Building PoE2 `dev` up to bb52d6b36 (rune mods, gem quality breakdowns, radius jewel and
  crash fixes, Geofri's Sanctuary and Sunken Vessel, updated 0.5 tree data). The three earlier `patches/` still apply and are
  still needed.
- Tree artwork regenerated for upstream's padded texture sheets; `scripts/build_tree_art.py` reads the new
  `{x, y, w, h, layer}` coordinates and crops to them. The tiled tree background is gone, as in upstream.

## 0.2.1 (2026-11-05)

- **Best in shop** (Shop tab, `best_in_shop` MCP tool, `/api/gear/best-in-shop`): searches the trade site for what is
  actually listed (rares too) for the slots with most headroom, runs every listing through `check_item`, and keeps
  the real upgrades. The anonymous trade API refuses weighted-sum queries, so the weights become "at least N of the
  top mods", sampled from cheap to dear; PoB does the ranking.
- Every **Search trade** button (gear and jewel slots, uniques, jewel highlight, rare designer) now opens a window
  with live listings measured in the build, with "Open on trade site" as the fallback (`shop_search` MCP tool,
  `POST /api/gear/shop`).
- Seller details on every listing: account, character, online/AFK, how long ago it was listed, price type, stash
  tab and position, and a copy-whisper button.
- **Buy now only** filter (instant-buyout listings) on Best in shop and in the trade search window.
- Totem cap: "Your Totem Limit is doubled" now doubles the whole limit ((2 + 1) x 2 = 6 for Spell Totem with Unnamed
  Heartwood), not just the base.

## 0.2.0 (2026-10-24)

- Version tracking: the web UI header, `/api/version`, `/api/health` and the MCP server info report the version, git
  commit and build time. `scripts/build-image.sh` stamps images; `scripts/check-deployed.sh` compares a running
  server with the checkout.
- Advisor: normal points no longer route through weapon set nodes (the game refuses them). Steps the guide takes with
  weapon set points say so and are allocated as weapon set points.

## 0.1.0

- Headless engine, MCP server, REST API and web UI.
