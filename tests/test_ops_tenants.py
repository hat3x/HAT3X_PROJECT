from kairos_admin.ops import tenants

def test_create_salon_unique_slug(supa):
    a = tenants.create_salon(supa, "Biodental", "dental")
    b = tenants.create_salon(supa, "Biodental", "dental")
    assert a["slug"] == "biodental"
    assert b["slug"] == "biodental-2"
    assert a["active"] is True

def test_list_and_set_active(supa):
    s = tenants.create_salon(supa, "X", "dental")
    tenants.set_active(supa, s["id"], False)
    assert tenants.list_salons(supa)[0]["active"] is False
