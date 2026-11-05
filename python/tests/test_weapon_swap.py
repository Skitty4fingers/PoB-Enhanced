"""Swapping a Sceptre in Weapon 1 must keep the off hand (PoB treated unlisted weapon types as two-handed)."""

import pytest

pytestmark = pytest.mark.engine

SCEPTRE = """Rarity: RARE
Test Flame
Shrine Sceptre
Item Level: 80
Implicits: 0
+50 to maximum Mana
"""
FOCUS = """Rarity: RARE
Test Focus
Woven Focus
Item Level: 80
Implicits: 0
+80 to maximum Energy Shield
"""


def test_replacing_a_sceptre_keeps_the_off_hand(service):
    service.new_build("Druid", "Oracle", 90)
    service.call("items.equip", text=SCEPTRE, slot="Weapon 1")
    service.call("items.equip", text=FOCUS, slot="Weapon 2")
    check = service.check_item(SCEPTRE, "Weapon 1")
    es = check["defence"]["EnergyShield"]
    assert es["before"] > 0 and es["after"] == es["before"]
    service.new_build("Druid", "Oracle", 90)
