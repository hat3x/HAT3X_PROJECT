"""API expuesta a la UI (window.pywebview.api). Traduce llamadas JS → ops. Nunca lanza:
devuelve {"error": msg} para que la UI lo muestre."""
import functools
from kairos_admin import config as cfg_mod
from kairos_admin.keycheck import service_role_role
from kairos_admin.supa import SupabaseClient
from kairos_admin.ops import tenants, features, access, catalog as catalog_ops, onboarding
from kairos_admin import templates, importers

def _safe(fn):
    @functools.wraps(fn)
    def wrap(self, *a, **k):
        try:
            return fn(self, *a, **k)
        except Exception as exc:  # noqa: BLE001 — frontera con la UI
            return {"error": str(exc)}
    return wrap

class Api:
    def __init__(self, supa=None):
        self._supa = supa  # en tests se inyecta un FakeSupabase

    # ---- setup / unlock ----
    def needs_setup(self):
        return not cfg_mod.exists()

    @_safe
    def first_run(self, url, service_role, master):
        if service_role_role(service_role) == "anon":
            return {
                "error": "Esa es la clave pública (anon): no puede ver los datos por RLS. "
                         "Pega la clave secreta 'service_role' de Supabase → Settings → API."
            }
        cfg_mod.save(cfg_mod.Config(url, service_role, ""), master)
        self._supa = SupabaseClient(url, service_role)
        return {"ok": True}

    @_safe
    def unlock(self, master):
        cfg = cfg_mod.load(master)
        self._supa = SupabaseClient(cfg.supabase_url, cfg.service_role_key)
        return {"ok": True}

    # ---- tenants ----
    @_safe
    def list_tenants(self):
        return tenants.list_salons(self._supa)

    @_safe
    def get_tenant(self, salon_id):
        salon = [s for s in tenants.list_salons(self._supa) if s["id"] == salon_id]
        return {
            "salon": salon[0] if salon else None,
            "features": features.get_features(self._supa, salon_id),
            "api_keys": access.list_api_keys(self._supa, salon_id),
            "catalog": catalog_ops.get_catalog(self._supa, salon_id),
            "owner": self._get_owner(salon_id),
        }

    def _get_owner(self, salon_id):
        members = self._supa.select("salon_members", {"salon_id": salon_id, "role": "owner"})
        if not members:
            return None
        user_id = members[0]["user_id"]
        user = self._supa.auth_get_user(user_id) or {}
        email = user.get("email") or ""
        login_id = email.split("@", 1)[0] if email else None
        return {"user_id": user_id, "email": email or None, "login_id": login_id}

    @_safe
    def create_tenant(self, payload):
        return onboarding.create_tenant(self._supa, payload)

    @_safe
    def set_feature(self, salon_id, feature, enabled, notes):
        return features.set_feature(self._supa, salon_id, feature, enabled, notes)

    @_safe
    def set_active(self, salon_id, active):
        return tenants.set_active(self._supa, salon_id, active)

    @_safe
    def reset_password(self, user_id, new_password):
        access.reset_password(self._supa, user_id, new_password)
        return {"ok": True}

    @_safe
    def issue_key(self, salon_id, name):
        return access.issue_api_key(self._supa, salon_id, name)

    @_safe
    def revoke_key(self, key_id):
        access.revoke_api_key(self._supa, key_id)
        return {"ok": True}

    # ---- catálogo ----
    @_safe
    def template(self, sector):
        return templates.get_template(sector)

    @_safe
    def import_file(self, path, kind):
        text = open(path, encoding="utf-8").read()
        if path.lower().endswith(".json"):
            return importers.load_json(text)
        return importers.load_csv(text, kind)

    @_safe
    def validate_catalog(self, catalog):
        return {"errors": importers.validate(catalog)}

    @_safe
    def apply_catalog(self, salon_id, catalog):
        return catalog_ops.apply_catalog(self._supa, salon_id, catalog)

    @_safe
    def pick_file(self):
        import webview  # import perezoso: no requerido para importar bridge en tests
        result = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False,
            file_types=("Catálogo (*.json;*.csv)", "Todos (*.*)"),
        )
        path = result[0] if result else None
        return {"path": path}
