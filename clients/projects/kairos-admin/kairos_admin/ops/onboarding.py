"""Alta de tenant: orquesta salón + owner + add-ons + catálogo + API key."""
from kairos_admin.ops import tenants, features, access, catalog as catalog_ops

def create_tenant(supa, payload):
    salon = tenants.create_salon(
        supa, payload["name"], payload["sector"],
        payload.get("timezone", "Europe/Madrid"),
    )
    sid = salon["id"]

    owner_in = payload["owner"]
    owner = access.create_owner(supa, sid, owner_in["login_id"], owner_in["password"])

    applied_features = []
    for feat, cfg in (payload.get("features") or {}).items():
        features.set_feature(supa, sid, feat, cfg.get("enabled", False), cfg.get("notes"))
        applied_features.append(feat)

    catalog_summary = None
    if payload.get("catalog"):
        catalog_summary = catalog_ops.apply_catalog(supa, sid, payload["catalog"])

    api_key = None
    if payload.get("issue_api_key"):
        api_key = access.issue_api_key(supa, sid, payload["issue_api_key"]["name"])

    return {
        "salon": salon,
        "owner": {"login_id": owner_in["login_id"], "email": owner["email"],
                  "password": owner_in["password"]},
        "features": applied_features,
        "catalog": catalog_summary,
        "api_key": api_key,
    }
