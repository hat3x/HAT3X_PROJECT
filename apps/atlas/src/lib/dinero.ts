// src/lib/dinero.ts
//
// El dinero, en céntimos enteros.
//
// JavaScript no sabe sumar dinero: `0.1 + 0.2` no da `0.3`. En una pantalla eso
// es feo; en una factura firmada y encadenada es un descuadre que ya no se
// puede corregir editando. Así que ningún importe se representa como float en
// ningún punto del cálculo, y solo se convierte a euros para enseñarlo.
//

const EUROS = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

// Tope de `aCentimos`: el máximo que cabe en `numeric(12,2)`, el tipo de las
// columnas de importe en la base (migración de la Tarea 2). No es un número
// redondo elegido a ojo: es ese máximo exacto, para que el límite de
// TypeScript y el de Postgres sean el mismo número y no puedan divergir. Por
// encima, `aCentimos("1e21")` daría `1e+23` — ya no un entero exacto, que es
// justo el fallo que este módulo existe para impedir.
const MAX_CENTIMOS = 999_999_999_999;

/**
 * Texto de un formulario → céntimos.
 *
 * Devuelve `null` y no `0` cuando no hay importe: un campo vacío y un importe
 * de cero euros son cosas distintas, y confundirlos escribe ceros silenciosos.
 */
export function aCentimos(texto: string | number): number | null {
  const limpio = String(texto).trim().replace(",", ".");
  if (limpio === "") return null;

  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return null;

  // El redondeo va sobre el valor ya escalado: `1.005 * 100` da
  // 100.49999999999999, y redondear eso a secas perdería el céntimo que sí
  // corresponde. El `toFixed(4)` recorta el ruido antes de decidir.
  const centimos = Math.round(Number((n * 100).toFixed(4)));
  if (centimos > MAX_CENTIMOS) return null;

  return centimos;
}

export function formatear(centimos: number): string {
  return EUROS.format(centimos / 100);
}

/**
 * Base y tipo → base, cuota y total, los tres en céntimos.
 *
 * `base * tipoIva` son dos enteros pequeños: el producto es exacto en punto
 * flotante mucho antes de acercarse a `Number.MAX_SAFE_INTEGER`, así que la
 * única decisión real es el redondeo, y es al alza en el medio céntimo.
 */
export function desglosar(
  baseCentimos: number,
  tipoIva: number
): { base: number; cuota: number; total: number } {
  const cuota = Math.round((baseCentimos * tipoIva) / 100);
  return { base: baseCentimos, cuota, total: baseCentimos + cuota };
}
