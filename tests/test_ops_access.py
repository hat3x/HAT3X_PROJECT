import hashlib
from kairos_admin.ops import access

def test_create_owner_email_and_member(supa):
    out = access.create_owner(supa, "S1", "biodental", "Pw-2026")
    assert out["email"] == "biodental@salonos.app"
    members = supa.select("salon_members", {"salon_id": "S1"})
    assert members[0]["role"] == "owner"
    assert members[0]["user_id"] == out["user_id"]

def test_issue_api_key_stores_hash_only(supa):
    out = access.issue_api_key(supa, "S1", "Recepción")
    assert out["key"].startswith("sk_recep_")
    row = supa.select("service_api_keys", {"salon_id": "S1"})[0]
    assert "key" not in row
    assert row["key_hash"] == hashlib.sha256(out["key"].encode()).hexdigest()
    assert row["key_prefix"] == out["key"][:15]

def test_list_api_keys_hides_secret(supa):
    access.issue_api_key(supa, "S1", "Recepción")
    listed = access.list_api_keys(supa, "S1")
    assert "key_hash" not in listed[0] and "key" not in listed[0]
    assert "key_prefix" in listed[0]
