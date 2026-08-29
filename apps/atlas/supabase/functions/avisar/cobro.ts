// COPIA de src/lib/cobro/pendientes.ts — NO editar aquí.
// Si cambias el original, vuelve a copiarlo.
// El test copias.test.ts falla si divergen.
// src/lib/cobro/pendientes.ts
//
// Qué hay que perseguir hoy.
//
// Función pura: sin base, sin red, sin reloj. La fecha entra por parámetro, que
// es lo que permite probar un vencimiento a noventa días sin esperar noventa
// días — igual que `transicion()` y `agrupar()` del bloque 1.
//
// Sin imports de la aplicación: esto se copia tal cual dentro de la Edge
// Function, y Deno no resuelve el alias `@/`.
//

export type PeriodoSinFacturar = {
  contratoId: string;
  clienteNombre: string;
  /** Primer día del mes, ISO AAAA-MM-DD. */
  periodo: string;
  importeEsperadoCentimos: number;
};

export type FacturaSinCobrar = {
  id: string;
  serie: string;
  numero: number | null;
  clienteNombre: string;
  totalCentimos: number;
  /** ISO AAAA-MM-DD. Nulo cuando no se acordó plazo. */
  fechaVencimiento: string | null;
};

/**
 * Una factura que ya pasó su plazo. Estrechada a `fechaVencimiento: string`
 * (sin el `| null` del tipo base): el filtro de `pendientesDeCobro` ya
 * descarta las facturas sin plazo, así que quien consuma `vencidas` —la
 * pantalla— puede leer la fecha sin repetir esa comprobación ni recurrir a
 * `!` para acallar al compilador sobre algo que la función ya garantiza.
 *
 * Con nombre propio para que el tipo `Cobro` y el type guard del filtro
 * apunten al mismo sitio y no puedan divergir por escribirlo dos veces.
 */
export type FacturaVencida = FacturaSinCobrar & { fechaVencimiento: string };

export type Cobro = {
  sinFacturar: PeriodoSinFacturar[];
  vencidas: FacturaVencida[];
  totalSinFacturarCentimos: number;
  totalVencidoCentimos: number;
  hayAlgo: boolean;
  titulo: string;
  cuerpo: string;
};

/**
 * Céntimos → euros con dos decimales, sin depender de `Intl`, para que la
 * copia que corre en Deno produzca exactamente el mismo texto que la de Node.
 */
function euros(centimos: number): string {
  const signo = centimos < 0 ? "-" : "";
  const abs = Math.abs(centimos);
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function pendientesDeCobro(
  periodos: PeriodoSinFacturar[],
  facturas: FacturaSinCobrar[],
  hoy: string
): Cobro {
  // Comparar cadenas ISO solo es válido si las dos tienen el mismo formato.
  // Confiar en que el llamador pase siempre AAAA-MM-DD puro —y nunca, por
  // ejemplo, un `toISOString()` entero, con hora— es confiar en algo que esta
  // función no puede comprobar. Con hora incluida, la fecha sola es prefijo
  // estricto y por tanto «menor», así que la factura que vence hoy se
  // colaría como vencida. Recortar aquí a los diez primeros caracteres hace
  // que el contrato se cumpla sin depender del llamador.
  const hoySolo = hoy.slice(0, 10);

  // Vencida es la que pasó su plazo, no la que lo tiene hoy: un plazo se
  // cumple durante todo su último día. Y sin fecha no hay plazo que incumplir,
  // así que esas no se persiguen — avisar de ellas llenaría el mensaje de
  // facturas que nadie acordó cuándo pagar.
  //
  // El predicado lleva forma de type guard (`f is FacturaVencida`) para que
  // el `!== null` de aquí sea la única vez que se comprueba: de ahí en
  // adelante —el `.sort` de debajo, y quien lea `Cobro.vencidas` fuera de
  // esta función— el tipo ya dice que la fecha existe, sin más aserciones
  // que repitan una garantía que este filtro ya dio.
  const vencidas = facturas
    .filter(
      (f): f is FacturaVencida =>
        f.fechaVencimiento !== null && f.fechaVencimiento.slice(0, 10) < hoySolo
    )
    // Lo más viejo primero: es lo que más urge y lo que peor pinta tiene.
    // Comparador de tres vías: dos vencimientos iguales devuelven 0. Un
    // comparador que nunca devuelve 0 es inconsistente según la
    // especificación aunque V8 lo tolere. `localeCompare` sobre cadenas ISO
    // ordena bien porque el formato es lexicográficamente cronológico.
    .sort((a, b) => a.fechaVencimiento.slice(0, 10).localeCompare(b.fechaVencimiento.slice(0, 10)));

  const totalSinFacturarCentimos = periodos.reduce(
    (t, p) => t + p.importeEsperadoCentimos,
    0
  );
  const totalVencidoCentimos = vencidas.reduce((t, f) => t + f.totalCentimos, 0);

  const nSin = periodos.length;
  const nVen = vencidas.length;
  const hayAlgo = nSin > 0 || nVen > 0;

  // El plural concuerda a propósito: un aviso que dice «1 meses» se lee como un
  // fallo del sistema, y un aviso que parece roto se deja de leer.
  const trozoSin = `${nSin} ${nSin === 1 ? "mes" : "meses"} sin facturar`;
  const trozoVen = `${nVen} ${nVen === 1 ? "factura vencida" : "facturas vencidas"}`;

  let titulo: string;
  if (nSin > 0 && nVen > 0) titulo = `Cobro: ${trozoSin} y ${trozoVen}`;
  else if (nVen > 0) titulo = `Cobro: ${trozoVen}`;
  else if (nSin > 0) titulo = `Cobro: ${trozoSin}`;
  else titulo = "Cobro: nada pendiente";

  const partes: string[] = [];
  if (nSin > 0) partes.push(`${euros(totalSinFacturarCentimos)} € sin facturar`);
  if (nVen > 0) partes.push(`${euros(totalVencidoCentimos)} € vencidos sin cobrar`);

  return {
    sinFacturar: periodos,
    vencidas,
    totalSinFacturarCentimos,
    totalVencidoCentimos,
    hayAlgo,
    titulo,
    cuerpo: partes.join(". "),
  };
}
