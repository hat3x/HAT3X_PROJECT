import pytest
from kairos_admin.config import Config, save, load, exists
from kairos_admin.crypto import BadPassword

def test_save_load_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    assert exists() is False
    cfg = Config(supabase_url="https://x.supabase.co", service_role_key="svc", project_ref="x")
    save(cfg, "master")
    assert exists() is True
    got = load("master")
    assert got.service_role_key == "svc"

def test_wrong_master_password(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    save(Config("u", "svc", "r"), "right")
    with pytest.raises(BadPassword):
        load("wrong")
