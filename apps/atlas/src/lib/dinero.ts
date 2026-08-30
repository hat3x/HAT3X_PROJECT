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

// El día es el de Madrid, no el de UTC. Madrid va por delante, así que entre
// medianoche y las dos de la mañana (hora de Madrid) el «hoy» en UTC todavía
// cae en el día anterior. Para una pantalla que solo enseña una fecha eso es
// un desliz visual; para un formulario que la escribe en el libro es un gasto
// o una factura con la fecha de ayer — y el día 1 del mes, eso la saca del
// mes que le tocaba. «en-CA» se elige porque da AAAA-MM-DD, el formato que
// esperan los `<input type="date">` y la base.
const DIA_MADRID = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });

/** AAAA-MM-DD del día de hoy en Madrid, sin pasar por el día UTC. */
export function hoyEnMadrid(): string {
  return DIA_MADRID.format(new Date());
}

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

/**
 * El mes `AAAA-MM` como instantes ISO: la medianoche de Madrid del día 1 y la
 * del día 1 siguiente, en UTC. Se calcula el desfase en CADA frontera porque
 * en marzo y octubre cambia dentro del mes. Es la única función que corta
 * meses: horas y rentabilidad la comparten para no cuadrar distinto.
 */
export function limitesMesMadrid(mes: string): { desde: string; hasta: string } {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const PARTES = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const desfase = (d: Date) => {
    const p = PARTES.formatToParts(d);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    // `hour12:false` puede dar «24» a medianoche en algunos motores.
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) - d.getTime();
  };
  const ini = new Date(Date.UTC(a, m - 1, 1));
  const fin = new Date(Date.UTC(a, m, 1));
  return {
    desde: new Date(ini.getTime() - desfase(ini)).toISOString(),
    hasta: new Date(fin.getTime() - desfase(fin)).toISOString(),
  };
}

export function mesDe(hoy: string): string {
  return hoy.slice(0, 7);
}

export function mesVecino(mes: string, delta: -1 | 1): string {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) + delta;
  const d = new Date(Date.UTC(a, m - 1, 1));
  return d.toISOString().slice(0, 7);
}
