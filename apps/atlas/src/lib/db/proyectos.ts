import type { Sb } from "./clientes";
import { obtenerPerfil } from "./perfil";

export type ProyectoResumen = {
  id: string;
  nombre: string;
  slug: string;
  tipo: string;
  estado: string;
  portadaUrl: string | null;
  gradiente: string | null;
  numClientes: number;
};

export async function listarProyectos(sb: Sb): Promise<ProyectoResumen[]> {
  const { data, error } = await sb
    .from("proyectos")
    .select("id, nombre, slug, tipo, estado, portada_url, gradiente")
    .order("nombre");
  if (error) throw error;

  // Siempre de la vista, nunca de la tabla `contratos`. Ver README.md.
  const { data: contratos, error: errC } = await sb
    .from("contratos_visibles")
    .select("proyecto_id, cliente_id, estado");
  if (errC) throw errC;

  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    tipo: p.tipo,
    estado: p.estado,
    portadaUrl: p.portada_url,
    gradiente: p.gradiente,
    numClientes: new Set(
      (contratos ?? [])
        .filter((ct) => ct.proyecto_id === p.id && ct.estado === "activo")
        .map((ct) => ct.cliente_id)
    ).size,
  }));
}

export type ServicioResumen = {
  id: string;
  nombre: string;
  tipo: string;
  proveedor: string | null;
  /** null = el servicio es del proyecto, sin dueño comercial concreto. */
  clienteNombre: string | null;
  activo: boolean;
};

export type ContratoDeProyecto = {
  id: string;
  clienteNombre: string;
  cuotaMensual: number | null;
  /** ISO AAAA-MM-DD */
  alta: string;
  estado: string;
};

export type ProyectoFicha = ProyectoResumen & {
  descripcion: string | null;
  stack: string[];
  repoUrl: string | null;
  servicios: ServicioResumen[];
  enlaces: { id: string; etiqueta: string; url: string }[];
  contratos: ContratoDeProyecto[];
};

export async function obtenerProyecto(
  sb: Sb,
  slug: string
): Promise<ProyectoFicha | null> {
  const { data: p, error } = await sb
    .from("proyectos")
    .select(
      "id, nombre, slug, tipo, estado, portada_url, gradiente, descripcion, stack, repo_url"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!p) return null;

  const [servicios, enlaces, contratos] = await Promise.all([
    sb
      .from("servicios")
      .select("id, nombre, tipo, proveedor, activo, orden, clientes(nombre)")
      .eq("proyecto_id", p.id)
      .order("orden"),
    sb
      .from("enlaces")
      .select("id, etiqueta, url, orden")
      .eq("proyecto_id", p.id)
      .order("orden"),
    // Siempre de la vista, nunca de la tabla `contratos`. Ver README.md.
    sb
      .from("contratos_visibles")
      .select("id, cuota_mensual, alta, estado, clientes(nombre)")
      .eq("proyecto_id", p.id)
      .order("alta"),
  ]);
  if (servicios.error) throw servicios.error;
  if (enlaces.error) throw enlaces.error;
  if (contratos.error) throw contratos.error;

  // Supabase genera TODAS las columnas de una vista como anulables: PostgREST
  // no puede inferir nulabilidad a través de una vista, aunque en la tabla de
  // origen sean NOT NULL. Se filtra en lugar de forzar el tipo, para no mentirle
  // al compilador sobre algo que no controlamos.
  const lista = (contratos.data ?? []).filter(
    (ct): ct is typeof ct & { id: string; alta: string; estado: string } =>
      ct.id !== null && ct.alta !== null && ct.estado !== null
  );

  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    tipo: p.tipo,
    estado: p.estado,
    portadaUrl: p.portada_url,
    gradiente: p.gradiente,
    descripcion: p.descripcion,
    stack: p.stack,
    repoUrl: p.repo_url,
    numClientes: new Set(
      lista.filter((ct) => ct.estado === "activo").map((ct) => ct.clientes?.nombre)
    ).size,
    servicios: (servicios.data ?? []).map((s) => ({
      id: s.id,
      nombre: s.nombre,
      tipo: s.tipo,
      proveedor: s.proveedor,
      activo: s.activo,
      clienteNombre: s.clientes?.nombre ?? null,
    })),
    enlaces: (enlaces.data ?? []).map((e) => ({
      id: e.id,
      etiqueta: e.etiqueta,
      url: e.url,
    })),
    contratos: lista.map((ct) => ({
      id: ct.id,
      clienteNombre: ct.clientes?.nombre ?? "—",
      cuotaMensual: ct.cuota_mensual,
      alta: ct.alta,
      estado: ct.estado,
    })),
  };
}

