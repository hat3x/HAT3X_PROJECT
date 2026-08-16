import type { EstadoCheck } from "@/lib/incidencias/maquina";
import type { Sb } from "./clientes";
import { listarProyectos, type ProyectoResumen } from "./proyectos";
import { estadoDeServicios } from "./servicios-estado";

export type FilaResumen = {
  proyecto: ProyectoResumen;
  estado: EstadoCheck;
  serviciosOk: number;
  serviciosTotal: number;
  uptime30d: number | null;
  peorError: string | null;
  /** Solo la ve el propietario. null para los demás, y también si no hay. */
  cuota: number | null;
};

export type Contadores = {
  proyectos: number;
  ok: number;
  degradados: number;
  caidos: number;
  desconocidos: number;
  uptimeMedio: number | null;
};

// Mismo orden de gravedad que en `servicios-estado.ts`, pero al revés: aquí el
// 0 va primero al ordenar. «No lo sé» es peor noticia que «va bien», y mejor
// que un problema confirmado.
const GRAVEDAD: Record<EstadoCheck, number> = {
  caido: 0,
  degradado: 1,
  desconocido: 2,
  ok: 3,
};

/**
 * Lo roto arriba. Es la única razón de que la portada sirva de un vistazo: si
 * hay que buscar el problema entre doce tarjetas, ya has perdido.
 *
 * Devuelve una lista nueva; la original se sigue usando para los contadores.
 */
export function ordenarPorGravedad(filas: FilaResumen[]): FilaResumen[] {
  return [...filas].sort((a, b) => {
    const porEstado = GRAVEDAD[a.estado] - GRAVEDAD[b.estado];
    if (porEstado !== 0) return porEstado;
    // `localeCompare` en español: ignora mayúsculas y tildes al ordenar.
    return a.proyecto.nombre.localeCompare(b.proyecto.nombre, "es", {
      sensitivity: "base",
    });
  });
}

export function contarEstados(filas: FilaResumen[]): Contadores {
  const conDatos = filas.filter((f) => f.uptime30d !== null);
  const uptimeMedio =
    conDatos.length === 0
      ? null
      : Math.round(
          (conDatos.reduce((suma, f) => suma + (f.uptime30d ?? 0), 0) /
            conDatos.length) *
            10
        ) / 10;

  return {
    proyectos: filas.length,
    ok: filas.filter((f) => f.estado === "ok").length,
    degradados: filas.filter((f) => f.estado === "degradado").length,
    caidos: filas.filter((f) => f.estado === "caido").length,
    desconocidos: filas.filter((f) => f.estado === "desconocido").length,
    uptimeMedio,
  };
}

function peorDe(estados: EstadoCheck[]): EstadoCheck {
  return estados.reduce((peor, actual) =>
    GRAVEDAD[actual] < GRAVEDAD[peor] ? actual : peor
  );
}

/**
 * Todo lo que la portada necesita, en cuatro consultas y no una por proyecto.
 *
 * `verImportes` se resuelve en la página, en servidor: un componente cliente no
 * puede decidir si eres propietario.
 */
export async function cargarResumen(
  sb: Sb,
  verImportes: boolean
): Promise<{ filas: FilaResumen[]; contadores: Contadores }> {
  const proyectos = await listarProyectos(sb);
  if (proyectos.length === 0) {
    return { filas: [], contadores: contarEstados([]) };
  }

  const { data: servicios, error } = await sb
    .from("servicios")
    .select("id, proyecto_id")
    .in(
      "proyecto_id",
      proyectos.map((p) => p.id)
    );
  if (error) throw error;

  const estados = await estadoDeServicios(
    sb,
    (servicios ?? []).map((s) => s.id)
  );

  // Siempre de la vista, nunca de la tabla `contratos`. Ver lib/db/README.md.
  const cuotas = new Map<string, number>();
  if (verImportes) {
    const { data, error: errC } = await sb
      .from("contratos_visibles")
      .select("proyecto_id, cuota_mensual, estado");
    if (errC) throw errC;
    for (const ct of data ?? []) {
      if (ct.estado !== "activo" || ct.cuota_mensual === null) continue;
      if (ct.proyecto_id === null) continue;
      cuotas.set(
        ct.proyecto_id,
        (cuotas.get(ct.proyecto_id) ?? 0) + Number(ct.cuota_mensual)
      );
    }
  }

  const filas: FilaResumen[] = proyectos.map((p) => {
    const suyos = (servicios ?? []).filter((s) => s.proyecto_id === p.id);
    const resumenes = suyos
      .map((s) => estados.get(s.id))
      .filter((r) => r !== undefined);

    // Sin servicios vigilados no se inventa un estado: es «desconocido».
    const estado =
      resumenes.length === 0 ? "desconocido" : peorDe(resumenes.map((r) => r.estado));

    const conUptime = resumenes.filter((r) => r.uptime30d !== null);
    const uptime30d =
      conUptime.length === 0
        ? null
        : Math.round(
            (conUptime.reduce((s, r) => s + (r.uptime30d ?? 0), 0) / conUptime.length) *
              10
          ) / 10;

    return {
      proyecto: p,
      estado,
      serviciosOk: resumenes.filter((r) => r.estado === "ok").length,
      serviciosTotal: suyos.length,
      uptime30d,
      // El error del servicio que está peor, no el de otro que va bien.
      peorError:
        resumenes.find((r) => r.estado === estado && r.ultimoError)?.ultimoError ?? null,
      cuota: cuotas.get(p.id) ?? null,
    };
  });

  return { filas, contadores: contarEstados(filas) };
}
