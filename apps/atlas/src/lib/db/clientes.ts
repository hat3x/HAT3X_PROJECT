import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

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
