"""Item-granted jewel sockets (Cadigan's Epiphany) take rare or magic jewels only; worn Limited-to-1 uniques are not
suggested again."""

import pytest

pytestmark = pytest.mark.engine

SOCKETS = [7960, 21984, 26196, 55190]
GLOVES = """Rarity: RARE
Woe Claw
Runeforged Blacksteel Gauntlets
Quality: 20
Sockets: S
Rune: Cadigan's Epiphany
Sockets: J
LevelReq: 80
Implicits: 1
{enchant}{rune}Destroys all Augment Sockets on the item to create a Jewel Socket
+135 to maximum Life
"""
RARE_JEWEL = "Rarity: RARE\nSol Creed\nSapphire\nItem Level: 80\n{range:0.5}10% increased maximum Energy Shield\n"
HEART = """Rarity: UNIQUE
Heart of the Well
Diamond
Limited to: 1
Implicits: 0
Gain 15% of Damage as Extra Cold Damage
Gain 15% of Damage as Extra Lightning Damage
"""


@pytest.fixture()
def build(service):
    service.new_build("Druid", "Oracle", 90)
    service.call("tree.allocate", ids=SOCKETS)
    service.call("items.equip", text=GLOVES, slot="Gloves")
    yield service
    service.new_build("Druid", "Oracle", 90)


def test_item_socket_listed_as_rare_only(build):
    build.call("items.equip", text=RARE_JEWEL, slot="Gloves Jewel Socket 1")
    slots = {s["slot"]: s for s in build.call("gear.slots")}
    assert slots["Gloves Jewel Socket 1"]["itemSocket"] is True
    assert "itemSocket" not in slots["Jewel 7960"]
    res = build.call("gear.jewels", metric="balanced", slot="Gloves Jewel Socket 1", limit=3)
    (sock,) = res["itemSockets"]
    assert sock["slot"] == "Gloves Jewel Socket 1" and sock["currentRarity"] == "RARE"
    assert "unique" in sock["rule"]


def test_worn_limited_unique_not_suggested_again(build):
    build.call("items.equip", text=HEART, slot="Jewel 7960")
    res = build.call("gear.jewels", metric="balanced", slot="Jewel 21984", limit=20, plan=False)
    assert res["worn"] == {"Heart of the Well": "Jewel 7960"}
    names = {row["name"] for sock in res["sockets"] for row in sock["suggestions"]}
    assert "Heart of the Well" not in names
    assert "plan" not in res


def test_plan_with_empty_sockets_uses_each_unique_once(build):
    # Regression: multi-pick uniques (Heart of the Well, Megalomaniac) crashed the plan when copied with a single pick.
    res = build.call("gear.jewels", metric="balanced", limit=4)
    steps = res["plan"]["steps"]
    assert steps and len({s["name"] for s in steps}) == len(steps)
    assert len({s["slot"] for s in steps}) == len(steps)
    assert res["plan"]["total"]["score"] > 0
