"""Apply patches/ to copies of upstream files in .patched/, leaving src/ untouched (see patches/README.md)."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)

MANIFEST = "manifest.json"


@dataclass
class Hunk:
    old_start: int
    lines: list[str] = field(default_factory=list)  # with their ' ', '-', '+' prefix


@dataclass
class FilePatch:
    path: str  # repo-relative, e.g. src/Modules/CalcOffence.lua
    hunks: list[Hunk] = field(default_factory=list)


HUNK_RE = re.compile(r"^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@")


def parse(text: str) -> list[FilePatch]:
    """Parse a git-format unified diff (modified files only)."""
    files: list[FilePatch] = []
    current: FilePatch | None = None
    hunk: Hunk | None = None
    for line in text.splitlines():
        if line.startswith("diff --git "):
            current, hunk = None, None
            continue
        if line.startswith("+++ "):
            path = line[4:].strip()
            path = path[2:] if path.startswith("b/") else path
            current = FilePatch(path)
            files.append(current)
            continue
        if line.startswith("--- ") and hunk is None:
            continue
        m = HUNK_RE.match(line)
        if m and current is not None:
            hunk = Hunk(int(m.group(1)))
            current.hunks.append(hunk)
            continue
        if line in ("-- ", "--"):
            hunk = None  # signature separator at the end of format-patch output (not a removed line)
        elif hunk is not None and line[:1] in (" ", "-", "+"):
            hunk.lines.append(line)
        elif hunk is not None and line == "":
            hunk.lines.append(" ")  # blank context line whose trailing space was stripped
    return files


def apply(source: list[str], fp: FilePatch) -> list[str]:
    """Apply hunks to the file's lines; context must match exactly (any offset). Raises ValueError otherwise."""
    out = list(source)
    shift = 0
    for hunk in fp.hunks:
        old = [ln[1:] for ln in hunk.lines if ln[0] in (" ", "-")]
        new = [ln[1:] for ln in hunk.lines if ln[0] in (" ", "+")]
        want = hunk.old_start - 1 + shift
        pos = None
        for delta in range(0, len(out) + 1):
            for cand in (want - delta, want + delta):
                if 0 <= cand <= len(out) - len(old) and out[cand : cand + len(old)] == old:
                    pos = cand
                    break
            if pos is not None:
                break
        if pos is None:
            raise ValueError(f"hunk at line {hunk.old_start} does not match")
        out[pos : pos + len(old)] = new
        shift += len(new) - len(old)
    return out


def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def ensure(root: Path) -> dict[str, dict[str, str]]:
    """(Re)build .patched/ when patches or originals changed. Returns the manifest {src-relative path: info}."""
    patch_dir = root / "patches" / "poe2"
    out_dir = root / ".patched"
    patches = sorted(patch_dir.glob("*.patch")) if patch_dir.is_dir() else []
    key = _sha1(b"".join(p.read_bytes() for p in patches))
    manifest_path = out_dir / MANIFEST
    try:
        manifest = json.loads(manifest_path.read_text())
        files = manifest.get("files", {})
        fresh = manifest.get("patches") == key and all(
            _sha1((root / "src" / rel).read_bytes()) == info["original"] for rel, info in files.items()
        )
        if fresh:
            return files
    except (OSError, ValueError, KeyError):
        pass

    lines: dict[str, list[str]] = {}
    newlines: dict[str, str] = {}
    applied: dict[str, list[str]] = {}
    for patch in patches:
        parsed = parse(patch.read_text(encoding="utf-8"))
        staged = {}
        try:
            for fp in parsed:
                if not fp.path.startswith("src/"):
                    raise ValueError(f"{fp.path} is outside src/")
                rel = fp.path[4:]
                base = lines.get(rel)
                if base is None:
                    # Match on LF lines (patches are LF) and keep the file's own line endings when writing.
                    text = (root / "src" / rel).read_bytes().decode("utf-8")
                    newlines[rel] = "\r\n" if "\r\n" in text else "\n"
                    base = text.replace("\r\n", "\n").split("\n")
                staged[rel] = apply(staged.get(rel, base), fp)
        except (OSError, ValueError) as e:
            log.warning("Skipping %s: %s (upstream may have changed or fixed it)", patch.name, e)
            continue
        lines.update(staged)
        for rel in staged:
            applied.setdefault(rel, []).append(patch.name)

    files = {}
    try:
        for rel, content in lines.items():
            target = out_dir / "src" / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(newlines[rel].join(content).encode("utf-8"))
            files[rel] = {
                "original": _sha1((root / "src" / rel).read_bytes()),
                "path": str(Path(".patched") / "src" / rel).replace("\\", "/"),
                "patches": ", ".join(applied[rel]),
            }
        manifest_path.write_text(json.dumps({"patches": key, "files": files}, indent=1))
    except OSError as e:  # read-only install: run without the fixes rather than fail
        log.warning("Could not write %s: %s", out_dir, e)
        return {}
    for rel, info in files.items():
        log.info("Patched %s (%s)", rel, info["patches"])
    return files


def main() -> None:
    from pob2.engine import find_repo_root

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    files = ensure(find_repo_root())
    print(json.dumps(files, indent=1))
    sys.exit(0)


if __name__ == "__main__":
    main()
