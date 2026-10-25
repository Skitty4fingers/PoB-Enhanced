"""High-level, typed operations on a PoB build. Shared by the MCP server, REST API and CLI."""

from __future__ import annotations

import contextlib
import json
import logging
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any

from pob2 import codec, market
from pob2.art import ArtStore
from pob2.engine import Engine, EngineError
from pob2.store import BuildStore

log = logging.getLogger(__name__)

# Worker methods that change the build. Used to bump `revision` so UIs can refresh.
MUTATING = {
    "build.new",
    "build.load_xml",
    "build.set_level",
    "build.set_class",
    "skills.add",
    "skills.remove",
    "skills.set_main",
    "skills.set_enabled",
    "items.equip",
    "items.unequip",
    "tree.allocate",
    "tree.deallocate",
    "tree.reset",
    "tree.import_url",
    "config.set",
    "reference.apply_tree",
    "tree.set_attributes",
    "skills.set_gem",
}

# Largest accepted reference .build file (they are typically 20-100 KB).
MAX_REFERENCE_BYTES = 2_000_000

# Undo history kept in memory (each entry is one build XML, typically 20-60 KB).
HISTORY_LIMIT = 40

# Passive tree geometry by tree version; static, so shared by every workspace.
_layout_cache: dict[str, Any] = {}
_layout_lock = threading.Lock()

# Readable labels for undo entries.
LABELS = {
    "build.new": "New build",
    "build.load_xml": "Load build",
    "build.set_level": "Change level",
    "build.set_class": "Change class",
    "skills.add": "Add skill",
    "skills.remove": "Remove skill",
    "skills.set_main": "Change main skill",
    "skills.set_enabled": "Enable/disable skill",
    "skills.set_gem": "Change gem",
    "items.equip": "Equip item",
    "items.unequip": "Unequip item",
    "tree.allocate": "Allocate passives",
    "tree.deallocate": "Refund passives",
    "tree.reset": "Reset tree",
    "tree.import_url": "Import tree",
    "tree.set_attributes": "Change attribute nodes",
    "config.set": "Change config",
    "config.custom_mods": "Change custom mods",
    "reference.apply_tree": "Apply guide tree",
}


@dataclass
class Snapshot:
    """The build (and where it came from) before a change."""

    label: str
    xml: str
    name: str | None
    source: str | None
    source_league: str | None
    source_loaded_at: float | None
    at: float = field(default_factory=time.time)
    id: int = 0

    def row(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "name": self.name, "at": self.at}


