"""poe.ninja (PoE2) prices and characters, and pathofexile.com trade-site search links.

poe.ninja endpoints used (all public, JSON):
  /poe2/api/data/index-state                          leagues and build snapshot versions
  /poe2/api/economy/stash/current/item/overview       unique prices (primaryValue is in divine orbs)
  /poe2/api/builds/{version}/character                a ladder character's Path of Building export
  /poe2/api/profile/characters/{acc}/{league}/{name}/model/{n}   a profile character's export (n: cache-buster)
"""

from __future__ import annotations

import json
import re
import threading
import time
from typing import Any
from urllib.parse import quote, unquote

import httpx

NINJA = "https://poe.ninja"
TRADE = "https://www.pathofexile.com/trade2/search/poe2"
HEADERS = {"User-Agent": "PoB-Enhanced (+https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2)"}
UNIQUE_TYPES = ("UniqueWeapons", "UniqueArmours", "UniqueAccessories", "UniqueJewels", "UniqueFlasks", "UniqueCharms")
# Ladder page: /poe2/builds/<league>/character/<account>/<name>
# Profile page: /poe2/profile/<account>/<league>/character/<name>
CHARACTER_URL = re.compile(r"^https?://poe\.ninja/poe2/builds/([\w-]+)/character/([^/?#]+)/([^/?#]+)")
PROFILE_URL = re.compile(r"^https?://poe\.ninja/poe2/profile/([^/?#]+)/([\w-]+)/character/([^/?#]+)")

_cache: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def _get_json(url: str, ttl: float, params: dict[str, str] | None = None, timeout: float = 20.0) -> Any:
    key = url + json.dumps(params or {}, sort_keys=True)
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < ttl:
            return hit[1]
    resp = httpx.get(url, params=params, headers=HEADERS, timeout=timeout, follow_redirects=True)
    resp.raise_for_status()
    data = resp.json()
    with _lock:
        _cache[key] = (time.monotonic(), data)
    return data


def index_state() -> dict[str, Any]:
    return _get_json(f"{NINJA}/poe2/api/data/index-state", ttl=600)


def leagues() -> list[dict[str, Any]]:
    """Trade/economy leagues, current challenge leagues first."""
    return [
        {"name": lg["name"], "url": lg["url"], "hardcore": lg.get("hardcore", False)}
        for lg in index_state().get("economyLeagues", [])
    ]


def default_league() -> str | None:
    for lg in leagues():
        if not lg["hardcore"]:
            return lg["name"]
    return None


def league_from_slug(slug: str) -> str | None:
    state = index_state()
    for lg in state.get("economyLeagues", []) + state.get("buildLeagues", []) + state.get("snapshotVersions", []):
        if lg.get("url") == slug:
            return lg.get("name")
    return None


def unique_prices(league: str) -> dict[str, Any]:
    """{"rates": {"exalted": n, "chaos": n} per divine, "items": {name: {"divine", "listings", "baseType"}}}."""
    items: dict[str, dict[str, Any]] = {}
    rates: dict[str, float] = {}
    for kind in UNIQUE_TYPES:
        try:
            data = _get_json(
                f"{NINJA}/poe2/api/economy/stash/current/item/overview",
                ttl=1800,
                params={"league": league, "type": kind},
            )
        except httpx.HTTPError:
            continue
        rates = (data.get("core") or {}).get("rates") or rates
        for line in data.get("lines") or []:
            name = line.get("name")
            if not name or line.get("primaryValue") is None:
                continue
            entry = {
                "divine": line["primaryValue"],
                "listings": line.get("listingCount"),
                "baseType": line.get("baseType"),
            }
            # Several variants can share a name; keep the cheapest listing.
            if name not in items or entry["divine"] < items[name]["divine"]:
                items[name] = entry
    return {"rates": rates, "items": items}


