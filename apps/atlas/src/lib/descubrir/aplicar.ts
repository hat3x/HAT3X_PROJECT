import type { Sb } from "../db/clientes";
import { esDemo, type Plan, type ServicioLocal } from "./tenants";

//
// Aplica sobre la base lo que decidió `reconciliar`.
//
// Nada de esto BORRA: un tenant que sale del censo se pausa, y su historial de
// incidencias y de uptime sigue ahí. Si vuelve, se reactiva el mismo check y la
// serie continúa donde estaba, en vez de empezar de cero.
//

/** De dónde cuelga la reserva pública de cada salón. */
export const BASE_RESERVAS = "https://kairosmanager.app/api/public/booking";

export type Aplicado = { altas: number; pausados: number; reactivados: number };

type FilaCheck = { id: string; url: string; activo: boolean };

/**
 * Qué tenants se están vigilando ya, sacando el slug de la propia URL del check.
 *
 * Se reconocen por la URL y no por una marca propia a propósito: así los checks
 * que se crearon a mano —antes de que existiera esto— cuentan igual, y el
 * descubridor no los duplica en su primera pasada.
 */
export async function vigilados(sb: Sb, proyectoId: string): Promise<ServicioLocal[]> {
  const { data, error } = await sb
    .from("checks")
    .select("id, url, activo, servicios!inner(proyecto_id)")
    .eq("servicios.proyecto_id", proyectoId)
    .like("url", `${BASE_RESERVAS}/%`);
  if (error) throw error;

  return ((data ?? []) as unknown as FilaCheck[]).map((c) => ({
    id: c.id,
    slug: c.url.slice(BASE_RESERVAS.length + 1),
    activo: c.activo,
  }));
}

export async function aplicarPlan(
  sb: Sb,
  proyectoId: string,
  plan: Plan
): Promise<Aplicado> {
  for (const t of plan.alta) {
    const { data: servicio, error: eS } = await sb
      .from("servicios")
      .insert({
        proyecto_id: proyectoId,
        nombre: `Reservas — ${t.nombre}`,
        tipo: "api",
        proveedor: "Vercel",
      })
      .select("id")
      .single();
    if (eS) throw eS;

    const { error: eC } = await sb.from("checks").insert({
      servicio_id: servicio.id,
      tipo: "http",
      url: `${BASE_RESERVAS}/${t.slug}`,
      espera_status: [200],
      // Sin esto, un 200 con el cuerpo vacío contaría como bueno. La respuesta
      // lleva el slug dentro, así que exigirlo comprueba que contestó ESE salón.
      espera_texto: t.slug,
      timeout_ms: 15000,
      intervalo_s: 300,
      // Las demos se vigilan, pero no despiertan a nadie de madrugada.
      notifica: !esDemo(t.slug),
    });
    if (eC) throw eC;
  }

  const pausar = plan.pausar.map((s) => s.id);
  if (pausar.length > 0) {
    const { error } = await sb.from("checks").update({ activo: false }).in("id", pausar);
    if (error) throw error;
  }

  const reactivar = plan.reactivar.map((s) => s.id);
  if (reactivar.length > 0) {
    const { error } = await sb.from("checks").update({ activo: true }).in("id", reactivar);
    if (error) throw error;
  }

  return {
    altas: plan.alta.length,
    pausados: plan.pausar.length,
    reactivados: plan.reactivar.length,
  };
}