class PoBService:
    """Wraps one Engine (one active build) with convenience operations."""

    def __init__(self, engine: Engine | None = None, store: BuildStore | None = None):
        self.engine = engine or Engine()
        # Persistence (current build + saved builds); None keeps everything in memory (tests, CLI).
        self.store = store
        self._undo: list[Snapshot] = []
        self._redo: list[Snapshot] = []
        self._snapshot_ids = 0
        self._depth = 0  # >0 inside an operation that groups several engine changes into one undo step
        self._restoring = False
        self._save_timer: threading.Timer | None = None
        # Second build to compare the live one against (PoB XML) and what it was loaded from.
        self.compare_xml: str | None = None
        self.compare_source: str | None = None
        self.art = ArtStore(store.root / "art.json" if store else None)
        self.revision = 0
        self._lock = threading.RLock()
        # Held across each engine call and each multi-call operation, so clients sharing this build (two tabs, the
        # UI and an agent) don't interleave half-finished changes. Always taken before `_lock`, never after.
        self._busy = threading.RLock()
        self._asleep = False  # worker stopped by hibernate(); the next engine call reloads the saved build
        self.before_start: Callable[[], None] | None = None  # called before the worker starts (frees another one)
        # Reference build (PoE2 BuildPlanner .build JSON) the live build is compared against.
        self.reference: dict[str, Any] | None = None
        self._advice_cache: tuple[tuple[Any, ...], dict[str, Any]] | None = None
        # Where the build came from (a link), so it can be re-imported with one click.
        self.source: str | None = None
        self.source_league: str | None = None
        self.source_loaded_at: float | None = None
        self._memo: dict[tuple[Any, ...], Any] = {}

    def call(self, method: str, **params: Any) -> Any:
        mutating = method in MUTATING or (method == "config.custom_mods" and params.get("text") is not None)
        with self._busy:
            self._wake()
            if mutating and not self._restoring and self._depth == 0:
                self._record(LABELS.get(method, method))
            result = self.engine.call(method, {k: v for k, v in params.items() if v is not None})
            if mutating:
                self.revision += 1
                self._schedule_save()
        return result

    # -- hibernation (see pob2.workspaces) --------------------------------------------------------

    def hibernate(self) -> bool:
        """Save the build and stop the worker to free its memory; undo history and guide stay in memory."""
        with self._busy:
            if not self.engine.running or self.store is None:
                return False
            with self._lock:
                if self._save_timer is not None:
                    self._save_timer.cancel()
            self.save_now()
            self.engine.stop()
            self._asleep = True
            return True

    def _wake(self) -> None:
        """Called (under `_busy`) before anything that may start the worker."""
        if self.engine.running:
            return
        if self.before_start is not None:
            self.before_start()
        if not self._asleep:
            return
        self._asleep = False
        state = self.store.load_current() if self.store else None
        if state:
            self.engine.call("build.load_xml", {"xml": state["xml"], "name": state.get("name")})

    # -- history (undo / redo) --------------------------------------------------------------------

    @contextlib.contextmanager
    def operation(self, label: str) -> Iterator[None]:
        """Group several changes into one undo step."""
        with self._busy:
            if self._depth == 0 and not self._restoring:
                self._record(label)
            self._depth += 1
            try:
                yield
            finally:
                self._depth -= 1

    def _capture(self, label: str) -> Snapshot | None:
        self._wake()
        try:
            xml = self.engine.call("build.export_xml")["xml"]
            name = self.engine.call("build.info").get("name")
        except EngineError:
            return None  # nothing exportable (broken build)
        self._snapshot_ids += 1
        return Snapshot(label, xml, name, self.source, self.source_league, self.source_loaded_at, id=self._snapshot_ids)

    def _record(self, label: str) -> None:
        self._wake()
        if not self.engine.running:
            return  # first call ever: there is no build to go back to
        snap = self._capture(label)
        if snap is None:
            return
        with self._lock:
            self._undo.append(snap)
            del self._undo[:-HISTORY_LIMIT]
            self._redo.clear()

    def _restore(self, snap: Snapshot) -> dict[str, Any]:
        self._restoring = True
        try:
            info = self.call("build.load_xml", xml=snap.xml, name=snap.name)
        finally:
            self._restoring = False
        self.source, self.source_league, self.source_loaded_at = snap.source, snap.source_league, snap.source_loaded_at
        return info

    def history(self) -> dict[str, Any]:
        """Undo entries (newest first) and redo entries."""
        return {
            "undo": [s.row() for s in reversed(self._undo)],
            "redo": [s.row() for s in reversed(self._redo)],
        }

    def undo(self) -> dict[str, Any]:
        with self._busy:
            with self._lock:
                if not self._undo:
                    raise ValueError("Nothing to undo")
                snap = self._undo.pop()
            current = self._capture(snap.label)
            info = self._restore(snap)
            if current:
                self._redo.append(current)
            return {"undid": snap.label, "info": info, **self.history()}

    def redo(self) -> dict[str, Any]:
        with self._busy:
            with self._lock:
                if not self._redo:
                    raise ValueError("Nothing to redo")
                snap = self._redo.pop()
            current = self._capture(snap.label)
            info = self._restore(snap)
            if current:
                self._undo.append(current)
            return {"redid": snap.label, "info": info, **self.history()}

    def restore_history(self, entry_id: int) -> dict[str, Any]:
        """Go back to the build as it was before undo entry `entry_id` (itself undoable)."""
        with self._busy:
            with self._lock:
                snap = next((s for s in self._undo if s.id == entry_id), None)
            if snap is None:
                raise ValueError(f"No undo entry {entry_id}")
            self._record(f"Before going back to: {snap.label}")
            info = self._restore(snap)
            return {"restored": snap.label, "info": info, **self.history()}

    def checkpoint(self, label: str) -> dict[str, Any]:
        """Add a named undo entry for the build as it is now, to come back to after experimenting."""
        with self._busy:
            self._record(label.strip() or "Checkpoint")
        return self.history()

    # -- persistence ------------------------------------------------------------------------------

    def restore_saved_state(self) -> bool:
        """Load the build (and guide) that was active when the server last stopped."""
        if self.store is None:
            return False
        if ref := self.store.load_reference():
            self.reference = ref
        state = self.store.load_current()
        if not state:
            return False
        self._asleep = False
        self._restoring = True
        try:
            self.call("build.load_xml", xml=state["xml"], name=state.get("name"))
        except EngineError:
            log.exception("Could not restore the saved build")
            return False
        finally:
            self._restoring = False
        self.source = state.get("source")
        self.source_league = state.get("league")
        self.source_loaded_at = state.get("loadedAt")
        return True

    def _schedule_save(self) -> None:
        if self.store is None:
            return
        with self._lock:
            if self._save_timer is not None:
                self._save_timer.cancel()
            self._save_timer = threading.Timer(1.0, self.save_now)
            self._save_timer.daemon = True
            self._save_timer.start()

    def save_now(self) -> None:
        """Write the current build to the data folder (normally done 1 s after each change)."""
        if self.store is None:
            return
        with self._busy:
            if not self.engine.running:
                return  # hibernated or never started: what's on disk is already current
            try:
                xml = self.engine.call("build.export_xml")["xml"]
                name = self.engine.call("build.info").get("name")
                state = {
                    "xml": xml,
                    "name": name,
                    "source": self.source,
                    "league": self.source_league,
                    "loadedAt": self.source_loaded_at,
                }
                self.store.save_current(state)
            except (EngineError, OSError):
                log.exception("Could not save the current build")

    # -- saved builds -----------------------------------------------------------------------------

    def _require_store(self) -> BuildStore:
        if self.store is None:
            raise ValueError("Saved builds are not available (no data folder)")
        return self.store

    def saved_builds(self) -> list[dict[str, Any]]:
        return self._require_store().list()

    def save_build(self, name: str | None = None) -> dict[str, Any]:
        """Save the current build to the library under `name` (default: its own name); the same name overwrites."""
        store = self._require_store()
        info = self.info()
        meta = {
            "className": info.get("className"),
            "ascendClassName": info.get("ascendClassName"),
            "level": info.get("level"),
            "mainSkill": info.get("mainSkill"),
            "source": self.source,
            "league": self.source_league,
        }
        xml = self.call("build.export_xml")["xml"]
        return store.save(name or info.get("name") or "Unnamed build", xml, meta)

    def open_saved_build(self, build_id: str) -> dict[str, Any]:
        store = self._require_store()
        try:
            meta, xml = store.get(build_id)
        except (KeyError, OSError) as e:
            raise ValueError(f"No saved build {build_id}") from e
        with self.operation(f"Open saved build: {meta.get('name')}"):
            info = self.call("build.load_xml", xml=xml, name=meta.get("name"))
        self.source, self.source_league = meta.get("source"), meta.get("league")
        self.source_loaded_at = meta.get("savedAt")
        return info

    def delete_saved_build(self, build_id: str) -> None:
        try:
            self._require_store().delete(build_id)
        except KeyError as e:
            raise ValueError(f"No saved build {build_id}") from e

    # -- build -----------------------------------------------------------------------------------

    def new_build(
        self,
        class_name: str | None = None,
        ascendancy: str | None = None,
        level: int | None = None,
        name: str | None = None,
    ) -> dict[str, Any]:
        with self.operation("New build"):
            info = self.call("build.new", name=name)
            if class_name or ascendancy:
                info = self.call("build.set_class", className=class_name, ascendClassName=ascendancy)
            if level:
                info = self.call("build.set_level", level=level)
        return info

    def set_character(
        self, level: int | None = None, class_name: str | None = None, ascendancy: str | None = None
    ) -> dict[str, Any]:
        info = None
        with self.operation("Change character"):
            if class_name or ascendancy:
                info = self.call("build.set_class", className=class_name, ascendClassName=ascendancy)
            if level:
                info = self.call("build.set_level", level=level)
        return info or self.info()

    def load(self, source: str, name: str | None = None) -> dict[str, Any]:
        """Load from XML, a share code, or a pobb.in / pastebin / poe.ninja link (paste or character page)."""
        xml = codec.resolve(source)
        with self.operation("Import build"):
            info = self.call("build.load_xml", xml=xml, name=name)
        link = source.strip()
        if link.startswith(("http://", "https://")):
            self.source = link
            try:
                self.source_league = market.character_league(link)
            except Exception:  # noqa: BLE001 - league lookup is a convenience
                self.source_league = None
        else:
            self.source = self.source_league = None
        self.source_loaded_at = time.time()
        if self.source and market.is_character_url(self.source):
            try:
                self.art.learn(market.character_art(self.source))
            except Exception:  # noqa: BLE001 - art is optional
                log.warning("Could not read item art for %s", self.source)
        return info

    def item_art(self, league: str | None = None) -> dict[str, dict[str, str]]:
        """Icon URLs by unique name and by base type (see pob2.art)."""
        self.art.refresh_uniques(self.league(league))
        return self.art.snapshot()

    def source_info(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "character": bool(self.source and market.is_character_url(self.source)),
            "league": self.source_league,
            "loadedAt": self.source_loaded_at,
        }

    def refresh(self) -> dict[str, Any]:
        """Re-import the build from its source link, keeping the Config tab settings."""
        if not self.source:
            raise ValueError("This build wasn't imported from a link, so there is nothing to refresh from")
        keys = ["TotalDPS", "CombinedDPS", "Life", "EnergyShield", "TotalEHP"]
        before = self.call("stats.get", keys=keys)
        config = {
            c["var"]: c["value"]
            for c in self.call("config.list", all=True)
            if c.get("value") is not None and c.get("value") != c.get("default")
        }
        with self.operation("Update from source"):
            info = self.load(self.source)
            if config:
                try:
                    self.call("config.set", values=config)
                except EngineError:
                    pass  # options that no longer apply to the refreshed build
        after = self.call("stats.get", keys=keys)
        return {"info": info, "before": before, "after": after, "source": self.source_info()}

    def export(self) -> dict[str, str]:
        xml = self.call("build.export_xml")["xml"]
        return {"code": codec.encode_code(xml), "xml": xml}

    def info(self) -> dict[str, Any]:
        return self.call("build.info")

    def overview(self) -> dict[str, Any]:
        """Everything needed to understand the build in one call."""
        items = self.call("items.list", full=False)
        config = self.call("config.list")
        return {
            "info": self.info(),
            "stats": self.call("stats.summary"),
            "skills": self.call("skills.list"),
            "items": [
                {"slot": i["slot"], "name": i["item"]["name"], "rarity": i["item"]["rarity"]}
                for i in items
                if i.get("item")
            ],
            "config": {
                c["var"]: c["value"]
                for c in config
                if c.get("value") is not None and c.get("value") != c.get("default")
            },
        }

    # -- compare with a second build -----------------------------------------------------------------

    def set_compare(self, source: str) -> dict[str, Any]:
        """Load a second build (share code, link or XML) to compare the live build against."""
        xml = codec.resolve(source)
        if "<PathOfBuilding" not in xml:
            raise ValueError("Not a Path of Building build")
        self.compare_xml = xml
        link = source.strip()
        self.compare_source = link if link.startswith(("http://", "https://")) else None
        self.revision += 1
        return self.compare()

    def clear_compare(self) -> None:
        self.compare_xml = self.compare_source = None
        self.revision += 1

    def compare(self) -> dict[str, Any] | None:
        """Differences between the live build and the compared one: stats, items, skills, notables, config."""
        xml = self.compare_xml
        if xml is None:
            return None
        key = ("compare", hash(xml))
        return self._memoised(key, lambda: _diff(self.call("compare.collect", xml=xml), self.compare_source))

    def copy_from_compare(self, what: str, slot: str | None = None) -> dict[str, Any]:
        """Copy the compared build's tree, config, or the item in `slot` into the live build (undoable)."""
        data = self.compare()
        if data is None:
            raise ValueError("No build to compare against; load one first")
        theirs = data["theirs"]
        if what == "tree":
            return self.call("tree.import_url", url=theirs["treeUrl"])
        if what == "config":
            values = {k: v["value"] for k, v in theirs["configValues"].items()}
            return self.call("config.set", values=values) if values else {"updated": {}}
        if what == "item":
            row = next((r for r in data["items"] if r["slot"] == slot), None)
            if row is None or not row.get("theirsText"):
                raise ValueError(f"The compared build has nothing in {slot}")
            return self.call("items.equip", text=row["theirsText"], slot=slot)
        raise ValueError("what must be 'tree', 'config' or 'item'")

    # -- reference build ---------------------------------------------------------------------------

    def set_reference(self, content: str | dict[str, Any]) -> dict[str, Any]:
        """Store a PoE2 BuildPlanner (.build) guide to compare the live build against."""
        if isinstance(content, str):
            if len(content.encode("utf-8")) > MAX_REFERENCE_BYTES:
                raise ValueError("Reference file is too large")
            try:
                ref = json.loads(content.lstrip("﻿"))
            except json.JSONDecodeError as e:
                raise ValueError(f"Not a .build file (invalid JSON: {e.msg})") from e
        else:
            ref = content
        sections = ("passives", "skills", "inventory_slots")
        if not isinstance(ref, dict) or not any(isinstance(ref.get(k), list) for k in sections):
            raise ValueError("Not a PoE2 BuildPlanner .build file (no passives, skills or inventory_slots)")
        self.reference = ref
        self.revision += 1
        self._save_reference()
        return self.reference_summary()

    def clear_reference(self) -> None:
        self.reference = None
        self.revision += 1
        self._save_reference()

    def _save_reference(self) -> None:
        if self.store is not None:
            try:
                self.store.save_reference(self.reference)
            except OSError:
                log.exception("Could not save the reference guide")

    def _require_reference(self) -> dict[str, Any]:
        if self.reference is None:
            raise ValueError("No reference build loaded")
        return self.reference

    def reference_summary(self) -> dict[str, Any] | None:
        ref = self.reference
        if ref is None:
            return None
        return {
            "name": ref.get("name"),
            "author": ref.get("author"),
            "link": ref.get("link"),
            "ascendancy": ref.get("ascendancy"),
            "passives": len(ref.get("passives") or []),
            "skills": len(ref.get("skills") or []),
            "items": len(ref.get("inventory_slots") or []),
        }

    def reference_compare(self, level: int | None = None) -> dict[str, Any]:
        """Passive, skill and gear differences between the live build and the reference at a level."""
        return self.call("reference.compare", reference=self._require_reference(), level=level)

    def reference_impact(self, level: int | None = None, limit: int | None = None) -> dict[str, Any]:
        """Stat impact of the reference tree, ranked next steps and the value of extra nodes."""
        return self.call("reference.impact", reference=self._require_reference(), level=level, limit=limit)

    def apply_reference_tree(self, level: int | None = None) -> dict[str, Any]:
        return self.call("reference.apply_tree", reference=self._require_reference(), level=level)

    # -- advisor -------------------------------------------------------------------------------------

    def advice(self, metric: str = "balanced", level: int | None = None, limit: int | None = None) -> dict[str, Any]:
        """Next passive point, which point to move, and attribute node choices (follows the reference if loaded)."""
        key = (self.revision, id(self.reference), metric, level, limit)
        with self._lock:
            if self._advice_cache and self._advice_cache[0] == key:
                return self._advice_cache[1]
        result = self.call("advisor.plan", reference=self.reference, metric=metric, level=level, limit=limit)
        with self._lock:
            self._advice_cache = (key, result)
        return result

    def set_attributes(self, changes: list[dict[str, Any]]) -> dict[str, Any]:
        """Choose +5 Strength/Dexterity/Intelligence on attribute nodes: [{"id": 123, "attribute": "Strength"}]."""
        return self.call("tree.set_attributes", changes=changes)

    # -- spirit / totem budget -------------------------------------------------------------------------

    def budget(self) -> dict[str, Any]:
        """Spirit total/reserved/free, totems affordable vs cap, and main-skill DPS across all totems."""
        return self.call("budget.get")

    def check_item(self, text: str, slot: str | None = None) -> dict[str, Any]:
        """Check before you buy: verdict, every damage skill (totems counted), Spirit/totems, defences, requirements."""
        return self.call("budget.check_item", text=text, slot=slot)

    # -- gear, shopping and gems ---------------------------------------------------------------------

    def _memoised(self, key: tuple[Any, ...], fn: Any) -> Any:
        """Cache an engine result for the current build revision."""
        full = (self.revision, *key)
        with self._lock:
            if full in self._memo:
                return self._memo[full]
        result = fn()
        with self._lock:
            self._memo = {k: v for k, v in self._memo.items() if k[0] == self.revision}
            self._memo[full] = result
        return result

    def league(self, league: str | None = None) -> str | None:
        if league:
            return league
        if self.source_league:
            return self.source_league
        try:
            return market.default_league()
        except Exception:  # noqa: BLE001 - poe.ninja unreachable; links just won't have a league
            return None

    def gear_slots(self) -> list[dict[str, Any]]:
        return self._memoised(("gear.slots",), lambda: self.call("gear.slots"))

    def gear_slot(self, slot: str, metric: str = "balanced", league: str | None = None) -> dict[str, Any]:
        """What the item in a slot and each of its mods is worth, what to look for, and a weighted trade search."""
        cached = self._memoised(("gear.slot", slot, metric), lambda: self.call("gear.slot", slot=slot, metric=metric))
        result = dict(cached)
        league = self.league(league)
        if league and result.get("tradeQuery"):
            result["tradeUrl"] = market.trade_url(league, result["tradeQuery"])
            result["league"] = league
        return result

    def gear_overview(self, metric: str = "balanced", league: str | None = None) -> list[dict[str, Any]]:
        """Every slot's analysis, best upgrade opportunity first."""
        rows = [self.gear_slot(s["slot"], metric, league) for s in self.gear_slots()]
        return sorted(rows, key=lambda r: r.get("headroom") or 0, reverse=True)

    def gear_uniques(
        self, metric: str = "balanced", league: str | None = None, max_price: float | None = None
    ) -> dict[str, Any]:
        """Uniques that would help most per slot, with poe.ninja prices and trade links."""
        groups = self._memoised(("gear.uniques", metric), lambda: self.call("gear.uniques", metric=metric, limit=25))
        league = self.league(league)
        prices: dict[str, Any] = {"rates": {}, "items": {}}
        if league:
            try:
                prices = market.unique_prices(league)
            except Exception:  # noqa: BLE001 - prices are optional
                pass
        out = []
        for group in groups:
            items = []
            for item in group["items"]:
                row = dict(item)
                price = prices["items"].get(item["name"])
                if price:
                    row["priceDivine"] = price["divine"]
                    row["price"] = market.format_price(price["divine"], prices["rates"])
                    row["listings"] = price["listings"]
                    if price["divine"] > 0:
                        row["gainPerDivine"] = item["score"] / price["divine"]
                if max_price is not None and row.get("priceDivine") is not None and row["priceDivine"] > max_price:
                    continue
                if league:
                    row["tradeUrl"] = market.trade_url(league, market.unique_query(item["name"], item.get("baseName")))
                items.append(row)
            if items:
                out.append({"slot": group["slot"], "items": items[:8]})
        return {"league": league, "rates": prices["rates"], "slots": out}

    def unique_jewels(
        self, metric: str = "balanced", slot: str | None = None, league: str | None = None
    ) -> dict[str, Any]:
        """Best unique jewels (and variant) for each allocated jewel socket, with poe.ninja prices."""
        data = self._memoised(
            ("gear.jewels", metric, slot), lambda: self.call("gear.jewels", metric=metric, slot=slot, limit=6)
        )
        league = self.league(league)
        prices: dict[str, Any] = {"rates": {}, "items": {}}
        if league:
            try:
                prices = market.unique_prices(league)
            except Exception:  # noqa: BLE001 - prices are optional
                pass
        sockets = []
        for sock in data["sockets"]:
            rows = []
            for s in sock.get("suggestions") or []:
                row = dict(s)
                price = prices["items"].get(s["name"])
                if price:
                    row["priceDivine"] = price["divine"]
                    row["price"] = market.format_price(price["divine"], prices["rates"])
                if league:
                    row["tradeUrl"] = market.trade_url(league, market.unique_query(s["name"]))
                rows.append(row)
            sockets.append({**sock, "suggestions": rows})
        return {"metric": data["metric"], "league": league, "sockets": sockets}

    def design_rare(
        self, slot: str, metric: str = "balanced", item_level: int = 82, league: str | None = None
    ) -> dict[str, Any]:
        """Best rare for a slot from the real mod pool, measured in the build, with a trade search for it."""
        result = dict(
            self._memoised(
                ("designer.rare", slot, metric, item_level),
                lambda: self.call("designer.rare", slot=slot, metric=metric, itemLevel=item_level),
            )
        )
        league = self.league(league)
        if league and result.get("tradeQuery"):
            result["tradeUrl"] = market.trade_url(league, result["tradeQuery"])
        return result

    def build_check(self) -> dict[str, Any]:
        """Build health check: problems worst first, each with a fix and the tab that has it."""
        return self._memoised(("health.check",), lambda: self.call("health.check"))

    def gems_advice(self, metric: str = "balanced") -> dict[str, Any]:
        """Support worth, best replacement per skill, gem level/quality upgrades and setup problems."""
        return self._memoised(("gems.advise", metric), lambda: self.call("gems.advise", metric=metric))

    def socket_advice(self, metric: str = "balanced", slot: str | None = None, limit: int = 5) -> dict[str, Any]:
        """Each socketed rune/soul core/idol's worth and the best legal replacements per socket."""
        return self._memoised(
            ("sockets.analyze", metric, slot, limit),
            lambda: self.call("sockets.analyze", metric=metric, slot=slot, limit=limit),
        )

    def socket_plan(
        self, metric: str = "balanced", max_swaps: int = 8, min_gain: float = 0.5, keep_unmodelled: bool = True
    ) -> dict[str, Any]:
        """Greedy combined plan of socket swaps, re-measured after each one. Does not change the build."""
        return self._memoised(
            ("sockets.optimize", metric, max_swaps, min_gain, keep_unmodelled),
            lambda: self.call(
                "sockets.optimize", metric=metric, maxSwaps=max_swaps, minGain=min_gain, keepUnmodelled=keep_unmodelled
            ),
        )

    def set_gem(self, group: int, index: int, **changes: Any) -> dict[str, Any]:
        return self.call("skills.set_gem", group=group, index=index, **changes)

    # -- tree ------------------------------------------------------------------------------------

    def tree_layout(self) -> dict[str, Any]:
        """Static node geometry (cached per tree version) plus the current allocation."""
        info = self.info()
        version = info["treeVersion"]
        if version not in _layout_cache:
            layout = self.call("tree.layout")
            for node in layout["nodes"]:
                node.pop("alloc", None)
            with _layout_lock:
                _layout_cache[version] = layout
        tree = self.call("tree.get")
        allocated = [n["id"] for n in tree["nodes"]]
        # Chosen +5 attribute on allocated attribute nodes (Strength/Dexterity/Intelligence).
        attributes = {str(n["id"]): n["name"] for n in tree["nodes"] if n.get("isAttribute")}
        jewels = {
            str(i["jewelNodeId"]): {
                k: i["item"].get(k) for k in ("name", "title", "baseName", "rarity", "mods") if i["item"].get(k)
            }
            for i in self.call("items.list", full=True)
            if i.get("jewelNodeId") and i.get("item")
        }
        return {
            **_layout_cache[version],
            "allocated": allocated,
            "jewels": jewels,
            "attributes": attributes,
            "className": tree.get("className"),
            "ascendClassName": tree.get("ascendClassName"),
        }


