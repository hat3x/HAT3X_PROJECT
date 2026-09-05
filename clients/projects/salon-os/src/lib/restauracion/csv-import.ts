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
    const line = lines[i];
    if (line === undefined) continue;
    const cols = line.split(",");
    if (cols.length < 8) { errors.push(`Fila ${i + 1}: faltan columnas`); continue; }
    const [categoria, producto, ent, dec, ivaRaw, estacion, alergenosRaw, comboRaw] = cols;
    // `noUncheckedIndexedAccess` tipa cada elemento desestructurado como
    // `string | undefined` pese al guard de `cols.length` de arriba (TS no
    // afina el tipo de un array a partir de una comprobación de longitud).
    if (
      categoria === undefined || producto === undefined || ent === undefined ||
      dec === undefined || ivaRaw === undefined || estacion === undefined ||
      alergenosRaw === undefined || comboRaw === undefined
    ) { errors.push(`Fila ${i + 1}: faltan columnas`); continue; }
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