def unique_icons(league: str) -> list[dict[str, Any]]:
    """Every unique's official icon from poe.ninja's economy data."""
    out: list[dict[str, Any]] = []
    for kind in UNIQUE_TYPES:
        try:
            data = _get_json(
                f"{NINJA}/poe2/api/economy/stash/current/item/overview",
                ttl=1800,
                params={"league": league, "type": kind},
            )
        except httpx.HTTPError:
            continue
        for line in data.get("lines") or []:
            out.append(
                {"name": line.get("name"), "baseType": line.get("baseType"), "icon": line.get("icon"), "unique": True}
            )
    return out


def _character_items(data: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for key in ("items", "flasks", "jewels"):
        for entry in data.get(key) or []:
            it = entry.get("itemData") or entry
            out.append(
                {
                    "name": it.get("name") or None,
                    "baseType": it.get("baseType") or it.get("typeLine"),
                    "icon": it.get("icon"),
                    "unique": it.get("frameType") in (3, 9),  # unique, relic
                }
            )
    return out


def character_art(link: str) -> list[dict[str, Any]]:
    """Icons of everything a poe.ninja character wears (uses the same cached request as character_code)."""
    parsed = parse_character_url(link)
    if not parsed:
        return []
    kind, slug, account, name = parsed
    if kind == "profile":
        path = f"/poe2/api/profile/characters/{quote(account)}/{quote(slug)}/{quote(name)}"
        data = _get_json(f"{NINJA}{path}/model/{int(time.time() // 60)}", ttl=60)
        return _character_items(data.get("charModel") or {})
    snapshot = next((s for s in index_state().get("snapshotVersions", []) if s.get("url") == slug), None)
    if not snapshot:
        return []
    data = _get_json(
        f"{NINJA}/poe2/api/builds/{snapshot['version']}/character",
        ttl=60,
        params={"account": account, "name": name, "overview": snapshot["snapshotName"], "timeMachine": ""},
    )
    return _character_items(data)


def format_price(divine: float, rates: dict[str, float]) -> str:
    if divine >= 1:
        return f"{divine:,.1f} div" if divine < 100 else f"{divine:,.0f} div"
    exalted = divine * (rates.get("exalted") or 0)
    return f"{exalted:,.0f} ex" if exalted else f"{divine:.2f} div"


def trade_url(league: str, query: dict[str, Any]) -> str:
    return f"{TRADE}/{quote(league)}?q={quote(json.dumps(query, separators=(',', ':')))}"


TRADE_API = "https://www.pathofexile.com/api/trade2"
_trade_lock = threading.Lock()
_trade_next = 0.0  # monotonic time before which no trade request may start
_MARKUP_PIPE = re.compile(r"\[[^\]|]*\|([^\]]*)\]")
_MARKUP = re.compile(r"\[([^\]]*)\]")


def _trade_request(method: str, url: str, **kwargs: Any) -> Any:
    """One polite trade-site request: serialised, spaced out, and backing off on 429 (Retry-After)."""
    global _trade_next
    for attempt in range(3):
        with _trade_lock:
            wait = _trade_next - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            resp = httpx.request(method, url, headers=HEADERS, timeout=25.0, **kwargs)
            delay = 1.5
            if resp.status_code == 429:
                delay = float(resp.headers.get("Retry-After", "10")) + 1
            _trade_next = time.monotonic() + delay
        if resp.status_code == 429 and attempt < 2:
            continue
        if resp.status_code >= 400:
            try:
                detail = resp.json()["error"]["message"]
            except Exception:  # noqa: BLE001 - not a trade-site error body
                detail = resp.text[:200]
            raise ValueError(f"Trade site said {resp.status_code}: {detail}")
        return resp.json()
    raise RuntimeError("trade site rate limit")


def anonymous_query(query: dict[str, Any], need: int, top: int = 8) -> dict[str, Any]:
    """The anonymous API refuses weighted-sum stat groups, so turn the weights into 'at least `need` of the `top`
    most valuable mods', cheapest first. PoB does the real ranking afterwards."""
    q = json.loads(json.dumps(query))
    q.pop("engine", None)
    q["sort"] = {"price": "asc"}
    groups = q["query"].get("stats") or []
    filters = groups[0].get("filters", []) if groups else []
    mods = [{"id": f["id"]} for f in filters[:top]]
    q["query"]["stats"] = [{"type": "count", "value": {"min": min(need, len(mods))}, "filters": mods}] if mods else []
    return q


def with_status(query: dict[str, Any], buy_now: bool) -> dict[str, Any]:
    """Copy of a trade query for online sellers, or, with `buy_now`, only instant-buyout ('securable') listings."""
    q = json.loads(json.dumps(query))
    q["query"]["status"] = {"option": "securable" if buy_now else "online"}
    return q


def seller_info(listing: dict[str, Any]) -> dict[str, Any]:
    """Who is selling and how to reach them, from a trade listing."""
    account = listing.get("account") or {}
    price = listing.get("price") or {}
    stash = listing.get("stash") or {}
    return {
        "account": account.get("name"),
        "character": account.get("lastCharacterName"),
        "status": (account.get("online") or {}).get("status"),
        "language": account.get("language"),
        "listed": listing.get("indexed"),
        "method": listing.get("method"),
        "priceType": price.get("type"),
        "stash": stash.get("name"),
        "position": [stash["x"] + 1, stash["y"] + 1] if "x" in stash and "y" in stash else None,
        "whisper": listing.get("whisper"),
        # Instant-buyout listings have no seller to whisper: the site takes a fee instead.
        "buyNow": "fee" in listing,
        "listedPrice": f"{price['amount']:g} {price['currency']}"
        if "amount" in price and "currency" in price
        else None,
    }


def trade_search(
    league: str, query: dict[str, Any], limit: int = 10, wanted: int = 5, weighted: bool = True
) -> list[dict[str, Any]]:
    """Search `query` and fetch up to `limit` listings spread from cheapest to dearest.

    A weighted gear query is turned into 'at least N of the top mods', relaxing N from 3 down to 1 until `wanted`
    listings match. Any other query (a unique by name) is sent as it is."""
    found: dict[str, Any] = {}
    needs = (3, 2, 1) if weighted else (0,)
    for need in needs:
        body = anonymous_query(query, need) if weighted else query
        found = _trade_request("POST", f"{TRADE_API}/search/poe2/{quote(league)}", json=body)
        if len(found.get("result") or []) >= wanted:
            break
    # Results come cheapest first, and the cheapest are rarely upgrades: sample evenly across the page instead.
    pool = found.get("result") or []
    ids = pool if len(pool) <= limit else [pool[round(i * (len(pool) - 1) / (limit - 1))] for i in range(limit)]
    out: list[dict[str, Any]] = []
    for i in range(0, len(ids), 10):
        batch = ids[i : i + 10]
        data = _trade_request("GET", f"{TRADE_API}/fetch/{','.join(batch)}", params={"query": found["id"]})
        out.extend(r for r in data.get("result") or [] if r)
    return out


def with_max_price(query: dict[str, Any], divine: float | None) -> dict[str, Any]:
    """Copy of a trade query restricted to listings priced at most `divine` (any currency, via divine equivalent)."""
    if divine is None:
        return query
    q = json.loads(json.dumps(query))
    filters = q["query"].setdefault("filters", {})
    filters.setdefault("trade_filters", {"filters": {}})["filters"]["price"] = {"option": "divine", "max": divine}
    return q


def _clean(text: str) -> str:
    return _MARKUP.sub(r"\1", _MARKUP_PIPE.sub(r"\1", text))


def listing_price(listing: dict[str, Any], rates: dict[str, float]) -> float | None:
    """A listing's price in divine orbs (None when the currency is unknown)."""
    price = listing.get("price") or {}
    amount, cur = price.get("amount"), price.get("currency")
    if amount is None or not cur:
        return None
    if cur == "divine":
        return float(amount)
    rate = rates.get(cur)
    return float(amount) / rate if rate else None


def listing_text(item: dict[str, Any]) -> str:
    """Trade-site item JSON -> the item text Path of Building reads (rarity, base, level, implicits, mods)."""
    rarity = str(item.get("rarity") or "Rare").upper()
    base = item.get("baseType") or item.get("typeLine") or ""
    lines = [f"Rarity: {rarity}"]
    name = item.get("name")
    if rarity in ("RARE", "UNIQUE") and name:
        lines.append(_clean(name))
    lines.append(_clean(item.get("typeLine") or base) if rarity != "RARE" else _clean(base))
    if item.get("ilvl"):
        lines.append(f"Item Level: {item['ilvl']}")
    implicit = [_clean(m["description"]) if isinstance(m, dict) else _clean(m) for m in item.get("implicitMods") or []]
    for key in ("enchantMods",):
        implicit += [_clean(m) for m in item.get(key) or []]
    lines.append(f"Implicits: {len(implicit)}")
    lines += implicit
    for key, tag in (
        ("explicitMods", ""),
        ("fracturedMods", "{fractured}"),
        ("desecratedMods", "{desecrated}"),
        ("craftedMods", "{crafted}"),
        ("runeMods", "{rune}"),
    ):
        for mod in item.get(key) or []:
            text = mod["description"] if isinstance(mod, dict) else mod
            lines += [tag + _clean(part) for part in str(text).split("\n") if part]
    if item.get("corrupted"):
        lines.append("Corrupted")
    return "\n".join(lines)


def unique_query(name: str, base: str | None = None) -> dict[str, Any]:
    query: dict[str, Any] = {"status": {"option": "online"}, "name": name}
    if base:
        query["type"] = base
    return {"query": query, "sort": {"price": "asc"}}


def parse_character_url(link: str) -> tuple[str, str, str, str] | None:
    """(kind, league slug, account, name) for a poe.ninja ladder or profile character link."""
    link = link.strip()
    if m := CHARACTER_URL.match(link):
        return "ladder", m.group(1), unquote(m.group(2)), unquote(m.group(3))
    if m := PROFILE_URL.match(link):
        return "profile", m.group(2), unquote(m.group(1)), unquote(m.group(3))
    return None


def is_character_url(link: str) -> bool:
    return parse_character_url(link) is not None


def character_league(link: str) -> str | None:
    parsed = parse_character_url(link)
    return league_from_slug(parsed[1]) if parsed else None


def character_code(link: str) -> tuple[str, str | None]:
    """poe.ninja character page (ladder or profile) -> (PoB share code, league name)."""
    parsed = parse_character_url(link)
    if not parsed:
        raise ValueError("Not a poe.ninja PoE2 character link")
    kind, slug, account, name = parsed
    if kind == "profile":
        # The trailing number only busts poe.ninja's cache (the site uses the character level); any value works.
        path = f"/poe2/api/profile/characters/{quote(account)}/{quote(slug)}/{quote(name)}"
        data = _get_json(f"{NINJA}{path}/model/{int(time.time() // 60)}", ttl=60)
        model = data.get("charModel") or {}
        if data.get("type") != "found" or not model.get("pathOfBuildingExport"):
            raise ValueError("poe.ninja has no public profile data for this character (is the profile public?)")
        return model["pathOfBuildingExport"], league_from_slug(slug)
    snapshot = next((s for s in index_state().get("snapshotVersions", []) if s.get("url") == slug), None)
    if not snapshot:
        raise ValueError(f"poe.ninja has no build snapshot for league '{slug}'")
    data = _get_json(
        f"{NINJA}/poe2/api/builds/{snapshot['version']}/character",
        ttl=60,
        params={
            "account": account,
            "name": name,
            "overview": snapshot["snapshotName"],
            "timeMachine": "",
        },
    )
    code = data.get("pathOfBuildingExport")
    if not code:
        raise ValueError("poe.ninja returned no Path of Building export for this character")
    return code, snapshot.get("name")
