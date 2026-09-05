"""Add-ons del salón (salon_features)."""
FEATURES = ["loyalty", "client_app", "staff_app", "ai_receptionist", "pos"]

def get_features(supa, salon_id):
    rows = {r["feature"]: r for r in supa.select("salon_features", {"salon_id": salon_id})}
    out = {}
    for f in FEATURES:
        r = rows.get(f)
        out[f] = {"enabled": bool(r["enabled"]) if r else False,
                  "notes": (r.get("notes") if r else None)}
    return out

def set_feature(supa, salon_id, feature, enabled, notes=None):
    if feature not in FEATURES:
        raise ValueError(f"feature desconocida: {feature}")
    existing = supa.select("salon_features", {"salon_id": salon_id, "feature": feature})
    patch = {"enabled": enabled, "notes": notes}
    if existing:
        return supa.update("salon_features", {"salon_id": salon_id, "feature": feature}, patch)[0]
    return supa.insert("salon_features", [{"salon_id": salon_id, "feature": feature, **patch}])[0]
