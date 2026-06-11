from rembg import remove
from PIL import Image
import os

src_base = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\PROYECTOS\100 montaditos"
out_base = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\PROYECTOS\100 montaditos\sin-fondo"

folders = [
    "Aperitivos montaditos",
    "Bebidas montaditos",
    "Raciones montaditos",
    "Ensaladas montaditos",
]

for folder in folders:
    src_folder = os.path.join(src_base, folder)
    out_folder = os.path.join(out_base, folder)
    os.makedirs(out_folder, exist_ok=True)
    for fname in os.listdir(src_folder):
        if not fname.lower().endswith(".png"):
            continue
        src_path = os.path.join(src_folder, fname)
        out_path = os.path.join(out_folder, fname)
        print(f"Procesando: {folder}/{fname}")
        with open(src_path, "rb") as f:
            result = remove(f.read())
        with open(out_path, "wb") as f:
            f.write(result)
        print(f"  -> OK")

print("PROCESO COMPLETO")
