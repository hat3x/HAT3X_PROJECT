from kairos_admin.templates import SECTORS, get_template
from kairos_admin.importers import validate

def test_sectors_present():
    assert "dental" in SECTORS and "peluqueria" in SECTORS

def test_templates_are_valid():
    for s in SECTORS:
        assert validate(get_template(s)) == []

def test_dental_has_services():
    assert len(get_template("dental")["services"]) >= 3
