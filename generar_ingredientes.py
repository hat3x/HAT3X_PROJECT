# -*- coding: utf-8 -*-
"""
Autogenera un borrador de catálogo de INGREDIENTES y el mapa producto->ingrediente
a partir de los nombres de la carta de 100 Montaditos.

Estrategia: catálogo curado de ingredientes "que pueden agotarse", cada uno con
palabras clave; un producto contiene el ingrediente si alguna clave aparece en su
nombre normalizado. Pensado para que el usuario lo REVISE y corrija.
"""
import sys, json, unicodedata

def fix_mojibake(s):
    # Los acentos están doble-codificados en la BD (ej. "ó" -> "Ã³"). Lo revierte.
    try:
        return (s or '').encode('latin-1', 'ignore').decode('utf-8', 'ignore')
    except Exception:
        return s or ''

def norm(s):
    # Nota: el texto ya viene reparado de mojibake antes de llamar a norm.
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.lower().strip()

# Catálogo curado: display -> lista de palabras clave (en minúscula, sin acentos)
INGREDIENTES = {
    # Carnes / proteínas
    "Pollo": ["@@especial@@"],        # match especial (pollo que NO es kebab)
    "Pollo Kebab": ["@@especial@@"],  # match especial
    "Jamón Gran Reserva": ["gran reserva"],
    "Jamón cocido": ["jamon cocido"],
    "Pulled pork": ["pulled pork"],
    "Lomo al ajillo": ["lomo al ajillo", "lomo"],
    "Carrillera": ["carrillera"],
    "Chistorra": ["chistorra"],
    "Chorizo": ["chorizo"],
    "Torreznos": ["torrezno"],
    "Bacon ahumado": ["bacon"],
    "Salmón ahumado": ["salmon"],
    "Atún": ["atun"],
    "Calamar": ["calamar"],
    "Oreja": ["oreja"],
    "Carne de burger": ["burger"],
    "Salchicha / Hot dog": ["hot dog", "salchicha"],
    "Pepperoni": ["pepperoni"],
    "Pintxo donostiarra": ["pintxo"],
    "Croquetas de jamón": ["croquetas de jamon"],
    "Croquetas Mac&Cheese": ["mac&cheese", "mac cheese"],
    "Ensaladilla rusa": ["ensaladilla"],
    # Quesos
    "Queso Camembert": ["camembert"],
    "Queso madurado": ["queso madurado"],
    "Queso gorgonzola": ["gorgonzola"],
    "Mozzarella / Mozzamix": ["mozz"],
    "Queso gouda": ["gouda"],
    "Cheddar": ["cheddar"],
    # Verduras / vegetales
    "Tomate": ["tomate"],
    "Lechuga": ["lechuga"],
    "Cebolla caramelizada": ["cebolla caramelizada"],
    "Cebolla crujiente": ["cebolla crujiente"],
    "Pimiento rojo": ["pimiento"],
    "Patatas paja": ["patatas paja"],
    "Tortilla de patatas": ["tortilla de patatas"],
    "Guacamole": ["guacamole"],
    "Huevo hilado": ["huevo"],
    "Aceitunas": ["aceituna"],
    "Maíz": ["maiz"],
    "Picatostes": ["picatostes"],
    "Nachos TexMex": ["@@especial@@"],  # solo ensalada TexMex (manual)
    # Salsas y condimentos
    "Mayonesa": ["mayonesa"],
    "Salsa alioli": ["alioli"],
    "Salsa brava": ["salsa brava", "brava y", "brava,"],
    "Salsa BBQ": ["bbq"],
    "Mojo picón": ["mojo"],
    "Salsa César": ["cesar"],
    "Mostaza y miel": ["mostaza y miel"],
    "Kétchup": ["ketchup"],
    "Mostaza": ["mostaza"],
    "Salsa 100M": ["100m"],
    "Orégano": ["oregano"],
    "Salsa pomodoro / pizza": ["pomodoro", "salsa pizza"],
    "Mantequilla": ["mantequilla"],
    "Aceite de oliva": ["aceite de oliva"],
    "Salsa bravioli": ["bravioli"],
    # Dulces
    "Chocolate": ["chocolate"],
    "Cookie / Montycookie": ["cookie"],
    "Sirope": ["sirope"],
}

data = json.load(sys.stdin)
prods = [p for p in data if p.get('disponible')]
# Reparar mojibake en los textos que se muestran
for p in prods:
    p['nombre'] = fix_mojibake(p['nombre'])
    if p.get('menu_categorias'):
        p['menu_categorias']['nombre'] = fix_mojibake(p['menu_categorias'].get('nombre', ''))

# Solo Montaditos y Ensaladas se gestionan POR INGREDIENTE.
CATS_INGREDIENTE = ('Montaditos', 'Ensaladas')
# Aperitivos/Raciones/Bebidas/Ruedas se gestionan como PRODUCTO ENTERO agotable.
CATS_PRODUCTO = ('Aperitivos', 'Raciones', 'Bebidas', 'MontyRuedas')

# Ensaladas: ingredientes confirmados a mano por el usuario (sus nombres no los llevan).
ENSALADAS_MANUAL = {
    "Campera": ["Lechuga", "Pollo", "Tomate", "Queso madurado", "Aceitunas", "Picatostes", "Salsa alioli"],
    "TexMex":  ["Lechuga", "Pollo Kebab", "Tomate", "Maíz", "Aceitunas", "Nachos TexMex", "Mostaza y miel"],
}

