import type { Sb } from "./clientes";

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
