from kairos_admin.ops import features

def test_defaults_all_disabled(supa):
    f = features.get_features(supa, "S1")
    assert set(f.keys()) == set(features.FEATURES)
    assert f["pos"]["enabled"] is False

def test_set_feature_upsert_and_notes(supa):
    features.set_feature(supa, "S1", "ai_receptionist", True, notes="Sara")
    features.set_feature(supa, "S1", "ai_receptionist", True, notes="Noa")  # update, no duplica
    f = features.get_features(supa, "S1")
    assert f["ai_receptionist"]["enabled"] is True
    assert f["ai_receptionist"]["notes"] == "Noa"
    assert len(supa.select("salon_features", {"salon_id": "S1", "feature": "ai_receptionist"})) == 1
