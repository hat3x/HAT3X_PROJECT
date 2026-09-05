import base64
import json

from kairos_admin.bridge import Api
from kairos_admin import config as cfg_mod


def _fake_jwt(payload: dict) -> str:
    def b64(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode("utf-8")).rstrip(b"=").decode("ascii")
    return f"{b64({'alg': 'HS256', 'typ': 'JWT'})}.{b64(payload)}.firma-invent"


def test_bridge_first_run_rejects_anon_key(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    api = Api()
    anon_key = _fake_jwt({"role": "anon"})
    res = api.first_run("https://x.supabase.co", anon_key, "master-pw")
    assert "error" in res
    assert cfg_mod.exists() is False


def test_bridge_first_run_accepts_service_role_key(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    api = Api()
    svc_key = _fake_jwt({"role": "service_role"})
    res = api.first_run("https://x.supabase.co", svc_key, "master-pw")
    assert res == {"ok": True}
    assert cfg_mod.exists() is True


def test_bridge_first_run_accepts_new_style_secret_key(tmp_path, monkeypatch):
    # claves nuevas tipo sb_secret_... no son JWT: no se bloquean (no se pueden identificar)
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    api = Api()
    res = api.first_run("https://x.supabase.co", "sb_secret_abc123", "master-pw")
    assert res == {"ok": True}
    assert cfg_mod.exists() is True


def test_bridge_reconfigure_clears_config_and_needs_setup(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    cfg_mod.save(cfg_mod.Config("https://x.supabase.co", "svc", "x"), "master-pw")
    api = Api()
    assert api.needs_setup() is False
    res = api.reconfigure()
    assert res == {"ok": True}
    assert api.needs_setup() is True


def test_bridge_create_and_list(supa):
    api = Api(supa=supa)
    out = api.create_tenant({
        "name": "X", "sector": "dental",
        "owner": {"login_id": "x", "password": "p"},
        "features": {}, "catalog": None,
    })
    assert out["salon"]["slug"] == "x"
    assert len(api.list_tenants()) == 1

def test_bridge_errors_are_returned_not_raised(supa):
    api = Api(supa=supa)
    res = api.set_feature("S1", "feature_inexistente", True, None)
    assert "error" in res

def test_bridge_template(supa):
    api = Api(supa=supa)
    assert len(api.template("dental")["services"]) >= 3

CATALOG = {
    "professionals": [{"full_name": "Nadia Ros"}],
    "services": [{"name": "Revisión", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0}],
    "schedules": [{"professional": "Nadia Ros", "weekday": 1, "start": "10:00", "end": "14:00"}],
    "links": [{"professional": "Nadia Ros", "service": "Revisión"}],
}

def test_bridge_apply_catalog_to_existing_tenant(supa):
    api = Api(supa=supa)
    out = api.create_tenant({
        "name": "Biodental", "sector": "dental",
        "owner": {"login_id": "biodental", "password": "Pw-2026"},
        "features": {}, "catalog": None,
    })
    salon_id = out["salon"]["id"]

    res = api.apply_catalog(salon_id, CATALOG)
    assert res == {"professionals": 1, "services": 1, "schedules": 1, "links": 1}
    assert supa.select("professionals", {"salon_id": salon_id})[0]["full_name"] == "Nadia Ros"
    assert supa.select("services", {"salon_id": salon_id})[0]["name"] == "Revisión"
    assert len(supa.select("professional_schedules", {"salon_id": salon_id})) == 1
    assert len(supa.select("professional_services", {"salon_id": salon_id})) == 1

def test_bridge_apply_catalog_invalid_returns_error(supa):
    api = Api(supa=supa)
    out = api.create_tenant({
        "name": "Biodental", "sector": "dental",
        "owner": {"login_id": "biodental", "password": "Pw-2026"},
        "features": {}, "catalog": None,
    })
    bad = {**CATALOG, "schedules": [{"professional": "Nadia Ros", "weekday": 9, "start": "10:00", "end": "14:00"}]}
    res = api.apply_catalog(out["salon"]["id"], bad)
    assert "error" in res

def test_bridge_get_tenant_includes_owner(supa):
    api = Api(supa=supa)
    out = api.create_tenant({
        "name": "Biodental", "sector": "dental",
        "owner": {"login_id": "biodental", "password": "Pw-2026"},
        "features": {}, "catalog": None,
    })
    salon_id = out["salon"]["id"]

    detail = api.get_tenant(salon_id)
    owner = detail["owner"]
    assert owner["email"] == "biodental@salonos.app"
    assert owner["login_id"] == "biodental"
    assert owner["user_id"]
    # el resto de la forma existente no se rompe
    assert "salon" in detail and "features" in detail and "api_keys" in detail and "catalog" in detail

def test_bridge_get_tenant_owner_none_without_members(supa):
    api = Api(supa=supa)
    salon = supa.insert("salons", [{"name": "Sin dueño", "slug": "sin-dueno", "sector": "dental",
                                     "timezone": "Europe/Madrid", "active": True, "settings": {}}])[0]
    detail = api.get_tenant(salon["id"])
    assert detail["owner"] is None

def test_bridge_pick_file_returns_dict_without_pywebview(supa):
    api = Api(supa=supa)
    res = api.pick_file()
    assert isinstance(res, dict)
