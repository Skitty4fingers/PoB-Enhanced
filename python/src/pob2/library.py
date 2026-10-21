"""Game knowledge library (library/poe2/*.md) for AI agents: an index and the files themselves."""

from __future__ import annotations

import re
from pathlib import Path

from pob2.engine import find_repo_root

_ROW = re.compile(r"^\|\s*\[([\w.-]+\.md)\]\([^)]*\)\s*\|\s*(.+?)\s*\|\s*$")


def _dir() -> Path:
    return find_repo_root() / "library" / "poe2"


def _tool_names() -> str:
    readme = find_repo_root() / "library" / "README.md"
    text = readme.read_text(encoding="utf-8") if readme.is_file() else ""
    return text[text.find("## Tool names") :] if "## Tool names" in text else ""


def index() -> dict[str, object]:
    """Topics with what each covers (from library/poe2/README.md)."""
    d = _dir()
    readme = (d / "README.md").read_text(encoding="utf-8") if (d / "README.md").is_file() else ""
    covers = {m.group(1): m.group(2).replace("**", "") for line in readme.splitlines() if (m := _ROW.match(line))}
    topics = [
        {"topic": p.stem, "covers": covers.get(p.name, "")} for p in sorted(d.glob("*.md")) if p.name != "README.md"
    ]
    return {
        "game": "Path of Exile 2",
        "topics": topics,
        "note": "Written against PoE2 0.5.5. Numbers PoB calculates beat these files; these cover what PoB doesn't.",
        "toolNames": _tool_names(),
    }


def read(topic: str) -> dict[str, str]:
    """One file by topic (e.g. '04-skills-and-gems', 'skills-and-gems' or '04')."""
    want = topic.strip().lower().removesuffix(".md")
    files = [p for p in sorted(_dir().glob("*.md")) if p.name != "README.md"]
    match = next((p for p in files if p.stem == want), None) or next(
        (p for p in files if p.stem.split("-", 1)[-1] == want or p.stem.split("-", 1)[0] == want or want in p.stem),
        None,
    )
    if match is None:
        raise ValueError(f"No library topic {topic!r}. Topics: {', '.join(p.stem for p in files)}")
    return {"topic": match.stem, "content": match.read_text(encoding="utf-8"), "toolNames": _tool_names()}
