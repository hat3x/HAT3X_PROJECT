import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { obtenerPerfil } from "./perfil";

export type Sb = SupabaseClient<Database>;

export type Contacto = {
  id: string;
  nombre: string;
  rol: string | null;
  email: string | null;
  telefono: string | null;
  esPrincipal: boolean;
};

export type ContratoVisible = {
  id: string;
  proyectoId: string;
  /** null = no eres propietario, o el contrato no tiene cuota. */
  cuotaMensual: number | null;
  moneda: string;
  addons: string[];
  /** ISO AAAA-MM-DD */
  alta: string;
  baja: string | null;
  estado: string;
};

export type ClienteResumen = {
  id: string;
  nombre: string;
  slug: string;
  sector: string | null;
  estado: string;
  /** null si no se pueden ver importes. */
  cuotaTotal: number | null;
  numProyectos: number;
};

export type ClienteFicha = ClienteResumen & {
  razonSocial: string | null;
  cif: string | null;
  direccion: string | null;
  portadaUrl: string | null;
  contactos: Contacto[];
  contratos: ContratoVisible[];
};

type FilaContrato = {
  id: string;
  proyecto_id: string;
  cuota_mensual: number | null;
  moneda: string;
  addons: string[];
  alta: string;
  baja: string | null;
  estado: string;
};

const CAMPOS_CONTRATO =
  "id, proyecto_id, cuota_mensual, moneda, addons, alta, baja, estado";

function aContrato(f: FilaContrato): ContratoVisible {
  return {
    id: f.id,
    proyectoId: f.proyecto_id,
    cuotaMensual: f.cuota_mensual,
    moneda: f.moneda,
    addons: f.addons,
    alta: f.alta,
    baja: f.baja,
    estado: f.estado,
  };
}

/**
 * Suma las cuotas de los contratos activos. Devuelve null cuando NINGÚN
 * contrato trae importe: eso significa que quien consulta no es propietario, y
 * mostrar 0 € sería mentir.
 */
function cuotaTotal(contratos: ContratoVisible[]): number | null {
  const activos = contratos.filter((c) => c.estado === "activo");
  const conImporte = activos.filter((c) => c.cuotaMensual !== null);
  if (activos.length > 0 && conImporte.length === 0) return null;
  return conImporte.reduce((suma, c) => suma + (c.cuotaMensual ?? 0), 0);
}

/**
 * Solo `id` y `nombre`, ordenados. Existe aparte de `listarClientes` porque
 * quien la llama —el selector de fichar, en el marco— no necesita ni
 * `contratos_visibles` ni las cuotas agregadas: pedirlas ahí sería arrastrar
 * cuatro consultas de más en CADA página, porque el marco se renderiza en
 * todas.
 */
export async function nombresDeClientes(
  sb: Sb
): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await sb
    .from("clientes")
    .select("id, nombre")
    .order("nombre");
  if (error) throw error;
  return data ?? [];
}

export async function listarClientes(sb: Sb): Promise<ClienteResumen[]> {
  const { data, error } = await sb
    .from("clientes")
    .select("id, nombre, slug, sector, estado")
    .order("nombre");
  if (error) throw error;

  // Siempre de la vista, nunca de la tabla `contratos`. Ver README.md.
  const { data: contratos, error: errC } = await sb
    .from("contratos_visibles")
    .select(`cliente_id, ${CAMPOS_CONTRATO}`);
  if (errC) throw errC;

  return (data ?? []).map((c) => {
    const suyos = (contratos ?? [])
      .filter((ct) => ct.cliente_id === c.id)
      .map((ct) => aContrato(ct as FilaContrato));
    return {
      id: c.id,
      nombre: c.nombre,
      slug: c.slug,
      sector: c.sector,
      estado: c.estado,
      numProyectos: suyos.filter((ct) => ct.estado === "activo").length,
      cuotaTotal: cuotaTotal(suyos),
    };
  });
}

export async function obtenerCliente(
  sb: Sb,
  slug: string
): Promise<ClienteFicha | null> {
  const { data: c, error } = await sb
    .from("clientes")
    .select(
      "id, nombre, slug, sector, estado, razon_social, cif, direccion, portada_url"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!c) return null;

  const [contactos, contratos] = await Promise.all([
    sb
      .from("contactos")
      .select("id, nombre, rol, email, telefono, es_principal")
      .eq("cliente_id", c.id)
      .order("es_principal", { ascending: false }),
    sb
      .from("contratos_visibles")
      .select(CAMPOS_CONTRATO)
      .eq("cliente_id", c.id)
      .order("alta"),
  ]);
  if (contactos.error) throw contactos.error;
  if (contratos.error) throw contratos.error;

  const lista = (contratos.data ?? []).map((ct) => aContrato(ct as FilaContrato));
  return {
    id: c.id,
    nombre: c.nombre,
    slug: c.slug,
    sector: c.sector,
    estado: c.estado,
    razonSocial: c.razon_social,
    cif: c.cif,
    direccion: c.direccion,
    portadaUrl: c.portada_url,
    numProyectos: lista.filter((ct) => ct.estado === "activo").length,
    cuotaTotal: cuotaTotal(lista),
    contactos: (contactos.data ?? []).map((k) => ({
      id: k.id,
      nombre: k.nombre,
      rol: k.rol,
      email: k.email,
      telefono: k.telefono,
      esPrincipal: k.es_principal,
    })),
    contratos: lista,
  };
}

