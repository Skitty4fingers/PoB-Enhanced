# Game knowledge library

Path of Exile 2 facts that PoB does not carry (passive points per level, gem tier by character level, Spirit, caps,
keystones, runes and augments, and guard rails for judging a change). AI agents read them through the MCP `library`
tool; people can read them here.

The files in [poe2/](poe2/README.md) come from [PoB Redux](https://github.com/pobredux/pob-redux) (`library/poe2/`),
MIT licence, Copyright (c) 2026 Judd. They are copied unchanged so they can be refreshed from upstream; each file lists
its own sources. They were written against PoE2 0.5.5 and need re-checking at 1.0 (December 2026).

## Tool names

The files mention PoB Redux's tools. In PoB-Enhanced the same jobs are done by:

| In the files | PoB-Enhanced MCP tool |
|---|---|
| `set_level`, `select_class`, `get_character` | `set_character`, `get_build_overview` |
| `get_sidebar`, `get_stats`, `build_summary` | `get_build_overview`, `get_stats`, `get_budget` |
| `get_tree_state`, `node_info`, `search_tree` | `get_passive_tree`, `search_passives` |
| `get_items`, `get_skills` | `list_items`, `list_skills` |
| `sanity_check` | `build_check` |
| `tree_suggest`, `path_plan`, `tree_power` | `get_advice`, `compare_passives` |
| `optimise_gear`, `craft_rare` | `design_rare`, `gear_advice` |
| `suggest_unique_jewels` | `shopping_advice` (jewels), `suggest_unique_jewels` |
| `checkpoint`, `rollback` | `checkpoint`, `restore_history`, `undo` |
| `set_config` | `set_config` |
