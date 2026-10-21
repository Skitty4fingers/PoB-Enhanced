# PoB-Enhanced

**Path of Building 2 for Path of Exile 2, as a self-hosted web app.** It runs the unmodified Path of Building
calculation engine in a Docker container and adds a browser UI, build advisors, a REST API and an MCP server for
AI agents.

**[Website](https://skitty4fingers.github.io/PoB-Enhanced/) · [Deployment guide](https://skitty4fingers.github.io/PoB-Enhanced/deploy.html) · [Run it](#run-it)**

![Passive tree with the advisor](docs/images/tree-advisor.png)

Everything below is measured by PoB's own calculator in **your** build, for **your** Config tab settings. The app's
**Help** tab (or the **?** button) walks through every tool.

## Features

<img src="docs/images/summary-card.png" alt="Build summary card" width="260" align="right">

**Build summary.** The sidebar leads with **DPS** and **EHP**, then only the resources your character uses: Mana,
Spirit, Rage or Runic Ward, each with net regen against what the main skill spends. It recalculates after every
change (yours or an AI agent's), shows how much the last change moved DPS and EHP, and breaks down defences,
resistances and Spirit reservations on hover.

**Build check.** A list of what is wrong with the build, worst first, each with a fix: uncapped resistances, unspent
points, a main skill with few supports, unmet requirements, Spirit, empty slots, mana sustain.

**Undo everything, keep your builds.** Undo/redo and a history (with named checkpoints) cover every change, including
ones an AI agent makes. The current build is saved automatically and comes back after a restart; **Builds** keeps
named copies.

**Passive tree**
- The game's own PoE2 tree artwork: node icons, frames, socketed jewels, class and ascendancy art, curved orbits.
- Tree links in the official PoE2 planner format (`pathofexile2.com/game/passive-skill-tree/...`), including
  weapon-set and attribute choices.
- **Advisor**: where your next passive point should go (with the path), which point to refund and move, and which
  +5 attribute nodes to switch, with reasons that respect your gear and gem attribute requirements.

**Upgrades**
- **Check before you buy**: paste any item for an upgrade / sidegrade / downgrade verdict across every damage skill,
  with warnings for lost totems, Spirit shortfalls, attribute requirements and skills the swap removes.
- **Gear and jewels**: what each item and each mod is worth (dead mods flagged), what to look for on a replacement,
  how much room for improvement each slot has, and a weighted pathofexile.com trade search per slot.
- **Design best rare**: builds the best rare for a slot from the real mod pool (top tiers at your item level, one
  mod per family), each mod measured in your build, with a trade search for items like it.
- **Unique jewels per socket**: every unique jewel and variant tried in each of your sockets (Prism of Belief for
  your main skill, Megalomaniac's best notables, radius jewels on the nodes around that socket), with prices.
- **Sockets**: what each rune, soul core and idol is worth and the best legal replacement per socket, respecting
  corruption, level, per-item and character-wide limits (such as Ancient Augment). **Build plan** orders the swaps
  and measures them together, including paired swaps that free a limit.
- **Gems**: what each support is worth, the best replacement for the weakest support in each skill, gem level and
  quality upgrades, and problems like disabled or harmful supports. One click applies a suggestion.
- **Shop**: every unique that fits a slot, measured in your build, with poe.ninja prices, a budget filter and
  "best value for money".

**Spirit and totems.** PoB reports totem damage per totem and doesn't model Ancestral Bond's Spirit cost per totem.
PoB-Enhanced tracks your Spirit budget and the totems you can actually keep up (including totem limit bonuses that
Spell Totem's data hides), and every advisor uses **DPS across all totems**. A weapon that costs you totems shows up
as a downgrade.

![Check before you buy](docs/images/check-item.png)

**Compare with any build.** Paste a ladder character, a guide's PoB link or an older version of yours: DPS, EHP and
stats side by side, items per slot, skills and supports, notables only one of you takes, config differences, and
one-click copy of their tree, config or any item (check it in your build first).

**Build guides.** Upload a guide's PoE2 BuildPlanner `.build` file (Maxroll and the in-game planner export these)
to see missing and extra passives, skill and support gaps, gear notes, and the guide's notables ranked by gain per
point. The guide's untaken nodes are outlined on the tree.

**Your character, kept in sync.** Import a share code, a pobb.in / pastebin / poe.ninja / Maxroll / poe2db / Rentry
link, or a **poe.ninja character page** (ladder or profile). The **Update** button re-imports it later and keeps your
Config settings. Item art (GGG's official icons, via poe.ninja) shows on items, slots and uniques.

**Search everything.** Ctrl+K jumps to any tab, command, passive (the tree centres on it), item, gem, config option
or stat.

**Upstream fixes.** Path of Building bugs that change the numbers, such as slam builds losing the whole Fist of War
boost, are fixed by small patches applied to copies of the affected files at start-up; `src/` stays exactly as
upstream ships it ([patches/](patches/README.md)).

**AI agents (MCP).** About 60 tools let Claude or any MCP client load, inspect, what-if and edit builds, using the
same advisors as the UI, plus a PoE2 knowledge library (points per level, gem tiers, Spirit, caps) from
[PoB Redux](https://github.com/pobredux/pob-redux). The web UI and an agent share one live build, and everything an
agent does can be undone.

| Upgrades: gear | Sockets | Shop |
|---|---|---|
| ![Gear advice](docs/images/upgrades-gear.png) | ![Socket optimiser](docs/images/sockets.png) | ![Shop](docs/images/shop.png) |

| Guide | Help |
|---|---|
| ![Guide comparison](docs/images/guide.png) | ![In-app help](docs/images/help.png) |

## Run it

You need [Docker](https://docs.docker.com/get-docker/). Then open **http://localhost:8080**. The
[deployment guide](https://skitty4fingers.github.io/PoB-Enhanced/deploy.html) has step-by-step instructions for
Docker Desktop, Compose, TrueNAS, Unraid, Synology/Portainer, Tailscale and running without Docker, plus
troubleshooting.

### Option 1: prebuilt image

```bash
docker run -d --name pob-enhanced --restart unless-stopped -p 8080:8080 -v pob2-data:/data ghcr.io/skitty4fingers/pob-enhanced:latest
```

Or with Compose (also handles updates):

```bash
curl -O https://raw.githubusercontent.com/Skitty4fingers/PoB-Enhanced/main/compose.image.yml
docker compose -f compose.image.yml up -d
docker compose -f compose.image.yml pull && docker compose -f compose.image.yml up -d   # update
```

### Option 2: build from source

```bash
git clone https://github.com/Skitty4fingers/PoB-Enhanced.git
cd PoB-Enhanced
docker compose -f compose.enhanced.yml up -d --build
```

The first build takes a few minutes (it compiles LuaJIT and the web UI). To update: `git pull`, then run the same
command again.

### Option 3: NAS / home server (TrueNAS SCALE, Unraid, Portainer, ...)

Create a custom app / container:

| Setting | Value |
|---|---|
| Image | `ghcr.io/skitty4fingers/pob-enhanced:latest` |
| Port | container `8080` → any host port |
| Environment | `POB2_ALLOWED_HOSTS` = the hostname/IP you browse to, e.g. `nas,192.168.1.20` (needed for MCP) |
| Storage | a host path or volume mounted at `/data` (current build, saved builds, item art) |

### Option 4: without Docker (Linux / macOS / WSL)

```bash
scripts/setup-engine.sh                 # builds LuaJIT + lua-utf8, installs Python deps, builds the web UI
export PATH="$HOME/.local/bin:$PATH"
uv run --directory python pob2-web      # http://127.0.0.1:8080
```

Requires Python 3.10+, [uv](https://docs.astral.sh/uv/) and Node 22+. The PoE2 tree artwork is already in
`tree-art/`. Details: [docs/enhanced.md](docs/enhanced.md).

## Use it

1. **Import** your character: paste a PoB share code, or your poe.ninja character URL
   (`https://poe.ninja/poe2/profile/<account>/<league>/character/<name>`). Press **Update** whenever your character
   changes.
2. **Tree**: follow the advisor's NEXT and MOVE markers, or hover any node for its stats and what-if deltas.
3. **Upgrades**: start with **Check item** before buying anything, then work through Gear, Jewels, Sockets, Gems
   and Shop.
4. **Guide**: upload a guide's `.build` file to see how far you are from it.
5. **Help**: the in-app guide explains every tab, the summary card and the limits of the numbers.

### Connect an AI agent

```bash
claude mcp add --transport http pob2 http://localhost:8080/mcp
```

For another machine, set `POB2_ALLOWED_HOSTS` to the hostname you use and connect to `http://<host>:8080/mcp`.
The tools are listed in [docs/enhanced.md](docs/enhanced.md#connecting-ai-agents-mcp).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `POB2_PORT` | `8080` | Host port (Compose files) |
| `POB2_BIND` | `127.0.0.1` | Host address to listen on (Compose files). `0.0.0.0` makes it reachable from your network |
| `POB2_ALLOWED_HOSTS` | (none) | Extra hostnames accepted by `/mcp`, comma-separated. localhost always works |
| `POB2_IMAGE` | `ghcr.io/skitty4fingers/pob-enhanced:latest` | Image for `compose.image.yml` |
| `POB2_DATA` | `/data` in Docker, else `~/.local/share/pob2` or `%LOCALAPPDATA%\pob2` | Current build, saved builds and item art |

Put them in a `.env` file next to the Compose file (see `.env.example`).

**Security:** there is no login. Anyone who can reach the port can view and change the loaded build. Keep it on
`127.0.0.1`, a trusted home network, or your tailnet (`compose.tailscale.yml` serves it over Tailscale with HTTPS
and no open ports).

## Development

| Path | What |
|---|---|
| `src/`, `runtime/`, `spec/` | Upstream Path of Building 2, unmodified (kept rebasable on upstream) |
| `engine/` | Headless LuaJIT worker: JSON-RPC handlers including the advisors, budget and tree links |
| `python/` | `pob2` package: engine bridge, REST API (FastAPI), MCP server, CLI, poe.ninja/trade helpers |
| `web/` | React 19 + Vite + Tailwind UI |
| `tree-art/` | PoE2 tree artwork as WebP. Regenerate with `scripts/build_tree_art.py` after a tree data update |
| `patches/` | Fixes for upstream PoB bugs, applied to copies in `.patched/` at engine start (see its README) |
| `library/` | PoE2 knowledge files served to agents by the `library` MCP tool (from PoB Redux, MIT) |
| `site/` | GitHub Pages project site (published by `.github/workflows/pages.yml`, screenshots from `docs/images/`) |

```bash
cd python && uv run pytest && uv run ruff check src tests     # tests (engine tests need LuaJIT, or run in Docker)
cd web && npm ci && npm run build                             # web UI into python/src/pob2/web/static
```

More in [docs/enhanced.md](docs/enhanced.md) (architecture, REST API, MCP tools, worker protocol).

## Credits and licence

PoB-Enhanced is built on [Path of Building Community (PoE2)](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2),
whose calculation engine does all the maths. Several ideas, the three upstream patches and the knowledge library come
from [PoB Redux](https://github.com/pobredux/pob-redux) (MIT). Prices and character data come from [poe.ninja](https://poe.ninja);
trade searches open on [pathofexile.com](https://www.pathofexile.com/trade2). Game data and artwork © Grinding Gear
Games. This project is not affiliated with or endorsed by Grinding Gear Games, Path of Building Community or
poe.ninja.

Licensed under the [MIT licence](LICENSE.md), like Path of Building.
