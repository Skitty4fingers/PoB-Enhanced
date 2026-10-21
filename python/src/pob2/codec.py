"""Path of Building share codes and build links."""

from __future__ import annotations

import base64
import json
import re
import zlib

import httpx

# Paste sites that expose the raw share code at a predictable URL.
_RAW_URLS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^https?://pobb\.in/(?:u/[^/]+/)?([\w-]+)/?$"), "https://pobb.in/{}/raw"),
    (re.compile(r"^https?://pastebin\.com/(?:raw/)?(\w+)/?$"), "https://pastebin.com/raw/{}"),
    (re.compile(r"^https?://poe\.ninja/poe2/pob/(\w+)/?$"), "https://poe.ninja/poe2/pob/raw/{}"),
    (re.compile(r"^https?://poe2\.ninja/pob/(\w+)/?$"), "https://poe.ninja/poe2/pob/raw/{}"),
    (re.compile(r"^https?://(?:www\.)?maxroll\.gg/poe2/pob/(\w+)/?$"), "https://maxroll.gg/poe2/api/pob/{}"),
    (re.compile(r"^https?://(?:www\.)?poe2db\.tw/pob/(\w+)/?$"), "https://poe2db.tw/pob/{}/raw"),
    (re.compile(r"^https?://rentry\.(?:co|org)/([\w-]+)/?$"), "https://rentry.co/paste/{}/raw"),
]

# Maxroll planner and build guide pages carry PoB links rather than a code (planner JSON lists them as pobLinks).
_MAXROLL_PLANNER = re.compile(r"^https?://(?:www\.)?maxroll\.gg/poe2/planner/(\w+)")
_MAXROLL_GUIDE = re.compile(r"^https?://(?:www\.)?maxroll\.gg/poe2/build-guides/([\w-]+)")
_UA = {"User-Agent": "PoB-Enhanced (+https://github.com/Skitty4fingers/PoB-Enhanced)"}

SUPPORTED = (
    "pobb.in, pastebin.com, poe.ninja/poe2/pob, maxroll.gg/poe2 (PoB links, planners and build guides), poe2db.tw, "
    "rentry.co, and poe.ninja character pages (poe2/builds/... or poe2/profile/...)"
)


class CodecError(ValueError):
    """Raised when a build code, link or XML cannot be decoded."""


def decode_code(code: str) -> str:
    """Share code (URL-safe base64 of zlib-deflated XML) -> build XML."""
    cleaned = re.sub(r"\s+", "", code).replace("-", "+").replace("_", "/")
    cleaned += "=" * (-len(cleaned) % 4)
    try:
        return zlib.decompress(base64.b64decode(cleaned)).decode("utf-8")
    except (ValueError, zlib.error) as exc:
        raise CodecError(f"Not a valid Path of Building code: {exc}") from exc


def encode_code(xml: str) -> str:
    """Build XML -> share code, matching PoB's own export format."""
    return base64.b64encode(zlib.compress(xml.encode("utf-8"), 9)).decode().replace("+", "-").replace("/", "_")


def raw_url(link: str) -> str | None:
    for pattern, template in _RAW_URLS:
        match = pattern.match(link.strip())
        if match:
            return template.format(match.group(1))
    return None


def resolve(source: str, *, timeout: float = 15.0) -> str:
    """Accept XML, a share code, or a supported paste link and return build XML."""
    text = source.strip()
    if text.startswith("<"):
        return text
    if text.startswith(("http://", "https://")):
        from pob2 import market  # noqa: PLC0415 - avoid importing httpx-heavy helpers for plain codes

        if market.is_character_url(text):
            try:
                return decode_code(market.character_code(text)[0])
            except ValueError as exc:
                raise CodecError(str(exc)) from exc
        url = raw_url(text) or _maxroll_pob_url(text, timeout)
        if not url:
            raise CodecError(f"Unsupported link. Supported: {SUPPORTED}.")
        resp = httpx.get(url, timeout=timeout, follow_redirects=True, headers=_UA)
        resp.raise_for_status()
        text = resp.text.strip()
    return decode_code(text)


def _maxroll_planner_links(planner_id: str, timeout: float) -> list[str]:
    resp = httpx.get(f"https://planners.maxroll.gg/profiles/poe2/{planner_id}", timeout=timeout, headers=_UA)
    resp.raise_for_status()
    try:
        data = json.loads(resp.json().get("data") or "{}")
    except ValueError as exc:
        raise CodecError("Maxroll returned an unexpected planner format") from exc
    return [str(link["link"]).strip() for link in data.get("pobLinks") or [] if str(link.get("link") or "").strip()]


def _maxroll_pob_url(link: str, timeout: float) -> str | None:
    """Raw-code URL for the first PoB link on a Maxroll planner or build guide page."""
    found: list[str] = []
    if m := _MAXROLL_PLANNER.match(link):
        found = _maxroll_planner_links(m.group(1), timeout)
    elif m := _MAXROLL_GUIDE.match(link):
        resp = httpx.get(f"https://maxroll.gg/poe2/build-guides/{m.group(1)}", timeout=timeout, headers=_UA)
        resp.raise_for_status()
        html = resp.text.replace(r"\/", "/").replace(r"\u002F", "/")  # links inside escaped JSON
        for planner_id in dict.fromkeys(re.findall(r"maxroll\.gg/poe2/planner/(\w+)", html)):
            found += _maxroll_planner_links(planner_id, timeout)
            if found:
                break
        found += re.findall(r"/poe2/pob/(\w+)", html)
    else:
        return None
    for item in found:
        url = raw_url(item) if item.startswith("http") else f"https://maxroll.gg/poe2/api/pob/{item}"
        if url:
            return url
    raise CodecError(
        "That Maxroll page has no Path of Building link. PoE2 Maxroll planners use their own format: open the "
        "planner, export a Path of Building code, and import that instead."
    )
