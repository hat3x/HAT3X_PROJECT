/**
 * reconstruir-finding-id.ts — vuelve a unir cada línea de presupuesto con su
 * hallazgo del odontograma.
 * ---------------------------------------------------------------------------
 * ── QUÉ PASÓ ────────────────────────────────────────────────────────────────
 * `plan_item.finding_id` debería apuntar al hallazgo que esa línea materializa
 * (ver el comentario de `20260801100000_treatment_plans.sql`). El volcado
 * inicial creó los hallazgos y los presupuestos desde la MISMA fuente pero por
 * separado, y nunca los unió: la columna está a null en todas las líneas.
 *
 * Sin ese enlace, "el presupuesto de ESTE hallazgo" —esta caries del 26, no la
 * corona del mismo diente— no se puede contestar. Lo que sí funciona hoy es la
 * pregunta por DIENTE (`fdi_code`), que es la que usa `ToothBudgetCard`.
 *
 * ── POR QUÉ UN SCRIPT Y NO UNA MIGRACIÓN ────────────────────────────────────
 * Una migración se aplica una vez y a ciegas. Esto es una reparación de datos
 * sobre una clínica en producción: hay que poder MIRAR primero cuántas líneas
 * tienen un candidato único, cuántas ninguno y cuántas varias, y decidir con
 * ese número delante. Por eso el script no escribe salvo que se le pida.
 *
 * ── CÓMO EMPAREJA ───────────────────────────────────────────────────────────
 * Buscar hallazgo por hallazgo no funciona, y el dato dice por qué: el volcado
 * creó las dos tablas en el mismo instante y sin superficies, así que dos
 * obturaciones del 26 son individualmente indistinguibles. Mirando línea a
 * línea solo se resuelve el 28 %.
 *
 * Por eso van dos pasadas, de la más fuerte a la más débil:
 *
 *   1. **Por conjunto.** Dentro de un mismo diente y un mismo tipo clínico, si
 *      hay tantas líneas como hallazgos, se emparejan 1:1 por orden. Cuál va
 *      con cuál da igual —son equivalentes—, y el resultado es correcto como
 *      conjunto. Exigir que cuadre POR TIPO impide el único error que haría
 *      daño: colgar una endodoncia del hallazgo de una corona.
 *      Resuelve el 88 % de las líneas.
 *
 *   2. **Una a una**, sobre lo que quede: candidato único, tipo clínico,
 *      superficies y, como último recurso, cercanía en el tiempo. Los hallazgos
 *      que repartió la primera pasada ya no se ofrecen.
 *
 * Lo que no se puede decidir se deja SIN enlazar y se cuenta aparte. Adivinar un
 * enlace clínico es peor que no tenerlo: quien mire la ficha creería que ese
 * presupuesto es de ese hallazgo, y nadie se lo habría dicho.
 *
 * Nunca pisa un `finding_id` que ya exista.
 *
 * USO
 * ---
 *   npx tsx scripts/reconstruir-finding-id.ts               # solo analiza
 *   npx tsx scripts/reconstruir-finding-id.ts --salon=<id>  # acota a un salón
 *   npx tsx scripts/reconstruir-finding-id.ts --aplicar     # escribe los enlaces
 *
 * Al revés que el resto de scripts del repo, aquí el modo seguro es el DEFECTO:
 * un `--dry-run` es fácil de olvidar en una reparación que se ejecuta una vez.
 */

import { mapServiceToFindingType } from "@/lib/dental/treatment";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadEnvLocal } from "./seed-demo-salon";

const PAGINA = 1000;

interface LineaPlan {
  id: string;
  salonId: string;
  fdiCode: number;
  surfaces: string[];
  createdAt: string;
  findingId: string | null;
  customerId: string;
  /**
   * Tipo clínico deducido del servicio o de la descripción de la línea
   * ("ENDODONCIA" → `endodoncia`). `nota` significa "no se ha podido deducir",
   * y entonces no se usa para filtrar: sería descartar candidatos buenos.
   */
  tipo: string;
}

interface Hallazgo {
  id: string;
  salon_id: string;
  clinical_record_id: string;
  fdi_tooth: number;
  surfaces: string[] | null;
  recorded_at: string;
  finding_type: string;
}

function log(etapa: string, mensaje: string): void {
  // eslint-disable-next-line no-console
  console.log(`[reconstruir-finding-id] ${etapa.padEnd(10)} ${mensaje}`);
}

