import json
from kairos_admin.supa import SupabaseClient

class FakeResp:
    def __init__(self, status, body): self.status_code = status; self._b = body
    def json(self): return self._b
    @property
    def text(self): return json.dumps(self._b)

class FakeSession:
    def __init__(self): self.calls = []
    def request(self, method, url, headers=None, params=None, json=None, timeout=None):
        self.calls.append({"method": method, "url": url, "params": params, "json": json, "headers": headers})
        return FakeResp(200, [{"id": "new-id"}])

def test_insert_builds_rest_request():
    sess = FakeSession()
    c = SupabaseClient("https://p.supabase.co", "svckey", session=sess)
    out = c.insert("salons", [{"name": "X"}])
    call = sess.calls[-1]
    assert call["method"] == "POST"
    assert call["url"].endswith("/rest/v1/salons")
    assert call["headers"]["apikey"] == "svckey"
    assert call["headers"]["Prefer"] == "return=representation"
    assert out == [{"id": "new-id"}]

def test_select_builds_filters():
    sess = FakeSession()
    c = SupabaseClient("https://p.supabase.co", "svc", session=sess)
    c.select("salon_features", {"salon_id": "S1"}, columns="feature,enabled")
    call = sess.calls[-1]
    assert call["method"] == "GET"
    assert call["params"]["salon_id"] == "eq.S1"
    assert call["params"]["select"] == "feature,enabled"

def test_auth_get_user_builds_admin_request():
    sess = FakeSession()
    c = SupabaseClient("https://p.supabase.co", "svc", session=sess)
    c.auth_get_user("uid-1")
    call = sess.calls[-1]
    assert call["method"] == "GET"
    assert call["url"].endswith("/auth/v1/admin/users/uid-1")
    assert call["headers"]["apikey"] == "svc"
