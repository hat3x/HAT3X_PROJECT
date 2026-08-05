import pytest
from kairos_admin.ops import catalog

CAT = {
    "professionals": [{"full_name": "Nadia Ros"}],
    "services": [{"name": "Revisión", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0}],
    "schedules": [{"professional": "Nadia Ros", "weekday": 1, "start": "10:00", "end": "14:00"}],
    "links": [{"professional": "Nadia Ros", "service": "Revisión"}],
}

def test_apply_catalog_counts_and_links(supa):
    res = catalog.apply_catalog(supa, "S1", CAT)
    assert res == {"professionals": 1, "services": 1, "schedules": 1, "links": 1}
    sched = supa.select("professional_schedules", {"salon_id": "S1"})[0]
    assert sched["weekday"] == 1 and sched["start_time"] == "10:00:00"
    link = supa.select("professional_services", {"salon_id": "S1"})[0]
    prof = supa.select("professionals", {"salon_id": "S1"})[0]
    svc = supa.select("services", {"salon_id": "S1"})[0]
    assert link["professional_id"] == prof["id"] and link["service_id"] == svc["id"]

def test_apply_invalid_raises(supa):
    bad = {**CAT, "schedules": [{"professional": "Nadia Ros", "weekday": 9, "start": "10:00", "end": "14:00"}]}
    with pytest.raises(ValueError):
        catalog.apply_catalog(supa, "S1", bad)