// ---------------------------------------------------------------------------
// Escritura.
//
// Estas funciones reciben `sb` y hacen TODO el trabajo: validar, comprobar el
// rol y escribir. Los envoltorios de `acciones-proyecto.ts` solo resuelven el
// cliente de servidor y revalidan la caché. Está partido así para que la parte
// que decide se pueda probar de verdad contra la base: una acción "use server"
// necesita un ámbito de petición HTTP y desde un test no hay ninguno.
// ---------------------------------------------------------------------------

export type Ok = { ok: true } | { ok: false; error: string };

export type EntradaContrato = {
  clienteId: string;
  proyectoId: string;
  cuotaMensual: number | null;
  addons: string[];
  alta: string; // ISO AAAA-MM-DD
  baja: string | null; // ISO AAAA-MM-DD
  estado: string;
};

export type EntradaServicio = {
  proyectoId: string;
  clienteId: string | null;
  nombre: string;
  tipo: string;
  proveedor: string | null;
};

export const TIPOS_SERVICIO = [
  "web", "api", "webhook", "workflow", "agente-voz",
  "telefonia", "base-datos", "cron", "dominio", "otro",
] as const;

const ESTADOS_CONTRATO = ["activo", "pausado", "finalizado"] as const;

/**
 * Comprueba que la cadena es una fecha ISO AAAA-MM-DD *real*: el patrón por sí
 * solo aceptaría 2026-13-01 o 2026-02-31.
 */
function esFechaISO(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function validarContrato(entrada: EntradaContrato): Ok {
  if (entrada.cuotaMensual !== null && entrada.cuotaMensual < 0) {
    return { ok: false, error: "La cuota no puede ser negativa." };
  }
  if (!esFechaISO(entrada.alta)) {
    return { ok: false, error: "La fecha de alta debe tener el formato AAAA-MM-DD." };
  }
  if (entrada.baja !== null) {
    if (!esFechaISO(entrada.baja)) {
      return { ok: false, error: "La fecha de baja debe tener el formato AAAA-MM-DD." };
    }
    // Comparar cadenas ISO es correcto: AAAA-MM-DD ordena igual alfabética que
    // cronológicamente. Duplica el CHECK de la tabla a propósito, para dar un
    // mensaje entendible en vez de un error crudo de Postgres.
    if (entrada.baja < entrada.alta) {
      return { ok: false, error: "La fecha de baja no puede ser anterior a la de alta." };
    }
  }
  if (!(ESTADOS_CONTRATO as readonly string[]).includes(entrada.estado)) {
    return { ok: false, error: `El estado «${entrada.estado}» no existe.` };
  }
  return { ok: true };
}

export function validarServicio(entrada: EntradaServicio): Ok {
  if (entrada.nombre.trim().length === 0) {
    return { ok: false, error: "El nombre del servicio no puede estar vacío." };
  }
  if (!(TIPOS_SERVICIO as readonly string[]).includes(entrada.tipo)) {
    return {
      ok: false,
      error: `El tipo «${entrada.tipo}» no existe. Admitidos: ${TIPOS_SERVICIO.join(", ")}.`,
    };
  }
  return { ok: true };
}

export async function escribirContrato(sb: Sb, entrada: EntradaContrato): Promise<Ok> {
  const valido = validarContrato(entrada);
  if (!valido.ok) return valido;

  // Un contrato lleva dinero: esto es cosa del propietario. RLS lo impediría
  // igualmente, pero así el mensaje es claro en vez de un 42501 seco.
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar contratos." };
  }

  const { error } = await sb.from("contratos").insert({
    cliente_id: entrada.clienteId,
    proyecto_id: entrada.proyectoId,
    cuota_mensual: entrada.cuotaMensual,
    addons: entrada.addons,
    alta: entrada.alta,
    baja: entrada.baja,
    estado: entrada.estado,
  });
  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          error: "Ya existe un contrato de ese cliente y proyecto con esa fecha de alta.",
        }
      : { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function escribirServicio(sb: Sb, entrada: EntradaServicio): Promise<Ok> {
  const valido = validarServicio(entrada);
  if (!valido.ok) return valido;

  // Aquí NO se exige ser propietario: un editor gestiona los servicios de sus
  // proyectos. Quien decide es la política RLS `servicios_escribir`, que ya
  // comprueba `atlas_edita_proyecto`.
  const { error } = await sb.from("servicios").insert({
    proyecto_id: entrada.proyectoId,
    cliente_id: entrada.clienteId,
    nombre: entrada.nombre.trim(),
    tipo: entrada.tipo,
    proveedor: entrada.proveedor,
  });
  if (error) {
    return error.code === "42501"
      ? { ok: false, error: "No tienes permiso para editar este proyecto." }
      : { ok: false, error: error.message };
  }
  return { ok: true };
}
