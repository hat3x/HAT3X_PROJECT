import type { EstadoCheck } from "@/lib/incidencias/maquina";
import { calcularUptime } from "@/lib/uptime/calcular";
import type { Sb } from "./clientes";

// Cuanto mayor el número, peor. `desconocido` está por encima de `ok` porque
// «no lo sé» es peor noticia que «va bien», pero por debajo de los problemas
// confirmados: un check sin datos no debe rebajar un servicio que sabemos caído.
const GRAVEDAD: Record<EstadoCheck, number> = {
  ok: 0,
  desconocido: 1,
  degradado: 2,
  caido: 3,
};

export function peorEstado(estados: EstadoCheck[]): EstadoCheck {
  if (estados.length === 0) return "desconocido";
  return estados.reduce((peor, actual) =>
    GRAVEDAD[actual] > GRAVEDAD[peor] ? actual : peor
  );
}

export type EstadoDeCheck = {
  estado: EstadoCheck;
  uptime: number | null;
  ultimoError: string | null;
};

export type ResumenEstado = {
  estado: EstadoCheck;
  uptime30d: number | null;
  ultimoError: string | null;
};

export function resumirServicio(checks: EstadoDeCheck[]): ResumenEstado {
  const estado = peorEstado(checks.map((c) => c.estado));

  const conDatos = checks.filter((c) => c.uptime !== null);
  const uptime30d =
    conDatos.length === 0
      ? null
      : Math.round(
          (conDatos.reduce((suma, c) => suma + (c.uptime ?? 0), 0) / conDatos.length) * 10
        ) / 10;

  // El error sale del check que está peor. Enseñar el de otro que va bien sería
  // señalar al culpable equivocado.
  const culpable = checks.find((c) => c.estado === estado && c.ultimoError !== null);

  return { estado, uptime30d, ultimoError: culpable?.ultimoError ?? null };
}

const DIAS_VENTANA = 30;

/**
 * Estado y uptime de 30 días de cada servicio, en cuatro consultas en paralelo
 * en lugar de una por servicio. Solo lee.
 *
 * El error visible sale de la incidencia abierta y no del último resultado
 * fallido: es la respuesta a «¿por qué está caído AHORA?», que es lo que se
 * pregunta quien mira la pantalla.
 */
export async function estadoDeServicios(
  sb: Sb,
  serviciosIds: string[]
): Promise<Map<string, ResumenEstado>> {
  const vacio = new Map<string, ResumenEstado>();
  if (serviciosIds.length === 0) return vacio;

  const { data: checks, error } = await sb
    .from("checks")
    .select("id, servicio_id, estado")
    .in("servicio_id", serviciosIds);
  if (error) throw error;

  const idsCheck = (checks ?? []).map((c) => c.id);
  if (idsCheck.length === 0) return vacio;

  const desde = new Date(Date.now() - DIAS_VENTANA * 24 * 3600 * 1000).toISOString();

  const [detalle, agregados, incidencias] = await Promise.all([
    sb
      .from("check_resultados")
      .select("check_id, ok")
      .in("check_id", idsCheck)
      .gte("ts", desde),
    sb
      .from("check_agregados")
      .select("check_id, total, ok")
      .in("check_id", idsCheck)
      .gte("bucket", desde),
    sb
      .from("incidencias")
      .select("check_id, ultimo_error")
      .in("check_id", idsCheck)
      .is("cerrada_en", null),
  ]);
  if (detalle.error) throw detalle.error;
  if (agregados.error) throw agregados.error;
  if (incidencias.error) throw incidencias.error;

  const porServicio = new Map<string, EstadoDeCheck[]>();

  for (const c of checks ?? []) {
    const muestras = (detalle.data ?? [])
      .filter((r) => r.check_id === c.id)
      .map((r) => ({ ok: r.ok }));
    const suma = (agregados.data ?? [])
      .filter((a) => a.check_id === c.id)
      .map((a) => ({ total: a.total, ok: a.ok }));
    const incidencia = (incidencias.data ?? []).find((i) => i.check_id === c.id);

    const lista = porServicio.get(c.servicio_id) ?? [];
    lista.push({
      estado: c.estado as EstadoCheck,
      uptime: calcularUptime(muestras, suma),
      ultimoError: incidencia?.ultimo_error ?? null,
    });
    porServicio.set(c.servicio_id, lista);
  }

  const resumen = new Map<string, ResumenEstado>();
  for (const [servicioId, lista] of porServicio) {
    resumen.set(servicioId, resumirServicio(lista));
  }
  return resumen;
}
