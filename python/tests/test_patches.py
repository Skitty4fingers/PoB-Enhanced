"""Upstream fixes in patches/ apply to copies in .patched/ and src/ stays untouched."""

import json
import shutil

from pob2 import patches
from pob2.engine import find_repo_root

ROOT = find_repo_root()


def test_every_patch_still_applies(tmp_path):
    # A copy of just what ensure() reads, so the test never touches the real .patched/.
    for p in sorted((ROOT / "patches" / "poe2").glob("*.patch")):
        for fp in patches.parse(p.read_text(encoding="utf-8")):
            target = tmp_path / fp.path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / fp.path, target)
    shutil.copytree(ROOT / "patches", tmp_path / "patches")
    files = patches.ensure(tmp_path)
    expected = {"Modules/CalcOffence.lua", "Classes/CalcsTab.lua", "Classes/TradeQuery.lua"}
    assert expected <= files.keys(), "a patch no longer applies: upstream changed or fixed it (see patches/README.md)"
    # src/ is unchanged; the copy differs.
    for rel in expected:
        assert (tmp_path / "src" / rel).read_bytes() == (ROOT / "src" / rel).read_bytes()
        assert (tmp_path / ".patched" / "src" / rel).read_bytes() != (ROOT / "src" / rel).read_bytes()


def test_rebuilds_when_the_original_changes(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "patches" / "poe2").mkdir(parents=True)
    (tmp_path / "src" / "a.lua").write_text("one\ntwo\nthree\n")
    (tmp_path / "patches" / "poe2" / "0001-x.patch").write_text(
        "diff --git a/src/a.lua b/src/a.lua\n--- a/src/a.lua\n+++ b/src/a.lua\n"
        "@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n-- \n2.0\n"
    )
    files = patches.ensure(tmp_path)
    assert (tmp_path / ".patched" / "src" / "a.lua").read_text() == "one\nTWO\nthree\n"
    # Upstream changes the file: the old copy is not reused, and a patch that no longer fits is skipped.
    (tmp_path / "src" / "a.lua").write_text("one\nzwei\nthree\n")
    assert patches.ensure(tmp_path) == {}
    manifest = json.loads((tmp_path / ".patched" / "manifest.json").read_text())
    assert manifest["files"] == {} and files["a.lua"]["original"] != ""


def test_keeps_crlf_line_endings(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "patches" / "poe2").mkdir(parents=True)
    (tmp_path / "src" / "a.lua").write_bytes(b"one\r\ntwo\r\n")
    (tmp_path / "patches" / "poe2" / "0001-x.patch").write_text(
        "--- a/src/a.lua\n+++ b/src/a.lua\n@@ -1,2 +1,2 @@\n one\n-two\n+TWO\n"
    )
    patches.ensure(tmp_path)
    assert (tmp_path / ".patched" / "src" / "a.lua").read_bytes() == b"one\r\nTWO\r\n"
