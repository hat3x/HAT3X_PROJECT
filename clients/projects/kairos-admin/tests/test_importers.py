from kairos_admin.importers import load_json, load_csv, validate

CANON = {
    "professionals": [{"full_name": "Nadia Ros"}],
    "services": [{"name": "Revisión", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0}],
    "schedules": [{"professional": "Nadia Ros", "weekday": 1, "start": "10:00", "end": "14:00"}],
    "links": [{"professional": "Nadia Ros", "service": "Revisión"}],
}

def test_load_json_ok():
    import json
    assert validate(load_json(json.dumps(CANON))) == []

def test_validate_bad_weekday():
    bad = {**CANON, "schedules": [{"professional": "Nadia Ros", "weekday": 9, "start": "10:00", "end": "14:00"}]}
    errs = validate(bad)
    assert any("weekday" in e for e in errs)

def test_validate_unknown_reference():
    bad = {**CANON, "links": [{"professional": "Fantasma", "service": "Revisión"}]}
    assert any("Fantasma" in e for e in validate(bad))

def test_load_csv_services():
    csv_text = "name,application_min,exposure_min,post_exposure_min\nRevisión,20,0,0\n"
    rows = load_csv(csv_text, "services")
    assert rows[0]["application_min"] == 20  # convertido a int
