import type { TenantRemoto } from "./tenants";

//
// Lee el censo de salones activos de Kairos, vía la RPC `atlas_list_salons`.
//
// `hacerFetch` entra por parámetro para poder probar esto sin red, igual que en
// el envío de correo. La clave llega ya descifrada del llavero: aquí no se
// descifra nada ni se guarda.
//

export type Censo =
  | { ok: true; tenants: TenantRemoto[] }
  | { ok: false; error: string };

type FilaCenso = { slug: string; name: string; sector: string };

/**
 * Comprueba la forma antes de creérsela.
 *
 * Un proxy que devuelve HTML de error, o una RPC que cambia de contrato, darían
 * algo que no es una lista de salones. Tragárselo como censo vacío sería peor
 * que fallar: el reconciliador se fía de que un censo vacío significa «no toques
 * nada», y esa confianza solo vale si un censo vacío es de verdad un censo.
 */
function esCenso(dato: unknown): dato is FilaCenso[] {
  return (
    Array.isArray(dato) &&
    dato.every(
      (f) =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as FilaCenso).slug === "string" &&
        (f as FilaCenso).slug !== "" &&
        typeof (f as FilaCenso).name === "string" &&
        typeof (f as FilaCenso).sector === "string"
    )
  );
}

export async function leerCenso(
  urlSupabase: string,
  serviceRole: string,
  hacerFetch: typeof fetch
): Promise<Censo> {
  if (!urlSupabase || !serviceRole) {
    return { ok: false, error: "Falta la URL de Kairos o su clave de servicio." };
  }

  try {
    const respuesta = await hacerFetch(`${urlSupabase}/rest/v1/rpc/atlas_list_salons`, {
      method: "POST",
      headers: {
        // PostgREST pide las dos: `apikey` identifica el proyecto y
        // `Authorization` el rol.
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    if (!respuesta.ok) {
      // El 404 es el estado de hoy —la RPC aún no está desplegada— y tiene que
      // distinguirse de «no hay tenants»: uno es un fallo y el otro es un dato.
      return {
        ok: false,
        error: `Kairos respondió ${respuesta.status} a atlas_list_salons.`,
      };
    }

    const dato: unknown = await respuesta.json();
    if (!esCenso(dato)) {
      return { ok: false, error: "La respuesta no es una lista de salones." };
    }

    return {
      ok: true,
      tenants: dato.map((f) => ({ slug: f.slug, nombre: f.name, sector: f.sector })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
