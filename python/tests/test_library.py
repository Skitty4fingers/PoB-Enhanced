import pytest

from pob2 import library


def test_index_lists_every_topic_with_what_it_covers():
    idx = library.index()
    topics = {t["topic"]: t["covers"] for t in idx["topics"]}
    assert len(topics) >= 17 and "README" not in topics
    assert "Gem tier" in topics["04-skills-and-gems"]
    assert "build_check" in idx["toolNames"]  # tool names translated for this server


@pytest.mark.parametrize("topic", ["15-runes-and-augments", "runes-and-augments", "15", "runes"])
def test_read_by_name_number_or_word(topic):
    assert library.read(topic)["topic"] == "15-runes-and-augments"


def test_unknown_topic_lists_the_real_ones():
    with pytest.raises(ValueError, match="04-skills-and-gems"):
        library.read("nope")
