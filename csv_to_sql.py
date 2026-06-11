import csv
import os
import re

src = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\PROYECTOS\100 montaditos\Databse CSVs"
out = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\HAT3X\import_sql"
os.makedirs(out, exist_ok=True)

# Orden respetando foreign keys
tables = [
    ("franchisees",        "franchisees-export-2026-06-09_22-27-32.csv"),
    ("locales",            "locales-export-2026-06-09_22-27-08.csv"),
    ("menu_categorias",    "menu_categorias-export-2026-06-09_22-27-38.csv"),
    ("menu_productos",     "menu_productos-export-2026-06-09_22-27-13.csv"),
    ("alergenos",          "alergenos-export-2026-06-09_22-27-00.csv"),
    ("producto_alergenos", "producto_alergenos-export-2026-06-09_22-27-28.csv"),
]

def escape(val):
    if val == "" or val is None:
        return "NULL"
    if val.lower() == "true":
        return "TRUE"
    if val.lower() == "false":
        return "FALSE"
    if re.match(r'^-?\d+(\.\d+)?$', val):
        return val
    return "'" + val.replace("'", "''") + "'"

for table, filename in tables:
    path = os.path.join(src, filename)
    sql_path = os.path.join(out, f"{table}.sql")
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        rows = list(reader)

    if not rows:
        print(f"{table}: vacía, omitida")
        continue

    cols = list(rows[0].keys())
    col_list = ", ".join(f'"{c}"' for c in cols)

    lines = [f"-- {table}: {len(rows)} filas\n"]
    for row in rows:
        vals = ", ".join(escape(row[c]) for c in cols)
        lines.append(f"INSERT INTO public.{table} ({col_list}) VALUES ({vals}) ON CONFLICT (id) DO NOTHING;")

    with open(sql_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))

    print(f"{table}: {len(rows)} filas -> {sql_path}")

print("\nSQL generado correctamente")
