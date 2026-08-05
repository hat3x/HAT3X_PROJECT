"""Entry point: abre la ventana pywebview con la UI y el bridge Api.

Uso en desarrollo:
    python run.py

Empaquetado (PyInstaller, ver kairos_admin.spec):
    sys._MEIPASS apunta al directorio temporal donde el .exe one-file
    descomprime sus datos (incluye ui/, declarado en el spec). En dev,
    sys._MEIPASS no existe, así que se usa el directorio de este fichero.
"""
import os
import sys

import webview

from kairos_admin.bridge import Api


def main():
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    ui = os.path.join(base, "ui", "index.html")
    webview.create_window(
        "Kairos Admin",
        ui,
        js_api=Api(),
        width=1100,
        height=760,
        min_size=(900, 600),
    )
    webview.start()


if __name__ == "__main__":
    main()
