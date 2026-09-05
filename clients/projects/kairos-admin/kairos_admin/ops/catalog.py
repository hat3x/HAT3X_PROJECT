"""Catálogo del salón: aplicar (sembrar/importar) y leer."""
from kairos_admin.importers import validate

def _hhmmss(t):
    return t if len(t) == 8 else f"{t}:00"

def apply_catalog(supa, salon_id, catalog):
    errors = validate(catalog)
    if errors:
        raise ValueError("Catálogo inválido: " + "; ".join(errors))

    prof_id = {}
    for p in catalog.get("professionals", []):
        row = supa.insert("professionals", [{
            "salon_id": salon_id, "full_name": p["full_name"],
            "color": p.get("color"), "active": True,
        }])[0]
        prof_id[p["full_name"]] = row["id"]

    svc_id = {}
    for s in catalog.get("services", []):
        row = supa.insert("services", [{
            "salon_id": salon_id, "name": s["name"], "category": s.get("category"),
            "application_min": s.get("application_min", 0),
            "exposure_min": s.get("exposure_min", 0),
            "post_exposure_min": s.get("post_exposure_min", 0),
            "price_cents": s.get("price_cents", 0), "currency": s.get("currency", "EUR"),
            "active": True,
        }])[0]
        svc_id[s["name"]] = row["id"]

    n_sched = 0
    for sch in catalog.get("schedules", []):
        supa.insert("professional_schedules", [{
            "salon_id": salon_id, "professional_id": prof_id[sch["professional"]],
            "weekday": sch["weekday"], "start_time": _hhmmss(sch["start"]),
            "end_time": _hhmmss(sch["end"]),
        }])
        n_sched += 1

    n_links = 0
    for ln in catalog.get("links", []):
        supa.insert("professional_services", [{
            "salon_id": salon_id, "professional_id": prof_id[ln["professional"]],
            "service_id": svc_id[ln["service"]],
        }])
        n_links += 1

    return {"professionals": len(prof_id), "services": len(svc_id),
            "schedules": n_sched, "links": n_links}

def get_catalog(supa, salon_id):
    return {
        "professionals": supa.select("professionals", {"salon_id": salon_id}),
        "services": supa.select("services", {"salon_id": salon_id}),
        "schedules": supa.select("professional_schedules", {"salon_id": salon_id}),
        "links": supa.select("professional_services", {"salon_id": salon_id}),
    }
