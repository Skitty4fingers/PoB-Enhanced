import re

from pob2 import __version__
from pob2.engine import find_repo_root
from pob2.version import build_info


def test_version_comes_from_pyproject():
    pyproject = (find_repo_root() / "python" / "pyproject.toml").read_text(encoding="utf-8")
    assert __version__ == re.search(r'^version = "([^"]+)"', pyproject, re.M).group(1)


def test_build_info_prefers_the_image_stamp(monkeypatch):
    monkeypatch.setenv("POB2_COMMIT", "abc123def")
    monkeypatch.setenv("POB2_BUILT", "2026-10-24T20:00:00Z")
    build_info.cache_clear()
    try:
        info = build_info(find_repo_root())
    finally:
        build_info.cache_clear()
    assert info["version"] == __version__
    assert info["commit"] == "abc123def" and info["built"] == "2026-10-24T20:00:00Z"
    assert re.fullmatch(r"\d+\.\d+\.\d+", info["upstream"])
