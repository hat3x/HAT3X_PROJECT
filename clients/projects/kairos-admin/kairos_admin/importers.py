"""Importación de catálogo: JSON canónico o CSV por entidad. Con validación."""
import csv, io, json, re

class ImportError_(Exception):
    pass

_TIME = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")
_INT_FIELDS = {
    "services": {"application_min", "exposure_min", "post_exposure_min", "price_cents"},
    "schedules": {"weekday"},
}

def load_json(text: str) -> dict:
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ImportError_("El JSON debe ser un objeto con professionals/services/schedules/links.")
    return {k: data.get(k, []) for k in ("professionals", "services", "schedules", "links")}

def load_csv(text: str, kind: str) -> list:
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for raw in reader:
        row = {k: (v.strip() if isinstance(v, str) else v) for k, v in raw.items()}
        for f in _INT_FIELDS.get(kind, set()):
            if row.get(f) not in (None, ""):
                row[f] = int(row[f])
        rows.append(row)
    return rows

def validate(catalog: dict) -> list:
    errors = []
    pros = [p.get("full_name") for p in catalog.get("professionals", [])]
    svcs = [s.get("name") for s in catalog.get("services", [])]
    if len(pros) != len(set(pros)):
        errors.append("Hay profesionales con nombre repetido.")
    if len(svcs) != len(set(svcs)):
        errors.append("Hay servicios con nombre repetido.")
    for s in catalog.get("services", []):
        for f in ("application_min", "exposure_min", "post_exposure_min"):
            v = s.get(f, 0)
            if not isinstance(v, int) or v < 0:
                errors.append(f"Servicio '{s.get('name')}': {f} debe ser entero >= 0.")
    for sch in catalog.get("schedules", []):
        if sch.get("weekday") not in range(0, 7):
            errors.append(f"schedule de '{sch.get('professional')}': weekday debe ser 0-6.")
        for f in ("start", "end"):
            if not _TIME.match(str(sch.get(f, ""))):
                errors.append(f"schedule de '{sch.get('professional')}': {f} hora inválida.")
        if sch.get("professional") not in pros:
            errors.append(f"schedule referencia profesional inexistente: {sch.get('professional')}.")
    for ln in catalog.get("links", []):
        if ln.get("professional") not in pros:
            errors.append(f"link referencia profesional inexistente: {ln.get('professional')}.")
        if ln.get("service") not in svcs:
            errors.append(f"link referencia servicio inexistente: {ln.get('service')}.")
    return errors