# Stats where lower is better (none so far: every compared stat is "more is better").
_LOWER_IS_BETTER: set[str] = set()


def _pct(a: float, b: float) -> float | None:
    return (b - a) / abs(a) * 100 if a else None


def _diff(raw: dict[str, Any], source: str | None) -> dict[str, Any]:
    """Turn the engine's two snapshots into side-by-side rows."""
    mine, theirs, labels = raw["mine"], raw["theirs"], raw["statLabels"]
    for snap in (mine, theirs):  # Lua encodes an empty table as a list
        for key in ("config", "stats"):
            if not isinstance(snap.get(key), dict):
                snap[key] = {}
        for key in ("items", "skills", "nodes"):
            snap[key] = snap.get(key) or []
    stats = []
    for key in raw.get("statOrder") or ["DPS", "EHP", *[k for k in labels if k not in ("DPS", "EHP")]]:
        a, b = mine["stats"].get(key), theirs["stats"].get(key)
        if a is None and b is None:
            continue
        a, b = a or 0, b or 0
        better = None if a == b else (b < a) if key in _LOWER_IS_BETTER else (b > a)
        stats.append(
            {
                "key": key,
                "label": labels.get(key, key),
                "mine": a,
                "theirs": b,
                "pct": _pct(a, b),
                "theirsBetter": better,
            }
        )

    by_slot = {r["slot"]: r for r in theirs["items"]}
    items = []
    for row in mine["items"]:
        other = by_slot.pop(row["slot"], {})
        if row.get("name") or other.get("name"):
            items.append(
                {
                    "slot": row["slot"],
                    "mine": row.get("name"),
                    "mineRarity": row.get("rarity"),
                    "theirs": other.get("name"),
                    "theirsRarity": other.get("rarity"),
                    "theirsText": other.get("text"),
                    "same": row.get("text") == other.get("text"),
                }
            )
    for slot, other in by_slot.items():
        if other.get("name"):
            items.append(
                {
                    "slot": slot,
                    "mine": None,
                    "theirs": other["name"],
                    "theirsRarity": other.get("rarity"),
                    "theirsText": other.get("text"),
                    "same": False,
                }
            )

    def skill_map(snap: dict[str, Any]) -> dict[str, dict[str, Any]]:
        res = {}
        for g in snap["skills"]:
            active = [x["name"] for x in g["gems"] if not x.get("support")]
            supports = sorted(x["name"] for x in g["gems"] if x.get("support") and x.get("enabled", True))
            res[active[0] if active else g.get("label") or f"Group {g['index']}"] = {
                "supports": supports,
                "isMain": bool(g.get("isMain")),
                "gems": g["gems"],
            }
        return res

    ms, ts = skill_map(mine), skill_map(theirs)
    skills = []
    for name in list(dict.fromkeys([*ms, *ts])):
        a, b = ms.get(name), ts.get(name)
        skills.append(
            {
                "skill": name,
                "inMine": a is not None,
                "inTheirs": b is not None,
                "mainInMine": bool(a and a["isMain"]),
                "mainInTheirs": bool(b and b["isMain"]),
                "supportsOnlyTheirs": sorted(set(b["supports"]) - set(a["supports"])) if a and b else [],
                "supportsOnlyMine": sorted(set(a["supports"]) - set(b["supports"])) if a and b else [],
            }
        )

    def notables(snap: dict[str, Any]) -> dict[int, str]:
        return {n["id"]: n["name"] for n in snap["nodes"] if n.get("type") in ("Notable", "Keystone")}

    mn, tn = notables(mine), notables(theirs)
    tree = {
        "mineNodes": len(mine["nodes"]),
        "theirsNodes": len(theirs["nodes"]),
        "shared": len({n["id"] for n in mine["nodes"]} & {n["id"] for n in theirs["nodes"]}),
        "notablesOnlyTheirs": sorted(tn[i] for i in tn.keys() - mn.keys()),
        "notablesOnlyMine": sorted(mn[i] for i in mn.keys() - tn.keys()),
    }

    keys = sorted(set(mine["config"]) | set(theirs["config"]))
    config = [
        {
            "var": k,
            "label": (theirs["config"].get(k) or mine["config"].get(k))["label"],
            "mine": (mine["config"].get(k) or {}).get("value"),
            "theirs": (theirs["config"].get(k) or {}).get("value"),
        }
        for k in keys
        if (mine["config"].get(k) or {}).get("value") != (theirs["config"].get(k) or {}).get("value")
    ]
    return {
        "source": source,
        "mine": {**mine["info"], "skill": mine.get("skill"), "totems": mine.get("totems")},
        "theirs": {
            **theirs["info"],
            "skill": theirs.get("skill"),
            "totems": theirs.get("totems"),
            "treeUrl": theirs["treeUrl"],
            "configValues": theirs["config"],
        },
        "stats": stats,
        "items": items,
        "skills": skills,
        "tree": tree,
        "config": config,
    }
