import pytest
from kairos_admin.config import Config, save, load, exists, clear
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

def test_clear_removes_config_file(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    save(Config("https://x.supabase.co", "svc", "x"), "master")
    assert exists() is True
    clear()
    assert exists() is False

def test_clear_is_noop_when_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    assert exists() is False
    clear()  # no debe lanzar
    assert exists() is False
