import type { Sb } from "../db/clientes";
import type { ResultadoAjustes } from "./ejecutar";

//
// Dónde está escrito cómo hablar con Kairos.
//
// Nada de esto vive en variables de entorno a propósito. El proyecto, su
// Supabase y su clave de servicio ya son datos de Atlas —están en la ficha del
// proyecto y en el llavero—, y duplicarlos en el entorno de Vercel crearía una
// segunda verdad que se desincroniza el día que Kairos rote la clave.
//
// El precio es que hay tres cosas que crear a mano la primera vez. Por eso cada
// fallo dice exactamente cuál falta y dónde ponerla: un `undefined` leído de
// `process.env` no explica nada, y esto se mira una vez al año.
//

/** El proyecto de Atlas que representa a Kairos. */
export const SLUG_KAIROS = "kairos";
/** En la ficha del proyecto: enlace de este tipo → el Supabase de Kairos. */
export const TIPO_ENLACE_CENSO = "supabase";
/** En el llavero: proveedor y etiqueta de la clave que abre la RPC del censo. */
export const PROVEEDOR_CENSO = "Supabase";
export const ETIQUETA_CENSO = "service_role";

export async function ajustesDeKairos(sb: Sb): Promise<ResultadoAjustes> {
  const { data: proyecto, error: eP } = await sb
    .from("proyectos")
    .select("id")
    .eq("slug", SLUG_KAIROS)
    .maybeSingle();
  if (eP) throw eP;
  if (!proyecto) {
    return {
      ok: false,
      error: `No hay ningún proyecto con slug «${SLUG_KAIROS}». Créalo en Atlas: de él cuelgan los checks de cada salón.`,
    };
  }

  const { data: enlace, error: eE } = await sb
    .from("enlaces")
    .select("url")
    .eq("proyecto_id", proyecto.id)
    .eq("tipo", TIPO_ENLACE_CENSO)
    .maybeSingle();
  if (eE) throw eE;
  if (!enlace) {
    return {
      ok: false,
      error: `El proyecto «${SLUG_KAIROS}» no tiene ningún enlace de tipo «${TIPO_ENLACE_CENSO}». Añade la URL de su Supabase en la ficha del proyecto.`,
    };
  }

  // Atada al proyecto, no global: una credencial suelta con la misma etiqueta
  // sería la clave de otro Supabase, y contra la RPC del censo daría un 404 que
  // se lee como fallo de red cuando en realidad es de configuración.
  const { data: credencial, error: eC } = await sb
    .from("credenciales")
    .select("id")
    .eq("proyecto_id", proyecto.id)
    .eq("proveedor", PROVEEDOR_CENSO)
    .eq("etiqueta", ETIQUETA_CENSO)
    .maybeSingle();
  if (eC) throw eC;
  if (!credencial) {
    return {
      ok: false,
      error: `No hay en el llavero una credencial «${PROVEEDOR_CENSO} / ${ETIQUETA_CENSO}» del proyecto «${SLUG_KAIROS}». Guarda ahí la clave de servicio de su Supabase.`,
    };
  }

  return {
    ok: true,
    ajustes: {
      proyectoId: proyecto.id,
      urlSupabase: enlace.url,
      credencialId: credencial.id,
    },
  };
}
