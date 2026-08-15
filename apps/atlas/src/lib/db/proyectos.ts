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