/**
 * Recorre una consulta en páginas y devuelve todas sus filas.
 *
 * Supabase corta en 1.000 filas por consulta, y aquí hay ~8.000 líneas: sin
 * paginar, el análisis leería solo el primer millar y daría un porcentaje de
 * cobertura falso, que es peor que no dar ninguno.
 *
 * Recibe una función que construye la consulta para un rango, en vez de una
 * consulta ya hecha: los objetos de supabase-js no se pueden reejecutar.
 */
async function leerPaginado<T>(
  etiqueta: string,
  consultarRango: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consultarRango(desde, desde + PAGINA - 1);
    if (error !== null) throw new Error(`${etiqueta}: ${error.message}`);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

/** Clave de agrupación: una línea y un hallazgo solo pueden casar dentro de ella. */
function clave(salonId: string, pacienteId: string, diente: number): string {
  return `${salonId}|${pacienteId}|${diente}`;
}

function mismasSuperficies(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const ordenA = [...a].sort();
  const ordenB = [...b].sort();
  return ordenA.every((s, i) => s === ordenB[i]);
}

export interface Eleccion {
  hallazgoId: string;
  motivo: "unico" | "tipo" | "superficies" | "cercania";
}

/** Lo mínimo que hace falta saber de un candidato para decidir. */
export interface CandidatoHallazgo {
  id: string;
  surfaces: string[] | null;
  recorded_at: string;
  finding_type?: string;
}

/**
 * Elige el hallazgo de una línea entre sus candidatos, o `null` si no se puede
 * decidir sin adivinar. Exportada para poder probarla sin base de datos.
 *
 * Orden de los criterios, del más fuerte al más débil:
 *   1. **Tipo clínico.** Una endodoncia no es una corona. Es lo único que
 *      distingue de verdad dos líneas del mismo diente.
 *   2. **Superficies.** Dato clínico también, pero el volcado las dejó vacías
 *      casi siempre, así que rara vez decide.
 *   3. **Cercanía en el tiempo.** El más débil, y en datos importados en bloque
 *      empata constantemente. Por eso va el último.
 */
export function elegirHallazgo(
  linea: { surfaces: readonly string[]; createdAt: string; tipo?: string },
  candidatos: readonly CandidatoHallazgo[],
): Eleccion | null {
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return { hallazgoId: candidatos[0]!.id, motivo: "unico" };

  // `nota` es el valor al que cae el mapeo cuando no reconoce el procedimiento:
  // filtrar por él descartaría candidatos buenos por una deducción fallida.
  const porTipo =
    linea.tipo === undefined || linea.tipo === "nota"
      ? candidatos
      : candidatos.filter((h) => h.finding_type === linea.tipo);

  if (porTipo.length === 1) return { hallazgoId: porTipo[0]!.id, motivo: "tipo" };

  // Si el tipo no dejó a nadie, se vuelve atrás: puede que el hallazgo esté
  // clasificado de otra forma, y quedarse sin candidatos es peor que dudar.
  const trasTipo = porTipo.length > 0 ? porTipo : candidatos;

  const porSuperficie = trasTipo.filter((h) =>
    mismasSuperficies(h.surfaces ?? [], linea.surfaces),
  );
  if (porSuperficie.length === 1) {
    return { hallazgoId: porSuperficie[0]!.id, motivo: "superficies" };
  }

  const finalistas = porSuperficie.length > 0 ? porSuperficie : trasTipo;
  const referencia = new Date(linea.createdAt).getTime();

  let mejor: string | null = null;
  let mejorDistancia = Number.POSITIVE_INFINITY;
  let empatado = false;

  for (const h of finalistas) {
    const distancia = Math.abs(new Date(h.recorded_at).getTime() - referencia);
    if (distancia < mejorDistancia) {
      mejor = h.id;
      mejorDistancia = distancia;
      empatado = false;
    } else if (distancia === mejorDistancia) {
      empatado = true;
    }
  }

  // Empate exacto en el tiempo: no hay forma de decidir sin inventar.
  if (mejor === null || empatado) return null;
  return { hallazgoId: mejor, motivo: "cercania" };
}

/**
 * Empareja 1:1 las líneas y los hallazgos de un mismo diente, tipo por tipo,
 * cuando de ese tipo hay tantas líneas como hallazgos.
 *
 * ── POR QUÉ ESTO Y NO BUSCAR UNA A UNA ──────────────────────────────────────
 * El volcado creó las dos tablas en el mismo instante y sin superficies, así
 * que dos obturaciones del 26 son individualmente indistinguibles: mirando una
 * línea sola no hay forma de saber cuál de los dos hallazgos le toca. Pero si
 * en ese diente hay 2 líneas de obturación y exactamente 2 hallazgos de
 * obturación, el conjunto sí se corresponde: es una asignación, no una
 * búsqueda. Cuál va con cuál da igual —son equivalentes— y el resultado es
 * correcto como conjunto.
 *
 * Se exige que cuadre POR TIPO y no solo por diente: así es imposible enganchar
 * una endodoncia al hallazgo de una corona, que es el error que sí haría daño.
 *
 * Si de un tipo no cuadra el número, ese tipo se deja entero sin enlazar.
 */
export function asignarPorConjunto(
  lineas: readonly { id: string; tipo: string; createdAt: string }[],
  hallazgos: readonly { id: string; finding_type: string; recorded_at: string }[],
): Map<string, string> {
  const porTipoLinea = new Map<string, { id: string; createdAt: string }[]>();
  for (const l of lineas) {
    const lista = porTipoLinea.get(l.tipo);
    if (lista === undefined) porTipoLinea.set(l.tipo, [l]);
    else lista.push(l);
  }

  const porTipoHallazgo = new Map<string, { id: string; recorded_at: string }[]>();
  for (const h of hallazgos) {
    const lista = porTipoHallazgo.get(h.finding_type);
    if (lista === undefined) porTipoHallazgo.set(h.finding_type, [h]);
    else lista.push(h);
  }

  const asignacion = new Map<string, string>();
  for (const [tipo, susLineas] of porTipoLinea) {
    const susHallazgos = porTipoHallazgo.get(tipo) ?? [];
    if (susHallazgos.length !== susLineas.length) continue;

    // Orden estable por tiempo y, a igualdad, por id: dos ejecuciones del
    // script tienen que producir exactamente el mismo emparejado.
    const lineasOrdenadas = [...susLineas].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
    const hallazgosOrdenados = [...susHallazgos].sort(
      (a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id),
    );

    lineasOrdenadas.forEach((linea, i) => {
      asignacion.set(linea.id, hallazgosOrdenados[i]!.id);
    });
  }

  return asignacion;
}

async function main(argv: readonly string[]): Promise<void> {
  const aplicar = argv.includes("--aplicar");
  const salonArg = argv.find((a) => a.startsWith("--salon="))?.slice("--salon=".length);

  loadEnvLocal(process.cwd());
  const client = createAdminClient();

  log("modo", aplicar ? "APLICAR — se escribirán los enlaces" : "análisis — no se escribe nada");
  if (salonArg !== undefined) log("salon", `acotado a ${salonArg}`);

  // ── Lectura ───────────────────────────────────────────────────────────────
  const lineasCrudas = await leerPaginado("plan_item", (desde, hasta) => {
    const consulta = client
      .from("plan_item")
      .select(
        "id, salon_id, fdi_code, surfaces, created_at, finding_id, description, treatment_plan!inner(customer_id)",
      )
      .not("fdi_code", "is", null);
    return (salonArg === undefined ? consulta : consulta.eq("salon_id", salonArg)).range(
      desde,
      hasta,
    );
  });

  // El `.not("fdi_code", "is", null)` de arriba ya las descarta, pero los tipos
  // generados no lo saben: se estrecha aquí en vez de afirmarlo con un `!`.
  const lineas: LineaPlan[] = lineasCrudas.flatMap((l) =>
    l.fdi_code === null
      ? []
      : [
          {
            id: l.id,
            salonId: l.salon_id,
            fdiCode: l.fdi_code,
            surfaces: l.surfaces ?? [],
            createdAt: l.created_at,
            findingId: l.finding_id,
            customerId: l.treatment_plan.customer_id,
            // El tipo se deduce de la descripción: es donde el volcado dejó el
            // nombre del procedimiento ("RECONSTRUCCIÓN", "ENDODONCIA").
            tipo: mapServiceToFindingType(
              l.description === null ? null : { name: l.description },
            ),
          },
        ],
  );

  const hallazgos = await leerPaginado<Hallazgo>("odontogram_findings", (desde, hasta) => {
    const consulta = client
      .from("odontogram_findings")
      .select("id, salon_id, clinical_record_id, fdi_tooth, surfaces, recorded_at, finding_type");
    return (salonArg === undefined ? consulta : consulta.eq("salon_id", salonArg)).range(
      desde,
      hasta,
    );
  });

  log("leido", `${lineas.length} líneas con diente · ${hallazgos.length} hallazgos`);

  // ── Emparejado ────────────────────────────────────────────────────────────
  const porClave = new Map<string, Hallazgo[]>();
  for (const h of hallazgos) {
    const k = clave(h.salon_id, h.clinical_record_id, h.fdi_tooth);
    const lista = porClave.get(k);
    if (lista === undefined) porClave.set(k, [h]);
    else lista.push(h);
  }

  const conteo = {
    yaEnlazadas: 0,
    sinCandidato: 0,
    conjunto: 0,
    unico: 0,
    tipo: 0,
    superficies: 0,
    cercania: 0,
    ambiguas: 0,
  };
  const aEscribir: { id: string; findingId: string }[] = [];

  // ── Pasada 1: asignación por conjunto ─────────────────────────────────────
  // Va primero porque es la más fuerte: cuando el número cuadra tipo a tipo, el
  // resultado es correcto como conjunto y no depende de desempates frágiles.
  const lineasPendientes = lineas.filter((l) => l.findingId === null);
  conteo.yaEnlazadas = lineas.length - lineasPendientes.length;

  const porGrupo = new Map<string, LineaPlan[]>();
  for (const linea of lineasPendientes) {
    const k = clave(linea.salonId, linea.customerId, linea.fdiCode);
    const lista = porGrupo.get(k);
    if (lista === undefined) porGrupo.set(k, [linea]);
    else lista.push(linea);
  }

  const asignadas = new Map<string, string>();
  const hallazgosUsados = new Set<string>();
  for (const [k, susLineas] of porGrupo) {
    const asignacion = asignarPorConjunto(susLineas, porClave.get(k) ?? []);
    for (const [lineaId, hallazgoId] of asignacion) {
      asignadas.set(lineaId, hallazgoId);
      hallazgosUsados.add(hallazgoId);
    }
  }

  // ── Pasada 2: una a una, sobre lo que la primera no cerró ─────────────────
  for (const linea of lineasPendientes) {
    const yaAsignado = asignadas.get(linea.id);
    if (yaAsignado !== undefined) {
      conteo.conjunto += 1;
      aEscribir.push({ id: linea.id, findingId: yaAsignado });
      continue;
    }

    // Los hallazgos que la primera pasada ya repartió no vuelven a ofrecerse:
    // dos líneas con el mismo hallazgo sería peor que dejar una sin enlazar.
    const candidatos = (
      porClave.get(clave(linea.salonId, linea.customerId, linea.fdiCode)) ?? []
    ).filter((h) => !hallazgosUsados.has(h.id));
    const elegido = elegirHallazgo(linea, candidatos);

    if (elegido === null) {
      if (candidatos.length === 0) conteo.sinCandidato += 1;
      else conteo.ambiguas += 1;
      continue;
    }
    conteo[elegido.motivo] += 1;
    hallazgosUsados.add(elegido.hallazgoId);
    aEscribir.push({ id: linea.id, findingId: elegido.hallazgoId });
  }

  const resolubles =
    conteo.conjunto + conteo.unico + conteo.tipo + conteo.superficies + conteo.cercania;
  const pendientes = lineas.length - conteo.yaEnlazadas;
  const pct = pendientes === 0 ? 0 : Math.round((resolubles / pendientes) * 1000) / 10;

  // eslint-disable-next-line no-console
  console.table({
    "ya enlazadas": conteo.yaEnlazadas,
    "asignada por conjunto (diente + tipo)": conteo.conjunto,
    "candidato unico": conteo.unico,
    "resuelta por tipo clinico": conteo.tipo,
    "resuelta por superficies": conteo.superficies,
    "resuelta por cercania": conteo.cercania,
    "ambiguas (se dejan sin enlazar)": conteo.ambiguas,
    "sin ningun candidato": conteo.sinCandidato,
  });
  log("cobertura", `${resolubles} de ${pendientes} líneas pendientes (${pct} %)`);

  // ── Diagnóstico de la ambigüedad ──────────────────────────────────────────
  // Antes de proponer una estrategia más agresiva hay que saber POR QUÉ empatan.
  // Si dentro de un (paciente, diente) hay tantas líneas como hallazgos, el
  // emparejamiento uno a uno es una asignación, no una búsqueda: individualmente
  // son indistinguibles, pero como conjunto se corresponden.
  const lineasPorGrupo = new Map<string, LineaPlan[]>();
  for (const linea of lineas) {
    const k = clave(linea.salonId, linea.customerId, linea.fdiCode);
    const lista = lineasPorGrupo.get(k);
    if (lista === undefined) lineasPorGrupo.set(k, [linea]);
    else lista.push(linea);
  }

  let gruposCuadran = 0;
  let lineasEnGruposQueCuadran = 0;
  let gruposCuadranPorTipo = 0;
  let lineasEnGruposQueCuadranPorTipo = 0;

  for (const [k, susLineas] of lineasPorGrupo) {
    const susHallazgos = porClave.get(k) ?? [];
    if (susLineas.length === susHallazgos.length && susHallazgos.length > 0) {
      gruposCuadran += 1;
      lineasEnGruposQueCuadran += susLineas.length;
    }
    // Lo mismo, pero exigiendo que cuadre tipo a tipo: mucho más seguro, porque
    // no puede emparejar una endodoncia con una corona.
    const cuentaLineas = new Map<string, number>();
    for (const l of susLineas) cuentaLineas.set(l.tipo, (cuentaLineas.get(l.tipo) ?? 0) + 1);
    const cuentaHallazgos = new Map<string, number>();
    for (const h of susHallazgos) {
      cuentaHallazgos.set(h.finding_type, (cuentaHallazgos.get(h.finding_type) ?? 0) + 1);
    }
    const cuadraPorTipo =
      cuentaLineas.size > 0 &&
      [...cuentaLineas].every(([tipo, n]) => cuentaHallazgos.get(tipo) === n);
    if (cuadraPorTipo) {
      gruposCuadranPorTipo += 1;
      lineasEnGruposQueCuadranPorTipo += susLineas.length;
    }
  }

  // eslint-disable-next-line no-console
  console.table({
    "grupos (paciente + diente)": lineasPorGrupo.size,
    "grupos con igual nº de líneas que de hallazgos": gruposCuadran,
    "líneas en esos grupos": lineasEnGruposQueCuadran,
    "grupos que cuadran TIPO A TIPO": gruposCuadranPorTipo,
    "líneas en los grupos que cuadran por tipo": lineasEnGruposQueCuadranPorTipo,
  });

  // Vocabulario: si el mapeo no reconoce las palabras que usa ESTA clínica, casi
  // todo cae a `nota` y el tipo deja de discriminar. Se mira antes de tocar nada.
  const tiposLinea = new Map<string, number>();
  for (const l of lineas) tiposLinea.set(l.tipo, (tiposLinea.get(l.tipo) ?? 0) + 1);
  const tiposHallazgo = new Map<string, number>();
  for (const h of hallazgos) {
    tiposHallazgo.set(h.finding_type, (tiposHallazgo.get(h.finding_type) ?? 0) + 1);
  }
  const orden = (m: Map<string, number>): Record<string, number> =>
    Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));

  log("tipos", "deducidos de la descripción de la línea:");
  // eslint-disable-next-line no-console
  console.table(orden(tiposLinea));
  log("tipos", "de los hallazgos ya guardados:");
  // eslint-disable-next-line no-console
  console.table(orden(tiposHallazgo));

  // Las descripciones más repetidas que NO se han sabido clasificar: son las
  // palabras que le faltan al mapeo.
  const sinClasificar = new Map<string, number>();
  for (const l of lineasCrudas) {
    if (l.description === null) continue;
    const tipo = mapServiceToFindingType({ name: l.description });
    if (tipo !== "nota") continue;
    const clave = l.description.trim().toUpperCase().slice(0, 40);
    sinClasificar.set(clave, (sinClasificar.get(clave) ?? 0) + 1);
  }
  log("tipos", "descripciones más repetidas que el mapeo NO reconoce:");
  // eslint-disable-next-line no-console
  console.table(
    Object.fromEntries([...sinClasificar].sort((a, b) => b[1] - a[1]).slice(0, 15)),
  );

  if (!aplicar) {
    log("fin", "Análisis terminado. Nada escrito. Añade --aplicar para escribir los enlaces.");
    return;
  }

  // ── Escritura ─────────────────────────────────────────────────────────────
  // Una a una y solo si sigue a null: si alguien enlazó esa línea mientras
  // corría el análisis, se respeta lo suyo en vez de pisarlo.
  let escritas = 0;
  let saltadas = 0;
  for (const fila of aEscribir) {
    const { data, error } = await client
      .from("plan_item")
      .update({ finding_id: fila.findingId })
      .eq("id", fila.id)
      .is("finding_id", null)
      .select("id");
    if (error !== null) throw new Error(`al escribir ${fila.id}: ${error.message}`);
    if ((data ?? []).length === 0) saltadas += 1;
    else escritas += 1;
    if ((escritas + saltadas) % 500 === 0) {
      log("progreso", `${escritas + saltadas} de ${aEscribir.length}`);
    }
  }

  log("escrito", `${escritas} enlaces creados · ${saltadas} saltadas (ya tenían enlace)`);
  log("fin", "Reconstrucción terminada.");
}

// Ejecuta solo cuando se invoca directamente (no al importarse desde un test).
if (require.main === module) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`\n✖ [reconstruir-finding-id] ${message}`);
    process.exitCode = 1;
  });
}
