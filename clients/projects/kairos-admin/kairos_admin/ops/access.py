"""Acceso del tenant: login del dueño, reset de contraseña, API keys de recepción."""
import hashlib, secrets

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

def create_owner(supa, salon_id, login_id, password):
    email = f"{login_id}@salonos.app"
    user = supa.auth_create_user(email, password)
    uid = user["id"]
    supa.insert("salon_members", [{"salon_id": salon_id, "user_id": uid, "role": "owner"}])
    return {"user_id": uid, "email": email}

def reset_password(supa, user_id, new_password):
    supa.auth_update_user(user_id, {"password": new_password})

def gen_api_key():
    token = "".join(secrets.choice(_ALPHABET) for _ in range(43))
    key = "sk_recep_" + token
    return key, hashlib.sha256(key.encode()).hexdigest(), key[:15]

def issue_api_key(supa, salon_id, name, scopes=("appointments:write",)):
    key, key_hash, key_prefix = gen_api_key()
    supa.insert("service_api_keys", [{
        "salon_id": salon_id, "name": name, "key_hash": key_hash,
        "key_prefix": key_prefix, "scopes": list(scopes),
    }])
    return {"key": key, "prefix": key_prefix}

def list_api_keys(supa, salon_id):
    rows = supa.select("service_api_keys", {"salon_id": salon_id},
                       columns="id,name,key_prefix,created_at")
    return rows

def revoke_api_key(supa, key_id):
    supa.delete("service_api_keys", {"id": key_id})
