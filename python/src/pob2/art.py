"""Item art: official icon URLs (GGG's web.poecdn.com) learned from poe.ninja.

PoB has no item art. poe.ninja's economy data carries every unique's icon, and its character data carries the icon of
every item a character wears (rares show their base type's art). Icons are collected from both and kept in the data
folder, so base-type art fills in as more characters are imported. The browser loads the images from GGG's CDN.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

from pob2 import market

log = logging.getLogger(__name__)

CDN = "https://web.poecdn.com/"


def _ok(url: Any) -> bool:
    return isinstance(url, str) and url.startswith(CDN)


class ArtStore:
    def __init__(self, path: Path | None = None):
        self.path = path
        self.uniques: dict[str, str] = {}
        self.bases: dict[str, str] = {}
        self._lock = threading.Lock()
        self._fetched: dict[str, float] = {}
        if path and path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                self.uniques = {k: v for k, v in data.get("uniques", {}).items() if _ok(v)}
                self.bases = {k: v for k, v in data.get("bases", {}).items() if _ok(v)}
            except (OSError, ValueError):
                log.warning("Ignoring unreadable %s", path)

    def _save(self) -> None:
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"uniques": self.uniques, "bases": self.bases}), encoding="utf-8")
            tmp.replace(self.path)
        except OSError:
            log.warning("Could not save item art to %s", self.path)

    def learn(self, items: list[dict[str, Any]]) -> int:
        """Record icons from poe.ninja item records ({name, baseType, icon, unique}). Returns how many were new."""
        added = 0
        with self._lock:
            for it in items:
                icon, base, name = it.get("icon"), it.get("baseType"), it.get("name")
                if not _ok(icon):
                    continue
                if it.get("unique"):
                    if name and self.uniques.get(name) != icon:
                        self.uniques[name] = icon
                        added += 1
                elif base and base not in self.bases:
                    self.bases[base] = icon
                    added += 1
            if added:
                self._save()
        return added

    def refresh_uniques(self, league: str | None) -> None:
        """Pull every unique's icon from poe.ninja's economy data (at most every 6 hours per league)."""
        if not league or time.time() - self._fetched.get(league, 0) < 6 * 3600:
            return
        self._fetched[league] = time.time()
        try:
            self.learn(market.unique_icons(league))
        except Exception:  # noqa: BLE001 - art is optional
            log.warning("Could not fetch unique icons for %s", league)

    def snapshot(self) -> dict[str, dict[str, str]]:
        with self._lock:
            return {"uniques": dict(self.uniques), "bases": dict(self.bases)}
