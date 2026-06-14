"""
Procesa las 100 fotos de montaditos:
1. Elimina el fondo con rembg
2. Las guarda en public/assets/img/montaditos/ con nombres slug
3. Genera el mapeo product_name -> url para product-images.ts
"""

import os
import csv
import re
import unicodedata
from rembg import remove
from PIL import Image
import io

SRC_DIR   = r"C:\Users\josem\Desktop\Carta montaditos"
OUT_DIR   = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\HAT3X\clients\projects\100-montaditos\montadito-magic-flow\public\assets\img\montaditos"
CSV_PATH  = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\PROYECTOS\100 montaditos\Databse CSVs\menu_productos-export-2026-06-09_22-27-13.csv"

os.makedirs(OUT_DIR, exist_ok=True)


# ─── helpers ────────────────────────────────────────────────────────────────

def slugify(s):
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s]+', '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s

def norm(s):
    s = s.strip().rstrip('.')
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


# ─── cargar productos de la BD ───────────────────────────────────────────────

with open(CSV_PATH, newline='', encoding='latin-1') as f:
    reader = csv.DictReader(f, delimiter=';')
    all_rows = list(reader)

montaditos_rows = [r for r in all_rows if r['numero'] and r['numero'].lstrip('-').isdigit()]

# norm(nombre) -> nombre_original  (primer match)
prod_norm_map = {}
for row in montaditos_rows:
    n = norm(row['nombre'])
    if n not in prod_norm_map:
        prod_norm_map[n] = row['nombre']


# ─── procesar imágenes ───────────────────────────────────────────────────────

imgs = sorted([f for f in os.listdir(SRC_DIR) if f.lower().endswith('.png')])
print(f"\n{len(imgs)} imágenes a procesar\n")

mapping = {}   # nombre_producto_BD -> url
no_match = []  # imágenes sin match

total = len(imgs)
for i, fname in enumerate(imgs, 1):
    base = fname[:-4].rstrip('.')
    img_norm = norm(base)
    slug = slugify(base)

    # Buscar match
    matched_nombre = None

    if img_norm in prod_norm_map:
        matched_nombre = prod_norm_map[img_norm]

    if not matched_nombre:
        for pn, orig in prod_norm_map.items():
            if img_norm in pn or pn in img_norm:
                matched_nombre = orig
                break

    src_path = os.path.join(SRC_DIR, fname)
    out_path = os.path.join(OUT_DIR, slug + '.png')

    status = f"MATCH: {matched_nombre}" if matched_nombre else "SIN MATCH"
    print(f"[{i:>3}/{total}] {fname[:55]:<55} -> {status}")

    try:
        with open(src_path, 'rb') as f_in:
            img_data = f_in.read()
        result_data = remove(img_data)
        img = Image.open(io.BytesIO(result_data)).convert('RGBA')
        img.save(out_path, 'PNG')
    except Exception as e:
        print(f"         ERROR: {e}")
        continue

    if matched_nombre and matched_nombre not in mapping:
        mapping[matched_nombre] = f'/assets/img/montaditos/{slug}.png'
    elif not matched_nombre:
        no_match.append((fname, slug))

print(f"\n{'='*70}")
print(f"Total procesadas : {total}")
print(f"Con match en BD  : {len(mapping)}")
print(f"Sin match        : {len(no_match)}")

if no_match:
    print("\nSIN MATCH:")
    for fname, slug in no_match:
        print(f"  {fname}")

# Guardar mapeo para copiar a product-images.ts
out_txt = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\HAT3X\montaditos_mapping.txt"
with open(out_txt, 'w', encoding='utf-8') as f:
    for nombre, url in sorted(mapping.items()):
        f.write(f"  '{nombre}': '{url}',\n")

print(f"\nMapeo guardado en: {out_txt}")
