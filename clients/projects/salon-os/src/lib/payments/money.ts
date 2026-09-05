/**
 * Primitivas de dinero en céntimos enteros.
 *
 * Invariante del esquema (§1.6 de docs/schema-reference.md): el dinero se guarda
 * y se opera SIEMPRE como enteros de céntimos (`*_cents`), nunca como `number`
 * con decimales ni `float`. Estas funciones son la única frontera donde entran
 * cantidades fraccionarias (una `quantity` numeric(12,3) o un `vat_rate`), y su
 * salida vuelve a ser un entero de céntimos.
 *
 * El redondeo es "half away from zero" (redondeo comercial español: 0,5 sube),
 * aplicado de forma robusta frente al error binario de coma flotante.
 */

/**
 * Redondea a un entero con la regla "half away from zero" (2,5 → 3; −2,5 → −3),
 * corrigiendo el clásico desvío binario (p. ej. 1,005 que en IEEE-754 cae por
 * debajo de 1,005). Se usa como redondeo comercial de céntimos.
 */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Importe no finito: ${value}`);
  }
  // Épsilon relativo para reabsorber el ruido de coma flotante antes de redondear.
  const epsilon = Math.sign(value) * 1e-9;
  return Math.round(value + epsilon);
}

/**
 * Multiplica un precio unitario (céntimos enteros) por una cantidad que puede
 * ser fraccionaria (venta por peso, `quantity numeric(12,3)`) y devuelve
 * céntimos enteros redondeados.
 */
export function multiplyCents(unitCents: number, quantity: number): number {
  assertIntegerCents(unitCents, "unitCents");
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError(`Cantidad no válida: ${quantity}`);
  }
  return roundHalfAwayFromZero(unitCents * quantity);
}

/**
 * Descompone un importe BRUTO (IVA incluido) en su base imponible neta y su
 * cuota de IVA, a un tipo `vatRate` en porcentaje (p. ej. 21 = 21 %).
 *
 * Modelo de precios del proyecto: los precios de catálogo y de línea son PVP
 * (IVA incluido), como es norma en el retail y los salones en España; el
 * `line_total_cents` del esquema es explícitamente "IVA incluido, tras
 * descuento". Por eso la base se EXTRAE del bruto en lugar de sumarse.
 *
 * La cuota se calcula por diferencia (`gross − base`) para que
 * `base + tax === gross` sea SIEMPRE exacto en céntimos enteros (no se escapa
 * ningún céntimo por redondeo).
 */
export function splitVatFromGross(
  grossCents: number,
  vatRate: number,
): { baseCents: number; taxCents: number } {
  assertIntegerCents(grossCents, "grossCents");
  if (!Number.isFinite(vatRate) || vatRate < 0) {
    throw new RangeError(`Tipo de IVA no válido: ${vatRate}`);
  }
  const baseCents = roundHalfAwayFromZero(grossCents / (1 + vatRate / 100));
  return { baseCents, taxCents: grossCents - baseCents };
}

/** Lanza si `value` no es un entero de céntimos válido (guardarraíl de dominio). */
export function assertIntegerCents(value: number, label = "value"): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} debe ser un entero de céntimos, recibido: ${value}`);
  }
}

/**
 * Reparte un importe entero (céntimos) entre varias "cestas" en proporción a sus
 * `weights`, con el MÉTODO DEL MAYOR RESTO (Hamilton): cada cesta recibe la parte
 * entera de su cuota y los céntimos sobrantes por redondeo se asignan uno a uno a
 * las cestas de mayor resto (desempate por índice ascendente → determinista).
 *
 * Garantía: `Σ resultado === amount` EXACTO — no se pierde ni se inventa un
 * céntimo. Es la primitiva sobre la que se prorratea un descuento de ticket entre
 * sus líneas sin descuadrar la identidad `base + IVA === total` (ver totals.ts).
 *
 * Casos borde: con `amount === 0` o pesos que suman 0 devuelve todo ceros (una
 * cesta de peso 0 nunca recibe céntimos). Rechaza importes/pesos no enteros o
 * negativos.
 */
export function distributeProportionally(
  amount: number,
  weights: readonly number[],
): number[] {
  assertIntegerCents(amount, "amount");
  if (amount < 0) {
    throw new RangeError(`amount no puede ser negativo: ${amount}`);
  }
  weights.forEach((weight, i) => {
    assertIntegerCents(weight, `weights[${i}]`);
    if (weight < 0) {
      throw new RangeError(`weights[${i}] no puede ser negativo: ${weight}`);
    }
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (amount === 0 || totalWeight === 0) {
    return weights.map(() => 0);
  }

  // Parte entera de cada cuota + resto (en unidades de `totalWeight`, sin coma
  // flotante: `amount * weight` es un entero seguro para importes de ticket).
  const floors = weights.map((weight) => Math.floor((amount * weight) / totalWeight));
  const distributed = floors.reduce((acc, part) => acc + part, 0);
  let remaining = amount - distributed;

  const byRemainderDesc = weights
    .map((weight, i) => ({ i, remainder: amount * weight - floors[i]! * totalWeight }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);

  const result = floors.slice();
  for (let k = 0; k < byRemainderDesc.length && remaining > 0; k++) {
    result[byRemainderDesc[k]!.i]! += 1;
    remaining -= 1;
  }
  return result;
}
