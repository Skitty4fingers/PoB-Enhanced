from __future__ import annotations

from pob2 import market


def test_listing_text_strips_markup_and_counts_implicits() -> None:
    item = {
        "rarity": "Rare",
        "name": "Oblivion Gyre",
        "typeLine": "Sapphire Ring",
        "baseType": "Sapphire Ring",
        "ilvl": 56,
        "implicitMods": [{"description": "+23% to [Resistances|Cold Resistance]"}],
        "explicitMods": [
            {"description": "20% increased [Cold] Damage"},
            {"description": "15% increased [LightRadius|Light Radius]"},
        ],
    }
    lines = market.listing_text(item).split("\n")
    assert lines[:4] == ["Rarity: RARE", "Oblivion Gyre", "Sapphire Ring", "Item Level: 56"]
    assert lines[4] == "Implicits: 1"
    assert lines[5:] == ["+23% to Cold Resistance", "20% increased Cold Damage", "15% increased Light Radius"]


def test_listing_price_converts_to_divine() -> None:
    rates = {"exalted": 200.0}
    assert market.listing_price({"price": {"amount": 2, "currency": "divine"}}, rates) == 2
    assert market.listing_price({"price": {"amount": 100, "currency": "exalted"}}, rates) == 0.5
    assert market.listing_price({"price": {"amount": 1, "currency": "mystery"}}, rates) is None


def test_with_max_price_does_not_mutate() -> None:
    query = {"query": {"status": {"option": "online"}}}
    capped = market.with_max_price(query, 3)
    assert capped["query"]["filters"]["trade_filters"]["filters"]["price"] == {"option": "divine", "max": 3}
    assert "filters" not in query["query"]


def test_anonymous_query_replaces_weights_with_a_count_group() -> None:
    weighted = {
        "engine": "new",
        "query": {
            "stats": [
                {"type": "weight", "filters": [{"id": f"explicit.stat_{i}", "value": {"weight": 1}} for i in range(20)]}
            ]
        },
        "sort": {"statgroup.0": "desc"},
    }
    q = market.anonymous_query(weighted, need=3, top=8)
    group = q["query"]["stats"][0]
    assert group["type"] == "count" and group["value"] == {"min": 3} and len(group["filters"]) == 8
    assert "engine" not in q and q["sort"] == {"price": "asc"}
    assert weighted["query"]["stats"][0]["type"] == "weight"
