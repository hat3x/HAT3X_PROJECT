"""Cifrado simétrico de la config con clave derivada de la contraseña maestra."""
import base64, os
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

class BadPassword(Exception):
    pass

_MAGIC = b"KADM1"          # cabecera de versión
_SALT_LEN = 16

def _derive(password: str, salt: bytes) -> bytes:
    kdf = Scrypt(salt=salt, length=32, n=2**14, r=8, p=1)
    return base64.urlsafe_b64encode(kdf.derive(password.encode("utf-8")))

def encrypt(plaintext: bytes, password: str) -> bytes:
    salt = os.urandom(_SALT_LEN)
    token = Fernet(_derive(password, salt)).encrypt(plaintext)
    return _MAGIC + salt + token

def decrypt(blob: bytes, password: str) -> bytes:
    if not blob.startswith(_MAGIC):
        raise BadPassword("Formato de config no reconocido.")
    salt = blob[len(_MAGIC):len(_MAGIC) + _SALT_LEN]
    token = blob[len(_MAGIC) + _SALT_LEN:]
    try:
        return Fernet(_derive(password, salt)).decrypt(token)
    except InvalidToken as exc:
        raise BadPassword("Contraseña maestra incorrecta.") from exc
