"""Plantillas de catálogo por sector (esquema canónico de importers)."""

def _empty():
    return {"professionals": [], "services": [], "schedules": [], "links": []}

_DENTAL = {
    "professionals": [{"full_name": "Odontólogo/a 1"}],
    "services": [
        {"name": "Revisión", "category": "General", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0},
        {"name": "Limpieza dental", "category": "General", "application_min": 30, "exposure_min": 0, "post_exposure_min": 0},
        {"name": "Empaste", "category": "General", "application_min": 30, "exposure_min": 0, "post_exposure_min": 0},
    ],
    "schedules": [
        {"professional": "Odontólogo/a 1", "weekday": d, "start": "10:00", "end": "14:00"} for d in (1, 2, 3, 4, 5)
    ],
    "links": [
        {"professional": "Odontólogo/a 1", "service": s}
        for s in ("Revisión", "Limpieza dental", "Empaste")
    ],
}

_PELUQUERIA = {
    "professionals": [{"full_name": "Estilista 1"}],
    "services": [
        {"name": "Corte", "category": "Peluquería", "application_min": 30, "exposure_min": 0, "post_exposure_min": 0},
        {"name": "Tinte", "category": "Peluquería", "application_min": 30, "exposure_min": 30, "post_exposure_min": 15},
        {"name": "Peinado", "category": "Peluquería", "application_min": 30, "exposure_min": 0, "post_exposure_min": 0},
    ],
    "schedules": [
        {"professional": "Estilista 1", "weekday": d, "start": "10:00", "end": "20:00"} for d in (1, 2, 3, 4, 5)
    ],
    "links": [
        {"professional": "Estilista 1", "service": s} for s in ("Corte", "Tinte", "Peinado")
    ],
}

_TEMPLATES = {"dental": _DENTAL, "peluqueria": _PELUQUERIA, "clinica": _empty()}
SECTORS = list(_TEMPLATES.keys())

def get_template(sector: str) -> dict:
    import copy
    return copy.deepcopy(_TEMPLATES.get(sector, _empty()))