PANES = ["Pan clásico 100M", "Pan piadina", "Pan perrito", "Pan burguer", "Pan pizza", "Pan gourmet"]

def pan_por_numero(numero):
    try:
        nn = int(numero)
    except (TypeError, ValueError):
        return None
    if 1 <= nn <= 67:    return "Pan clásico 100M"
    if 71 <= nn <= 75:   return "Pan piadina"
    if 76 <= nn <= 80:   return "Pan perrito"
    if 81 <= nn <= 85:   return "Pan burguer"
    if 86 <= nn <= 90:   return "Pan pizza"
    if 91 <= nn <= 100:  return "Pan gourmet"
    return None  # 68-70 = cookies (postre, sin pan)

def match_montadito(nombre):
    n = norm(nombre)
    # Los montaditos tipo "Pollo: pollo kebab, ..." llevan una ETIQUETA antes de
    # los dos puntos que NO es ingrediente. La ignoramos para no falsear matches.
    if ':' in n:
        n = n.split(':', 1)[1]
    enc = []
    for ing, claves in INGREDIENTES.items():
        if any(c in n for c in claves):
            enc.append(ing)
    # Pollo vs Pollo Kebab (especial): "pollo kebab" no debe contar como "Pollo".
    sin_kebab = n.replace('pollo kebab', '@@@')
    if 'pollo kebab' in n:
        enc.append('Pollo Kebab')
    if 'pollo' in sin_kebab:
        enc.append('Pollo')
    return enc

mapa = []   # lista (no dict por nombre) para NO colapsar montaditos con igual nombre
sin_match = []
productos_sueltos = []
conteo = {k: 0 for k in INGREDIENTES}
for p in prods:
    cat = (p.get('menu_categorias') or {}).get('nombre', '?')
    if cat in CATS_PRODUCTO:
        productos_sueltos.append((cat, p.get('numero'), p['nombre']))
        continue
    if cat not in CATS_INGREDIENTE:
        continue
    nombre = p['nombre']
    if cat == 'Ensaladas':
        encontrados = list(ENSALADAS_MANUAL.get(nombre, []))
    else:
        encontrados = match_montadito(nombre)
        pan = pan_por_numero(p.get('numero'))
        if pan:
            encontrados.append(pan)
    mapa.append({"nombre": nombre, "cat": cat, "num": p.get('numero'), "id": p.get('id'), "ings": encontrados})
    for e in encontrados:
        if e in conteo:
            conteo[e] += 1
    if not encontrados:
        sin_match.append((cat, p.get('numero'), nombre))

activos = {k: v for k, v in conteo.items() if v > 0}
out = []
out.append("# REVISIÓN — Ingredientes (Montaditos + Ensaladas) y productos sueltos\n")
out.append(f"\nMontaditos/Ensaladas analizados por ingrediente: {len(mapa)}\n")
out.append("\n## 1) Ingredientes (solo Montaditos + Ensaladas) y nº de productos que afecta\n\n")
for ing, c in sorted(activos.items(), key=lambda x: -x[1]):
    out.append(f"- **{ing}** — afecta a {c} productos\n")
out.append("\n## 2) Montaditos/Ensaladas SIN ingrediente detectado (revisar a mano)\n\n")
for cat, num, nom in sin_match:
    out.append(f"- [{cat}] {num or ''} — {nom}\n")
out.append("\n## 2b) PRODUCTOS SUELTOS agotables tal cual (Aperitivos/Raciones/Bebidas/Ruedas)\n")
out.append("Estos NO usan ingredientes: se marcan agotados como producto entero.\n\n")
ps = {}
for cat, num, nom in productos_sueltos:
    ps.setdefault(cat, []).append((num, nom))
for cat, items in ps.items():
    out.append(f"\n### {cat} ({len(items)})\n")
    for num, nom in items:
        out.append(f"- {num or ''} {nom}\n")
out.append("\n## 3) Mapa completo producto → ingredientes\n")
porcat = {}
for info in mapa:
    porcat.setdefault(info['cat'], []).append((info['num'], info['nombre'], info['ings']))
for cat, items in porcat.items():
    out.append(f"\n### {cat}\n")
    for num, nom, ings in items:
        out.append(f"- **{num or ''} {nom}** → {', '.join(ings) if ings else '—'}\n")

open("INGREDIENTES_REVISION.md", "w", encoding="utf-8", errors="replace").writelines(out)

# ─── Datos listos para cargar en la BD ───────────────────────────────────────
ings_usados = sorted({i for info in mapa for i in info['ings'] if i not in PANES})
ingredientes_data = ([{"nombre": i, "tipo": "ingrediente"} for i in ings_usados]
                     + [{"nombre": p, "tipo": "pan"} for p in PANES])
mapa_data = [{"producto_id": info['id'], "ings": info['ings']}
             for info in mapa if info['ings'] and info.get('id')]
json.dump({"ingredientes": ingredientes_data, "mapa": mapa_data},
          open("INGREDIENTES_DATA.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print(f"OK. Ingredientes catalogo:{len(ingredientes_data)} (incl. {len(PANES)} panes) | Productos mapeados:{len(mapa_data)} | SinMatch:{len(sin_match)}")
for ing, c in sorted(conteo.items(), key=lambda x:-x[1])[:15]:
    print(f"  {c:>3}  {ing}")
