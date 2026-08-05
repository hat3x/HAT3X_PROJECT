from kairos_admin.ops import onboarding

PAYLOAD = {
    "name": "Biodental", "sector": "dental",
    "owner": {"login_id": "biodental", "password": "Pw-2026"},
    "features": {"ai_receptionist": {"enabled": True, "notes": "Sara"}},
    "catalog": {
        "professionals": [{"full_name": "Nadia Ros"}],
        "services": [{"name": "Revisión", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0}],
        "schedules": [{"professional": "Nadia Ros", "weekday": 1, "start": "10:00", "end": "14:00"}],
        "links": [{"professional": "Nadia Ros", "service": "Revisión"}],
    },
    "issue_api_key": {"name": "Recepción"},
}

def test_create_tenant_full(supa):
    out = onboarding.create_tenant(supa, PAYLOAD)
    assert out["salon"]["slug"] == "biodental"
    assert out["owner"]["email"] == "biodental@salonos.app"
    assert out["owner"]["password"] == "Pw-2026"
    assert out["catalog"]["services"] == 1
    assert out["api_key"]["key"].startswith("sk_recep_")
    # efectos en BD
    assert supa.select("salon_members", {"salon_id": out["salon"]["id"]})[0]["role"] == "owner"
    feats = supa.select("salon_features", {"salon_id": out["salon"]["id"], "feature": "ai_receptionist"})
    assert feats[0]["enabled"] is True and feats[0]["notes"] == "Sara"
