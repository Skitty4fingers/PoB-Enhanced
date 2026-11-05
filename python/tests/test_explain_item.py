"""explain_item: which lines carry a skill's damage when an item is swapped."""

import pytest

pytestmark = pytest.mark.engine

NEW = """Rarity: RARE
Loath Spell
Shrine Sceptre
Item Level: 80
Implicits: 1
Grants Skill: Level 18 Purity of Fire
+152 to maximum Mana
"""


def test_explain_names_the_line_that_carries_the_damage(service):
    service.new_build("Druid", "Oracle", 90)
    sacred = service.call("data.unique", name="Sacred Flame, Shrine Sceptre")
    service.call("items.equip", text=sacred["text"], slot="Weapon 1")
    service.call("skills.add", gems=["Grim Pillars"], makeMain=True)
    check = service.check_item(NEW, "Weapon 1")
    main = next(s for s in check["skills"] if s.get("isMain"))
    ex = service.explain_item(NEW, "Weapon 1", main["group"])
    assert ex["skill"] == "Grim Pillars" and ex["after"] < ex["before"]
    top = ex["lost"][0]
    assert "Extra Fire Damage" in top["text"] and top["percent"] > 20
    fire = next(m for m in ex["moved"] if m["key"] == "FireHitAverage")
    assert fire["after"] == 0 < fire["before"]
    service.new_build("Druid", "Oracle", 90)
