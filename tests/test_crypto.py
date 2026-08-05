import pytest
from kairos_admin.crypto import encrypt, decrypt, BadPassword

def test_roundtrip():
    blob = encrypt(b'{"k":"v"}', "correct horse")
    assert decrypt(blob, "correct horse") == b'{"k":"v"}'

def test_wrong_password_raises():
    blob = encrypt(b"secret", "right")
    with pytest.raises(BadPassword):
        decrypt(blob, "wrong")

def test_blob_is_not_plaintext():
    blob = encrypt(b"service_role_key", "pw")
    assert b"service_role_key" not in blob
