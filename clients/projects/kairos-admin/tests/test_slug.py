from kairos_admin.slug import slugify, ensure_unique

def test_slugify_accents_and_spaces():
    assert slugify("Clínica Ñandú  Dental") == "clinica-nandu-dental"

def test_ensure_unique():
    assert ensure_unique("biodental", set()) == "biodental"
    assert ensure_unique("biodental", {"biodental"}) == "biodental-2"
    assert ensure_unique("biodental", {"biodental", "biodental-2"}) == "biodental-3"
