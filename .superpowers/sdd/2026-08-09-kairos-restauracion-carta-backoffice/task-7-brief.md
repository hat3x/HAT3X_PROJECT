## Task 7: Importador CSV de carta

**Files:**
- Create: `…/src/lib/restauracion/csv-import.ts`
- Test: `…/src/tests/unit/restauracion-csv-import.test.ts`
- Modify: `…/src/app/(dashboard)/carta/actions.ts` (añadir `importMenuCsv`)

**Interfaces:**
- Produces:
  - `type ParsedMenuProduct = { name; categoryName; priceCents; vatRate; stationName; allergens: string[]; isCombo: boolean }`
  - `type ParsedMenu = { categories: string[]; stations: string[]; products: ParsedMenuProduct[]; errors: string[] }`
  - `parseMenuCsv(csv: string): ParsedMenu` — puro; formato de columnas fijas `categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo`; convierte a céntimos, valida IVA ∈ {0,4,10,21}, alérgenos separados por `;`, recolecta errores por fila sin abortar.
  - Action `importMenuCsv(csv: string): Promise<ActionResult<{ created: number }>>`.

- [ ] **Step 1: Write the failing test** (validar contra filas estilo 100M)

Create `…/src/tests/unit/restauracion-csv-import.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseMenuCsv } from "@/lib/restauracion/csv-import";

const CSV = [
  "categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo",
  "Montaditos,Montadito de lomo,1,50,10,Cocina,gluten;lacteos,no",
  "Bebidas,Caña,1,80,10,Barra,,no",
  "Combos,Combo desayuno,3,50,10,Cocina,gluten,si",
].join("\n");

describe("parseMenuCsv", () => {
  it("convierte euros (entero,decimales) a céntimos", () => {
    const r = parseMenuCsv(CSV);
    expect(r.products.find((p) => p.name === "Montadito de lomo")?.priceCents).toBe(150);
    expect(r.products.find((p) => p.name === "Caña")?.priceCents).toBe(180);
  });
  it("deduplica categorías y estaciones", () => {
    const r = parseMenuCsv(CSV);
    expect(r.categories.sort()).toEqual(["Bebidas", "Combos", "Montaditos"]);
    expect(r.stations.sort()).toEqual(["Barra", "Cocina"]);
  });
  it("separa alérgenos por ; y marca combos", () => {
    const r = parseMenuCsv(CSV);
    expect(r.products.find((p) => p.name === "Montadito de lomo")?.allergens).toEqual(["gluten", "lacteos"]);
    expect(r.products.find((p) => p.name === "Combo desayuno")?.isCombo).toBe(true);
  });
  it("recoge error de IVA inválido sin abortar", () => {
    const bad = "categoria,producto,entero,decimales,iva,estacion,alergenos,es_combo\nX,Y,1,00,7,Cocina,,no";
    const r = parseMenuCsv(bad);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd clients/projects/salon-os && npm test -- restauracion-csv-import`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Write the parser**

Create `…/src/lib/restauracion/csv-import.ts`:

```ts
export interface ParsedMenuProduct {
  name: string; categoryName: string; priceCents: number; vatRate: number;
  stationName: string; allergens: string[]; isCombo: boolean;
}
export interface ParsedMenu {
  categories: string[]; stations: string[]; products: ParsedMenuProduct[]; errors: string[];
}

const VALID_VAT = new Set([0, 4, 10, 21]);
const ALLERGENS = new Set([
  "gluten","crustaceos","huevos","pescado","cacahuetes","soja","lacteos",
  "frutos_cascara","apio","mostaza","sesamo","sulfitos","altramuces","moluscos",
]);

function eurosToCents(value: string): number | null {
  const norm = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(Number.parseFloat(norm) * 100);
}

// Formato de columnas FIJAS: el precio va partido en entero/decimales para no chocar con la coma.
// categoria,producto,entero,decimales,iva,estacion,alergenos(;),es_combo
export function parseMenuCsv(csv: string): ParsedMenu {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const errors: string[] = [];
  const products: ParsedMenuProduct[] = [];
  const categories = new Set<string>();
  const stations = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 8) { errors.push(`Fila ${i + 1}: faltan columnas`); continue; }
    const [categoria, producto, ent, dec, ivaRaw, estacion, alergenosRaw, comboRaw] = cols;
    const priceCents = eurosToCents(`${ent},${dec}`);
    const vatRate = Number.parseInt(ivaRaw, 10);
    if (priceCents === null) { errors.push(`Fila ${i + 1}: precio inválido`); continue; }
    if (!VALID_VAT.has(vatRate)) { errors.push(`Fila ${i + 1}: IVA inválido (${ivaRaw})`); continue; }
    const allergens = alergenosRaw.split(";").map((a) => a.trim()).filter((a) => a.length > 0);
    const bad = allergens.filter((a) => !ALLERGENS.has(a));
    if (bad.length > 0) errors.push(`Fila ${i + 1}: alérgeno desconocido (${bad.join(", ")})`);
    categories.add(categoria.trim());
    stations.add(estacion.trim());
    products.push({
      name: producto.trim(), categoryName: categoria.trim(), priceCents, vatRate,
      stationName: estacion.trim(), allergens: allergens.filter((a) => ALLERGENS.has(a)),
      isCombo: comboRaw.trim().toLowerCase() === "si",
    });
  }
  return { categories: [...categories], stations: [...stations], products, errors };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd clients/projects/salon-os && npm test -- restauracion-csv-import`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the import action**

En `…/src/app/(dashboard)/carta/actions.ts` añade `importMenuCsv(csv: string): Promise<ActionResult<{ created: number }>>`: `assertManager()`, `parseMenuCsv`, crea las categorías/estaciones/productos que no existan (mapeando `categoryName`/`stationName` a sus `id` tras crearlos), devuelve el recuento. Si `parsed.errors.length > 0`, inclúyelos en el mensaje pero procesa las filas válidas. `revalidatePath("/carta")`.

- [ ] **Step 6: Commit**

```bash
git add clients/projects/salon-os/src/lib/restauracion/csv-import.ts \
        clients/projects/salon-os/src/tests/unit/restauracion-csv-import.test.ts \
        clients/projects/salon-os/src/app/\(dashboard\)/carta/actions.ts
git commit -m "feat(restauracion): importador CSV de carta"
```

---

