# Upstream fixes

Fixes for Path of Building bugs that upstream has not merged yet. `src/` stays exactly as upstream ships it: before
the engine starts, `pob2.patches` copies each patched file from `src/` into `.patched/`, applies these patches to
the copy, and records a hash of the original. The engine's boot (`engine/pobapi/boot.lua`) loads the patched copy
in place of the original, and ignores it when the original in `src/` has changed since (after an upstream update),
so a stale copy never masks new upstream code. Regenerate by restarting the engine, or run:

```bash
uv run --directory python python -m pob2.patches
```

A patch that no longer applies (upstream changed those lines or fixed the bug) is skipped with a warning; delete it
once upstream has the fix.

| Patch | Bug |
|---|---|
| `poe2/0001-Fix-Fist-of-War-…` | Fist of War, Ancestral Empowerment and Ancestral Call wrote their damage multiplier to the wrong output table, so slam builds lost the whole ancestral boost (about 24% on a Supercharged Slam build) |
| `poe2/0002-Fix-Node-Power-…` | Node Power cached one score per modKey, giving nodes inside a radius jewel or on a weapon set another node's score |
| `poe2/0003-Fix-the-Trader-…` | The trader looked up `recipes` instead of `recipe`, so every Megalomaniac listing scored as no change |

| `poe2/0004-Do-not-treat-Sceptres-…` | A what-if with a Sceptre in Weapon 1 dropped the off hand (PoB treats weapon types missing from `data.weaponTypeInfo` as two-handed), so swapping a Sceptre for an identical one cost a spell build its Focus: about half its damage on a Threaded Light build |

Patches 0001-0003 come from [PoB Redux](https://github.com/pobredux/pob-redux) (`patches/poe2/`), MIT licence,
Copyright (c) 2026 Judd.
