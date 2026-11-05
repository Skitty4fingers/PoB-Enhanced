"""check_item: replacing an item that grants a skill only 'loses' it when the replacement doesn't grant it too."""

import pytest

pytestmark = pytest.mark.engine

CURRENT = """Rarity: RARE
Old Flame
Shrine Sceptre
Item Level: 80
Implicits: 1
Grants Skill: Level 20 Purity of Fire
+50 to maximum Mana
"""
SAME_SKILL = """Rarity: RARE
New Flame
Shrine Sceptre
Item Level: 80
Implicits: 1
Grants Skill: Level 18 Purity of Fire
+152 to maximum Mana
"""
NO_SKILL = """Rarity: RARE
Plain Rod
Shrine Sceptre
Item Level: 80
Implicits: 0
+152 to maximum Mana
"""


@pytest.fixture()
def build(service):
    service.new_build("Druid", "Oracle", 90)
    service.call("items.equip", text=CURRENT, slot="Weapon 1")
    yield service
    service.new_build("Druid", "Oracle", 90)


def test_replacement_granting_the_same_skill_loses_nothing(build):
    check = build.check_item(SAME_SKILL, "Weapon 1")
    assert check["lostSkills"] == []
    assert not any("Removes skills" in w for w in check["warnings"])


def test_replacement_without_the_skill_loses_it(build):
    check = build.check_item(NO_SKILL, "Weapon 1")
    assert check["lostSkills"] == ["Purity of Fire"]
    assert any("Purity of Fire" in w for w in check["warnings"])
