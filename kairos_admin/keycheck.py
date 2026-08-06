"""Detección del tipo de clave de Supabase (anon vs service_role) a partir del JWT.

Usado en el primer arranque para evitar que alguien pegue la clave pública
`anon` en vez de la `service_role`: con `anon` el panel "funciona" pero RLS
filtra todo y aparenta estar vacío (0 tenants), sin ningún aviso.
"""
import base64
import json


def service_role_role(key: str) -> str | None:
    """Si `key` es un JWT (3 partes separadas por '.'), decodifica el payload
    (base64url, con padding) a JSON y devuelve el claim `role` (p. ej. 'anon'
    o 'service_role'). Si no es JWT o no se puede parsear, devuelve None —
    esto cubre también las claves nuevas tipo `sb_secret_...` (no son JWT).
    """
    if not key or not isinstance(key, str):
        return None
    parts = key.split(".")
    if len(parts) != 3:
        return None
    payload_b64 = parts[1]
    padding = "=" * (-len(payload_b64) % 4)
    try:
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception:  # noqa: BLE001 — cualquier fallo de parseo => no identificable
        return None
    role = payload.get("role") if isinstance(payload, dict) else None
    return role if isinstance(role, str) else None
