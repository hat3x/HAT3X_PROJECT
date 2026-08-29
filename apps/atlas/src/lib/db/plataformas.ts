import type { Sb } from "./clientes";
import { obtenerPerfil } from "./perfil";
import type { Ok } from "./proyectos";

//
// El catálogo de lo que HAT3X paga.
//
// Existe para que «cuánto gastamos al mes en cada plataforma» tenga respuesta.
// Con el proveedor como texto libre no la tenía: «Twilio», «twilio» y «Twilio
// Inc» eran tres plataformas distintas en cualquier suma.
//

export const TIPOS = ["variable", "fija"] as const;
export type TipoPlataforma = (typeof TIPOS)[number];

export type Plataforma = {
  id: string;
  nombre: string;
  paraQue: string | null;
  /**
   * `variable` = lo que se paga depende del uso; candidata a conector.
   * `fija` = lo mismo cada mes; se da de alta una vez en los recurrentes.
   */
  tipo: TipoPlataforma;
  activa: boolean;
};

export type EntradaPlataforma = {
  nombre: string;
  paraQue?: string | null;
  tipo: TipoPlataforma;
};

/**
 * El catálogo. **No filtra por permisos**: de eso se encarga RLS, y hay un
 * test que lo comprueba con un colaborador en vez de suponerlo.
 *
 * Por defecto devuelve solo las activas: una plataforma dada de baja sigue
 * teniendo gastos históricos colgando, así que no se borra — pero no tiene
 * sentido ofrecerla al apuntar un gasto nuevo.
 */
export async function listarPlataformas(
  sb: Sb,
  opciones: { incluirBajas?: boolean } = {}
): Promise<Plataforma[]> {
  let consulta = sb
    .from("plataformas")
    .select("id, nombre, para_que, tipo, activa")
    .order("nombre");

  if (!opciones.incluirBajas) consulta = consulta.eq("activa", true);

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    paraQue: p.para_que,
    tipo: p.tipo as TipoPlataforma,
    activa: p.activa,
  }));
}

export async function escribirPlataforma(
  sb: Sb,
  entrada: EntradaPlataforma
): Promise<Ok> {
  const nombre = entrada.nombre.trim();
  if (nombre === "") {
    return { ok: false, error: "La plataforma necesita un nombre." };
  }
  if (!(TIPOS as readonly string[]).includes(entrada.tipo)) {
    return { ok: false, error: `«${entrada.tipo}» no es un tipo de plataforma.` };
  }

  // RLS lo impediría igual, pero así el mensaje es claro en vez de un 42501.
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar plataformas." };
  }

  const { error } = await sb.from("plataformas").insert({
    nombre,
    para_que: entrada.paraQue ?? null,
    tipo: entrada.tipo,
  });

  if (error) {
    // El nombre es único a propósito: dos filas «Twilio» y «twilio» volverían
    // a partir las sumas, que es justo lo que esta tabla vino a arreglar.
    return error.code === "23505"
      ? { ok: false, error: `Ya existe una plataforma llamada «${nombre}».` }
      : { ok: false, error: error.message };
  }
  return { ok: true };
}
