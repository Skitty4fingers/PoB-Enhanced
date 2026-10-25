"""Workspaces: one live build per name, so several people can share a server without logging in.

A workspace is just a name in the URL (/w/<name> in the web UI, /mcp?w=<name> for agents); anyone with the link
shares that build. "default" is the build at the data folder root (what the server had before workspaces), every
other workspace lives in <data>/workspaces/<name>/ with its own current build, guide and library (item art is shared).

Each active workspace has its own PoB worker. Past POB2_MAX_WORKERS, or after POB2_IDLE_MINUTES without use, a
workspace hibernates: its build is saved and its worker stopped, but undo history, compare and guide stay in memory
and the build is reloaded on the next request.
"""

from __future__ import annotations

import contextlib
import functools
import logging
import os
import re
import threading
import time
from collections.abc import Iterator
from contextvars import ContextVar
from pathlib import Path

from pob2.art import ArtStore
from pob2.service import PoBService
from pob2.store import BuildStore, default_dir

log = logging.getLogger(__name__)

DEFAULT = "default"
NAME_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,31}")

current_workspace: ContextVar[str] = ContextVar("pob2_workspace", default=DEFAULT)


def normalize(name: str | None) -> str:
    name = (name or "").strip().lower() or DEFAULT
    if not NAME_RE.fullmatch(name):
        raise ValueError("Workspace names are 1-32 letters, digits or dashes (e.g. scott or bob-witch)")
    return name


@contextlib.contextmanager
def use(name: str | None) -> Iterator[str]:
    """Run the block against workspace `name`."""
    token = current_workspace.set(normalize(name))
    try:
        yield current_workspace.get()
    finally:
        current_workspace.reset(token)


def _env_number(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, "").strip() or default)
    except ValueError:
        return default


class WorkspaceRegistry:
    def __init__(self, root: Path | None = None, max_workers: int | None = None, idle_minutes: float | None = None):
        self.root = Path(root) if root else default_dir()
        self.max_workers = max(1, int(max_workers or _env_number("POB2_MAX_WORKERS", 4)))
        self.idle_seconds = 60 * (idle_minutes if idle_minutes is not None else _env_number("POB2_IDLE_MINUTES", 20))
        self._services: dict[str, PoBService] = {}
        self._art: ArtStore | None = None  # item icons aren't per person: one store at the data root
        self._last_used: dict[str, float] = {}
        self._lock = threading.RLock()
        self._reaper: threading.Thread | None = None
        self._stop = threading.Event()

    def root_for(self, name: str) -> Path:
        return self.root if name == DEFAULT else self.root / "workspaces" / name

    def get(self, name: str | None = None) -> PoBService:
        name = normalize(name)
        with self._lock:
            self._last_used[name] = time.monotonic()
            service = self._services.get(name)
            fresh = service is None
            if fresh:
                service = self._services[name] = PoBService(store=BuildStore(self.root_for(name)))
                if self._art is None:
                    self._art = ArtStore(self.root / "art.json")
                service.art = self._art
                service.before_start = functools.partial(self._make_room, name)
        self._start_reaper()
        if fresh:
            try:
                if service.restore_saved_state():
                    log.info("Workspace %s: restored its build", name)
            except Exception:  # noqa: BLE001 - a bad saved state must not stop the server
                log.exception("Workspace %s: could not restore the saved build", name)
        return service

    def current(self) -> PoBService:
        return self.get(current_workspace.get())

    def names(self) -> list[str]:
        with self._lock:
            return sorted(self._services)

    def workers(self) -> int:
        """Workspaces whose PoB worker is running."""
        with self._lock:
            return len(self._active())

    def _active(self, exclude: str | None = None) -> list[str]:
        return [n for n, s in self._services.items() if n != exclude and s.engine.running]

    def _make_room(self, name: str) -> None:
        """Before `name` starts a worker, hibernate the least recently used workspaces over the worker limit."""
        with self._lock:
            others = sorted(self._active(exclude=name), key=lambda n: self._last_used.get(n, 0))
            victims = others[: max(0, len(others) - self.max_workers + 1)]
        for victim in victims:  # outside the lock: a busy worker must not block other workspaces
            self.hibernate(victim)

    def hibernate(self, name: str) -> None:
        """Save the workspace's build and stop its worker; its next engine call reloads it."""
        with self._lock:
            service = self._services.get(name)
        if service is not None and service.hibernate():
            log.info("Workspace %s: hibernated", name)

    def reap(self) -> None:
        """Hibernate workspaces that have been idle for longer than the idle timeout."""
        cutoff = time.monotonic() - self.idle_seconds
        with self._lock:
            idle = [n for n in self._active() if self._last_used.get(n, 0) < cutoff]
        for name in idle:
            self.hibernate(name)

    def _start_reaper(self) -> None:
        if self._reaper is not None or self.idle_seconds <= 0:
            return
        with self._lock:
            if self._reaper is not None:
                return

            def loop() -> None:
                while not self._stop.wait(60):
                    try:
                        self.reap()
                    except Exception:  # noqa: BLE001 - keep reaping
                        log.exception("Could not hibernate idle workspaces")

            self._reaper = threading.Thread(target=loop, name="pob2-workspace-reaper", daemon=True)
            self._reaper.start()

    def shutdown(self) -> None:
        """Save every workspace and stop all workers."""
        self._stop.set()
        with self._lock:
            services = list(self._services.items())
        for name, service in services:
            if service.engine.running:
                service.save_now()  # don't lose a change made in the last second
                service.engine.stop()
                log.debug("Workspace %s: stopped", name)


registry = WorkspaceRegistry()


def current() -> PoBService:
    return registry.current()
