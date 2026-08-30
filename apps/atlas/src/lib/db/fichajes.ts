// src/lib/db/fichajes.ts
//
// Fichar, parar, añadir un tramo olvidado y leer las horas. Recibe `sb` para
// poder probarse contra la base; los envoltorios "use server" están en
// `acciones-fichajes.ts`.
//
// NO filtra por rol. Un colaborador ve y escribe solo sus filas porque RLS lo
// decide; el propietario ve las de todos por lo mismo. Los `.eq("usuario_id")`
// de abajo son defensa en profundidad, no la barrera.
//
import type { Sb } from "./clientes";
import type { Ok } from "./proyectos";
import type { Tramo } from "@/lib/horas/tramos";
import { TOPE_HORAS } from "@/lib/horas/abiertos";

export type EntradaFichaje = {
  proyectoId: string | null;
  clienteId: string | null;
  nota: string | null;
};

export type EntradaTramo = EntradaFichaje & {
  /** ISO con zona. */
  inicio: string;
  fin: string;
};

/** Lo que queda escrito en la nota cuando `parar` cierra por tope. */
export const NOTA_TOPE = "Cerrado por tope: el fin es reconstruido, no medido";

const CAMPOS =
  "id, usuario_id, proyecto_id, cliente_id, inicio, fin, origen, nota, " +
  // Uniones EXTERNAS a propósito: un colaborador sin permiso sobre el
  // proyecto no ve su fila en `proyectos`, y con `!inner` su propio fichaje
  // desaparecería del listado. Aparece con el nombre a null, que es la verdad.
  "perfiles(nombre), proyectos(nombre), clientes(nombre)";

// PostgREST entrega la relación a veces como objeto y a veces como array.
function uno<T>(u: T | T[] | null): T | null {
  return Array.isArray(u) ? (u[0] ?? null) : u;
}

type Fila = {
  id: string;
  usuario_id: string;
  proyecto_id: string | null;
  cliente_id: string | null;
  inicio: string;
  fin: string | null;
  origen: string;
  nota: string | null;
  perfiles: { nombre: string | null } | { nombre: string | null }[] | null;
  proyectos: { nombre: string } | { nombre: string }[] | null;
  clientes: { nombre: string } | { nombre: string }[] | null;
};

function aTramo(f: Fila): Tramo {
  return {
    id: f.id,
    usuarioId: f.usuario_id,
    usuarioNombre: uno(f.perfiles)?.nombre ?? null,
    proyectoId: f.proyecto_id,
    proyectoNombre: uno(f.proyectos)?.nombre ?? null,
    clienteId: f.cliente_id,
    clienteNombre: uno(f.clientes)?.nombre ?? null,
    inicio: f.inicio,
    fin: f.fin,
    origen: f.origen as Tramo["origen"],
    nota: f.nota,
  };
}

/** Puro: se valida aquí y no en el formulario, porque una acción de servidor es un endpoint público. */
export function validarTramo(e: EntradaTramo, ahoraMs: number): Ok {
  const ini = Date.parse(e.inicio);
  const fin = Date.parse(e.fin);
  if (Number.isNaN(ini) || Number.isNaN(fin)) {
    return { ok: false, error: "El inicio o el fin no son una fecha." };
  }
  if (fin <= ini) return { ok: false, error: "El fin tiene que ser posterior al inicio." };
  if (fin > ahoraMs) return { ok: false, error: "El fin no puede estar en el futuro." };
  if (fin - ini > TOPE_HORAS * 3_600_000) {
    return {
      ok: false,
      error: `Un tramo no puede pasar de ${TOPE_HORAS} horas. Si fue más largo, pártelo en dos.`,
    };
  }
  return { ok: true };
}

async function quienSoy(sb: Sb): Promise<string | null> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.id ?? null;
}

export async function fichajeEnCurso(sb: Sb): Promise<Tramo | null> {
  const yo = await quienSoy(sb);
  if (!yo) return null;
  const { data, error } = await sb
    .from("fichajes")
    .select(CAMPOS)
    .eq("usuario_id", yo)
    .is("fin", null)
    .maybeSingle();
  if (error) throw error;
  return data ? aTramo(data as unknown as Fila) : null;
}

export async function empezar(sb: Sb, e: EntradaFichaje): Promise<Ok> {
  const yo = await quienSoy(sb);
  if (!yo) return { ok: false, error: "No hay sesión." };
  const { error } = await sb.from("fichajes").insert({
    usuario_id: yo,
    proyecto_id: e.proyectoId,
    cliente_id: e.clienteId,
    nota: e.nota,
    inicio: new Date().toISOString(),
  });
  if (!error) return { ok: true };
  // El índice único parcial es la garantía; aquí solo se traduce su error a
  // algo que una persona entienda.
  if (error.code === "23505") {
    return { ok: false, error: "Ya tienes un fichaje en curso. Páralo antes de empezar otro." };
  }
  return { ok: false, error: error.message };
}

