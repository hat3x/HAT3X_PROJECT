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

export async function parar(sb: Sb): Promise<Ok> {
  const yo = await quienSoy(sb);
  if (!yo) return { ok: false, error: "No hay sesión." };
  const { data, error } = await sb
    .from("fichajes")
    .update({ fin: new Date().toISOString() })
    .eq("usuario_id", yo)
    .is("fin", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // Cero filas no es un error de Postgres, pero sí es mentir si se devuelve ok.
  if (!data || data.length === 0) return { ok: false, error: "No hay ningún fichaje en curso." };
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
