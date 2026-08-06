import base64
import json

from kairos_admin.keycheck import service_role_role


def _fake_jwt(payload: dict) -> str:
    """header.payload.sig con firma inventada (da igual: no se verifica, solo se lee el payload)."""
    def b64(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode("utf-8")).rstrip(b"=").decode("ascii")
    header = {"alg": "HS256", "typ": "JWT"}
    return f"{b64(header)}.{b64(payload)}.firma-invent"


def test_detects_anon_role():
    assert service_role_role(_fake_jwt({"role": "anon"})) == "anon"


def test_detects_service_role():
    assert service_role_role(_fake_jwt({"role": "service_role"})) == "service_role"


def test_non_jwt_key_returns_none():
    # claves nuevas tipo sb_secret_... no son JWT (no tienen 3 partes)
    assert service_role_role("sb_secret_abc123xyz") is None


def test_empty_or_missing_key_returns_none():
    assert service_role_role("") is None
    assert service_role_role(None) is None


def test_malformed_jwt_payload_returns_none():
    # 3 partes separadas por '.', pero el payload no es base64/JSON válido
    assert service_role_role("aaa.no-es-base64-json!!.sig") is None
