"""Punto de entrada del .exe.

PyInstaller ejecuta este fichero como script principal (__main__). Usa un import
ABSOLUTO del paquete `fichaje`, para que los imports relativos internos de
`fichaje/app.py` (`from . import ...`) tengan un paquete padre valido.
"""
from fichaje.app import lanzar

if __name__ == "__main__":
    lanzar()