/**
 * Cierra el fichaje en curso. Recibe `ahoraMs` por parámetro (la acción pasa
 * `Date.now()`) para poder probar el tope sin esperar dieciséis horas.
 *
 * Si el abierto lleva más de `TOPE_HORAS`, no se cierra en `ahora`: se cierra
 * en `inicio + TOPE_HORAS`, con `origen='anadido'` y una nota que lo dice.
 * Un fichaje olvidado tres días, cerrado en `ahora`, sería un tramo de 72 h
 * con `origen='atlas'`; la lectura lo toparía a 16 h y quedaría indistinguible
 * de una jornada honesta de 16 h medidas. Pero ese fin no se midió: se
 * reconstruyó, y eso es exactamente lo que `anadido` significa. Así el
 * resumen lo cuenta como reconstruido, la tabla lo enseña como añadido y
 * quien lo ve puede borrarlo y añadir el tramo bueno.
 */
export async function parar(sb: Sb, ahoraMs: number): Promise<Ok> {
  const yo = await quienSoy(sb);
  if (!yo) return { ok: false, error: "No hay sesión." };
  const { data: abierto, error: errorLeer } = await sb
    .from("fichajes")
    .select("id, inicio, nota")
    .eq("usuario_id", yo)
    .is("fin", null)
    .maybeSingle();
  if (errorLeer) return { ok: false, error: errorLeer.message };
  // Cero filas no es un error de Postgres, pero sí es mentir si se devuelve ok.
  if (!abierto) return { ok: false, error: "No hay ningún fichaje en curso." };

  const inicioMs = Date.parse(abierto.inicio);
  const topeMs = TOPE_HORAS * 3_600_000;
  const porTope = ahoraMs - inicioMs > topeMs;
  const cambios = porTope
    ? {
        fin: new Date(inicioMs + topeMs).toISOString(),
        origen: "anadido",
        // Si ya había nota, se antepone: lo que escribió la persona no se pierde.
        nota: [NOTA_TOPE, abierto.nota].filter(Boolean).join(" · "),
      }
    : { fin: new Date(ahoraMs).toISOString() };

  const { data, error } = await sb
    .from("fichajes")
    .update(cambios)
    .eq("id", abierto.id)
    .eq("usuario_id", yo)
    .is("fin", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // Entre la lectura y la escritura otro cliente pudo cerrarlo: no se finge.
  if (!data || data.length === 0) return { ok: false, error: "No hay ningún fichaje en curso." };
  return { ok: true };
}

/**
 * Borra un tramo propio. RLS (`fichajes_propios`) es la barrera: un
 * colaborador no puede tocar filas ajenas y el propietario solo las suyas
 * para escritura; el `.eq("usuario_id", yo)` es defensa en profundidad. Si no
 * se borró ninguna fila —no existe, o no es mía— se dice, porque devolver ok
 * sobre una fila que sigue ahí es mentir.
 */
export async function borrarTramo(sb: Sb, id: string): Promise<Ok> {
  const yo = await quienSoy(sb);
  if (!yo) return { ok: false, error: "No hay sesión." };
  const { data, error } = await sb
    .from("fichajes")
    .delete()
    .eq("id", id)
    .eq("usuario_id", yo)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Ese tramo no existe o no es tuyo." };
  }
  return { ok: true };
}

export async function anadirTramo(sb: Sb, e: EntradaTramo, ahoraMs: number): Promise<Ok> {
  const valido = validarTramo(e, ahoraMs);
  if (!valido.ok) return valido;
  const yo = await quienSoy(sb);
  if (!yo) return { ok: false, error: "No hay sesión." };
  const { error } = await sb.from("fichajes").insert({
    usuario_id: yo,
    proyecto_id: e.proyectoId,
    cliente_id: e.clienteId,
    nota: e.nota,
    inicio: e.inicio,
    fin: e.fin,
    origen: "anadido",
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Los tramos cuyo inicio cae en el rango. Quién los ve lo decide RLS.
 *
 * El corte es por `inicio`, no por `fin`: un tramo que empieza el 31 a las
 * 23:00 y termina el 1 a las 02:00 cuenta entero en el mes en que empezó.
 * Es a propósito — así un mismo tramo nunca se cuenta dos veces, ni se
 * parte entre dos listados.
 */
export async function listarTramos(
  sb: Sb,
  rango: { desde: string; hasta: string }
): Promise<Tramo[]> {
  const { data, error } = await sb
    .from("fichajes")
    .select(CAMPOS)
    .gte("inicio", rango.desde)
    .lt("inicio", rango.hasta)
    .order("inicio", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((f) => aTramo(f as unknown as Fila));
}

/**
 * El inicio del fichaje más reciente que se puede ver, esté en el mes que
 * esté. «Último fichaje» no puede salir de los tramos del mes: el día 1 diría
 * «Nunca» aunque se fichara ayer. Quién ve qué lo decide RLS.
 */
export async function ultimoInicio(sb: Sb): Promise<string | null> {
  const { data, error } = await sb
    .from("fichajes")
    .select("inicio")
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.inicio ?? null;
}
