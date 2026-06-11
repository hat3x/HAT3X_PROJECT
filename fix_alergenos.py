import csv

src = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\PROYECTOS\100 montaditos\Databse CSVs\producto_alergenos-export-2026-06-09_22-27-28.csv"
out = r"C:\Users\josem\Desktop\HAT3X\CLAUDE\HAT3X\import_sql\producto_alergenos_fixed.sql"

lines = []
with open(src, newline='', encoding='utf-8') as f:
    for row in csv.DictReader(f, delimiter=';'):
        p = row['producto_id']
        a = row['alergeno_id']
        c = row['created_at']
        lines.append(
            "INSERT INTO public.producto_alergenos (producto_id, alergeno_id, created_at) "
            "VALUES ('" + p + "', '" + a + "', '" + c + "') "
            "ON CONFLICT (producto_id, alergeno_id) DO NOTHING;"
        )

with open(out, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print("Generado: " + str(len(lines)) + " filas -> " + out)
