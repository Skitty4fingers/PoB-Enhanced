"""check_item with jewels (Item Class: Jewels). The first tests run without LuaJIT."""

from types import SimpleNamespace

import pytest

from pob2.engine import find_repo_root
from pob2.service import PoBService

PRISM = """Item Class: Jewels
Rarity: Unique
Prism of Belief
Diamond
--------
Limited to: 1
--------
Item Level: 84
--------
+3 to Level of all Ice Shards Skills
--------
Entropy can be reversed.
--------
Place into an allocated Jewel Socket on the Passive Skill Tree. Right click to remove from the Socket.
--------
Corrupted"""


def test_service_passes_jewel_text_and_socket_through():
    calls = []
    svc = PoBService.__new__(PoBService)
    svc.call = lambda method, **params: calls.append((method, params)) or {"verdict": "sidegrade"}  # type: ignore
    assert svc.check_item(PRISM, "Jewel 26725")["verdict"] == "sidegrade"
    assert calls == [("budget.check_item", {"text": PRISM, "slot": "Jewel 26725"})]


def test_mcp_check_item_accepts_jewel_text(monkeypatch):
    from pob2 import mcp_server

    seen = []
    fake = SimpleNamespace(check_item=lambda text, slot=None: seen.append((text, slot)) or {"verdict": "upgrade"})
    monkeypatch.setattr(mcp_server, "svc", lambda: fake)
    assert mcp_server.check_item(PRISM)["verdict"] == "upgrade"
    assert seen == [(PRISM, None)]


def test_lua_routes_jewels_to_sockets_before_the_primary_slot_lookup():
    # Regression: a jewel's primary slot is "Jewel", which is not a slot, so it failed with "No slot for Jewel items".
    lua = (find_repo_root() / "engine" / "pobapi" / "api" / "budget.lua").read_text(encoding="utf-8")
    body = lua[lua.index("local function slotFor") : lua.index("function M.check_item")]
    assert body.index('item.type == "Jewel"') < body.index("GetPrimarySlot()")
    assert "jewelSlotsFor" in lua and "unsupported" in lua


@pytest.mark.engine
def test_check_item_jewel_in_allocated_socket(service):
    service.new_build("Witch", "Infernalist", 90)
    service.call("skills.add", gems=["Ice Shards"])
    sockets = service.call("items.list", includeEmpty=True)
    socket = next((s for s in sockets if s.get("jewelNodeId")), None)
    if socket is None:
        pytest.skip("no jewel sockets in this tree")
    service.call("tree.allocate", ids=[socket["jewelNodeId"]])
    check = service.check_item(PRISM)
    assert check["slot"].startswith("Jewel ") and check["verdict"] in {"upgrade", "sidegrade", "downgrade"}
    assert "Entropy can be reversed." in check["unsupported"]
    assert service.check_item(PRISM, check["slot"])["slot"] == check["slot"]
    with pytest.raises(Exception, match="jewel socket"):
        service.check_item(PRISM, "Weapon 1")
