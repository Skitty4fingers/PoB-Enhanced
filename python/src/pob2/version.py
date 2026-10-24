"""Version and build identity.

The version number lives in python/pyproject.toml. Docker images also carry the git commit and build time
(POB2_COMMIT / POB2_BUILT, set by scripts/build-image.sh); a checkout falls back to asking git.
"""

from __future__ import annotations

import os
import re
import subprocess
from functools import cache
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

try:
    __version__ = version("pob2-enhanced")
except PackageNotFoundError:  # running from a source tree without the package installed
    __version__ = "0.0.0"


def _git(root: Path, *args: str) -> str | None:
    try:
        out = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() if out.returncode == 0 else None


def _commit(root: Path) -> str | None:
    commit = _git(root, "rev-parse", "--short=9", "HEAD")
    if commit and _git(root, "status", "--porcelain", "--untracked-files=no"):
        commit += "-dirty"
    return commit


def _upstream(root: Path) -> str | None:
    """The upstream Path of Building version this fork is based on (from manifest.xml)."""
    try:
        match = re.search(r'<Version number="([^"]+)"', (root / "manifest.xml").read_text(encoding="utf-8"))
    except OSError:
        return None
    return match.group(1) if match else None


@cache
def build_info(root: Path) -> dict[str, Any]:
    return {
        "version": __version__,
        "commit": os.environ.get("POB2_COMMIT") or _commit(root),
        "built": os.environ.get("POB2_BUILT") or None,
        "upstream": _upstream(root),
    }
