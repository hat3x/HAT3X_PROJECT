"""Operaciones sobre salones (tenants)."""
from kairos_admin.slug import slugify, ensure_unique

def list_salons(supa):
    return supa.select("salons", columns="id,name,slug,sector,timezone,active,settings")

def create_salon(supa, name, sector, timezone="Europe/Madrid"):
    existing = {s["slug"] for s in supa.select("salons", columns="slug")}
    slug = ensure_unique(slugify(name), existing)
    rows = supa.insert("salons", [{
        "name": name, "slug": slug, "sector": sector,
        "timezone": timezone, "active": True, "settings": {},
    }])
    return rows[0]

def set_active(supa, salon_id, active):
    return supa.update("salons", {"id": salon_id}, {"active": active})[0]

def update_salon(supa, salon_id, patch):
    return supa.update("salons", {"id": salon_id}, patch)[0]
