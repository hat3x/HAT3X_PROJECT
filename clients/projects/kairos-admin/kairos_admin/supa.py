"""Cliente Supabase (service_role): PostgREST + Auth admin API. Transporte inyectable."""
import requests

class SupabaseError(Exception):
    pass

class SupabaseClient:
    def __init__(self, url: str, service_role_key: str, session=None):
        self.url = url.rstrip("/")
        self.key = service_role_key
        self.session = session or requests.Session()

    def _headers(self, extra=None):
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}",
             "Content-Type": "application/json"}
        if extra:
            h.update(extra)
        return h

    def _call(self, method, path, params=None, body=None, headers=None):
        resp = self.session.request(method, self.url + path, headers=self._headers(headers),
                                    params=params, json=body, timeout=30)
        if resp.status_code >= 300:
            raise SupabaseError(f"{resp.status_code}: {resp.text[:300]}")
        try:
            return resp.json()
        except Exception:
            return None

    # ---- PostgREST ----
    def select(self, table, filters=None, columns="*"):
        params = {"select": columns}
        for k, v in (filters or {}).items():
            params[k] = f"eq.{v}"
        return self._call("GET", f"/rest/v1/{table}", params=params) or []

    def insert(self, table, rows):
        return self._call("POST", f"/rest/v1/{table}", body=rows,
                          headers={"Prefer": "return=representation"}) or []

    def update(self, table, filters, patch):
        params = {k: f"eq.{v}" for k, v in filters.items()}
        return self._call("PATCH", f"/rest/v1/{table}", params=params, body=patch,
                          headers={"Prefer": "return=representation"}) or []

    def delete(self, table, filters):
        params = {k: f"eq.{v}" for k, v in filters.items()}
        self._call("DELETE", f"/rest/v1/{table}", params=params)

    # ---- Auth admin ----
    def auth_create_user(self, email, password):
        return self._call("POST", "/auth/v1/admin/users",
                          body={"email": email, "password": password, "email_confirm": True})

    def auth_update_user(self, uid, patch):
        return self._call("PUT", f"/auth/v1/admin/users/{uid}", body=patch)

    def auth_get_user(self, uid):
        return self._call("GET", f"/auth/v1/admin/users/{uid}")