export type ServicioDeCliente = {
  id: string;
  nombre: string;
  tipo: string;
  proyectoNombre: string;
  proyectoSlug: string;
};

type FilaServicioCliente = {
  id: string;
  nombre: string;
  tipo: string;
  proyectos: { nombre: string; slug: string };
};

/**
 * Lo que es de ESTE cliente, para poder responder a «¿le está afectando algo
 * ahora mismo?» (§8.4 del spec).
 *
 * Solo los que tienen `cliente_id`. Un proyecto como Kairos también tiene
 * servicios de plataforma —la web, la base de datos— comunes a todos los
 * inquilinos: colarlos aquí diría que a este cliente le pasa algo que en
 * realidad no es suyo.
 *
 * No filtra por permiso a propósito: de eso se encarga RLS. Si filtrase por su
 * cuenta, un fallo de RLS pasaría desapercibido.
 */
export async function serviciosDeCliente(
  sb: Sb,
  clienteId: string
): Promise<ServicioDeCliente[]> {
  const { data, error } = await sb
    .from("servicios")
    .select("id, nombre, tipo, proyectos!inner(nombre, slug)")
    .eq("cliente_id", clienteId)
    .order("nombre");
  if (error) throw error;

  return ((data ?? []) as unknown as FilaServicioCliente[]).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    tipo: s.tipo,
    proyectoNombre: s.proyectos.nombre,
    proyectoSlug: s.proyectos.slug,
  }));
}

// ---------------------------------------------------------------------------
// Escritura. Recibe `sb` y hace todo el trabajo —validar, comprobar el rol y
// escribir— para que se pueda probar contra la base. El envoltorio de
// `acciones-clientes.ts` solo resuelve el cliente de servidor y revalida.
// ---------------------------------------------------------------------------

export type EntradaCliente = {
  nombre: string;
  slug: string;
  sector?: string | null;
  estado?: string;
  razonSocial?: string | null;
  cif?: string | null;
  direccion?: string | null;
};

export type Resultado = { ok: true; slug: string } | { ok: false; error: string };

const ESTADOS_CLIENTE = ["activo", "potencial", "pausado", "cerrado"] as const;
const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validarEntradaCliente(entrada: EntradaCliente): Resultado {
  if (entrada.nombre.trim().length === 0) {
    return { ok: false, error: "El nombre no puede estar vacío." };
  }
  if (!PATRON_SLUG.test(entrada.slug)) {
    return {
      ok: false,
      error:
        "El identificador solo admite minúsculas, números y guiones " +
        "(por ejemplo: 100-montaditos).",
    };
  }
  if (
    entrada.estado &&
    !(ESTADOS_CLIENTE as readonly string[]).includes(entrada.estado)
  ) {
    return { ok: false, error: `El estado «${entrada.estado}» no existe.` };
  }
  return { ok: true, slug: entrada.slug };
}

export async function escribirCliente(
  sb: Sb,
  entrada: EntradaCliente,
  id?: string
): Promise<Resultado> {
  const valido = validarEntradaCliente(entrada);
  if (!valido.ok) return valido;

  // RLS ya lo impediría, pero se comprueba aquí también: la red de seguridad no
  // debe ser la única defensa, y así el mensaje de error es comprensible.
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede dar de alta clientes." };
  }

  const fila = {
    nombre: entrada.nombre.trim(),
    slug: entrada.slug,
    sector: entrada.sector ?? null,
    estado: entrada.estado ?? "activo",
    razon_social: entrada.razonSocial ?? null,
    cif: entrada.cif ?? null,
    direccion: entrada.direccion ?? null,
  };

  const { error } = id
    ? await sb.from("clientes").update(fila).eq("id", id)
    : await sb.from("clientes").insert(fila);

  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          error: `Ya existe un cliente con el identificador «${entrada.slug}».`,
        }
      : { ok: false, error: error.message };
  }
  return { ok: true, slug: entrada.slug };
}
