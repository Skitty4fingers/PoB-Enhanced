"""On-disk state: the current build (survives restarts) and a library of saved builds.

Data lives in POB2_DATA, or the platform's user data folder (%LOCALAPPDATA%/pob2, ~/.local/share/pob2). The Docker
image uses /data, so mount a volume there to keep builds across container updates.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any


def default_dir() -> Path:
    if env := os.environ.get(
        "POB2_DATA", ""
    ).strip():  # stray spaces (e.g. Windows `set X=... &&`) would split the path
        return Path(env)
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "pob2"
    return Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "pob2"


def _write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class BuildStore:
    def __init__(self, root: Path | None = None):
        self.root = Path(root) if root else default_dir()
        self.builds = self.root / "builds"

    # -- current build --------------------------------------------------------------------------

    def save_current(self, state: dict[str, Any]) -> None:
        _write_atomic(self.root / "current.json", json.dumps({**state, "savedAt": time.time()}))

    def load_current(self) -> dict[str, Any] | None:
        try:
            state = json.loads((self.root / "current.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return state if isinstance(state, dict) and state.get("xml") else None

    def save_reference(self, reference: dict[str, Any] | None) -> None:
        path = self.root / "reference.json"
        if reference is None:
            path.unlink(missing_ok=True)
        else:
            _write_atomic(path, json.dumps(reference))

    def load_reference(self) -> dict[str, Any] | None:
        try:
            ref = json.loads((self.root / "reference.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return ref if isinstance(ref, dict) else None

    # -- saved builds ---------------------------------------------------------------------------

    def _index(self) -> dict[str, dict[str, Any]]:
        try:
            data = json.loads((self.builds / "index.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return data if isinstance(data, dict) else {}

    def _write_index(self, index: dict[str, dict[str, Any]]) -> None:
        _write_atomic(self.builds / "index.json", json.dumps(index, indent=1))

    def list(self) -> list[dict[str, Any]]:
        rows = [{"id": key, **meta} for key, meta in self._index().items()]
        return sorted(rows, key=lambda r: r.get("savedAt") or 0, reverse=True)

    def save(self, name: str, xml: str, meta: dict[str, Any], build_id: str | None = None) -> dict[str, Any]:
        name = name.strip() or "Unnamed build"
        index = self._index()
        if build_id is None:
            # Saving under an existing name overwrites it, like a file.
            build_id = next((k for k, v in index.items() if v.get("name") == name), None)
        if build_id is None:
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "build"
            build_id = f"{slug}-{uuid.uuid4().hex[:6]}"
        elif not re.fullmatch(r"[\w-]+", build_id):
            raise ValueError("Invalid build id")
        _write_atomic(self.builds / f"{build_id}.xml", xml)
        index[build_id] = {**meta, "name": name, "savedAt": time.time()}
        self._write_index(index)
        return {"id": build_id, **index[build_id]}

    def get(self, build_id: str) -> tuple[dict[str, Any], str]:
        meta = self._index().get(build_id)
        if not meta or not re.fullmatch(r"[\w-]+", build_id):
            raise KeyError(build_id)
        return meta, (self.builds / f"{build_id}.xml").read_text(encoding="utf-8")

    def delete(self, build_id: str) -> None:
        index = self._index()
        if build_id not in index:
            raise KeyError(build_id)
        del index[build_id]
        self._write_index(index)
        (self.builds / f"{build_id}.xml").unlink(missing_ok=True)
