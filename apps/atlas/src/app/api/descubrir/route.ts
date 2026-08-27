//
// La pasada del descubridor de tenants de Kairos. La despierta pg_cron cada
// hora a través de pg_net (ver `20260826100000_descubridor.sql`).
//
// Vive aquí y no en una Edge Function porque descifra la clave de servicio de
// Kairos, y `usarCredencial` ya deja rastro de cada apertura en
// `credencial_usos`. En Deno habría que reimplementar el cifrado y ese registro.
//
// Esta ruta es cableado: quién decide qué está en `lib/descubrir/ejecutar.ts`.
//
import { createClient } from "@supabase/supabase-js";
import { ajustesDeKairos } from "@/lib/descubrir/ajustes";
import { aplicarPlan, vigilados } from "@/lib/descubrir/aplicar";
import { descubrir, type Resultado } from "@/lib/descubrir/ejecutar";
import { leerCenso } from "@/lib/descubrir/kairos";
import { usarCredencial } from "@/lib/db/credenciales";
import type { Database } from "@/types/supabase";

/** Lo que queda escrito en `credencial_usos` cada vez que se abre la clave. */
const CONTEXTO = "descubridor de tenants de Kairos";

function json(cuerpo: unknown, estado: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(peticion: Request): Promise<Response> {
  const clave = process.env.ATLAS_CRON_KEY ?? "";
  if (clave === "") {
    return json(
      {
        ok: false,
        error:
          "Atlas no tiene configurada ATLAS_CRON_KEY; nadie puede disparar el descubridor.",
      },
      500
    );
  }

  // Quien llegue con esta clave puede dar de alta y pausar la vigilancia de
  // cualquier cliente. Se comprueba antes de tocar nada y no deja registro: un
  // intento fallido no es una pasada del descubridor.
  if (peticion.headers.get("Authorization") !== `Bearer ${clave}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const sb = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const resultado: Resultado = await descubrir({
    ajustes: () => ajustesDeKairos(sb),
    abrirCredencial: (id) => usarCredencial(sb, id, CONTEXTO),
    // `fetch` se resuelve al llamar, no al cargar el módulo: así la prueba puede
    // sustituirlo sin que la ruta sepa que la están observando.
    leerCenso: (url, secreto) => leerCenso(url, secreto, fetch),
    vigilados: (proyectoId) => vigilados(sb, proyectoId),
    aplicar: (proyectoId, plan) => aplicarPlan(sb, proyectoId, plan),
  });

  // Se anota SIEMPRE, salga bien o mal. Sin esto, un descubridor que lleva
  // semanas fallando no se nota: pg_net recibe el 500 y no se lo cuenta a nadie.
  const { error: eRegistro } = await sb.from("descubrimientos").insert(
    resultado.ok
      ? {
          ok: true,
          altas: resultado.altas,
          pausados: resultado.pausados,
          reactivados: resultado.reactivados,
        }
      : { ok: false, error: resultado.error }
  );

  if (eRegistro) {
    // La reconciliación pudo salir bien, pero si no queda escrita nadie se
    // enterará de la siguiente que salga mal. Cuenta como fallo de la pasada.
    return json(
      {
        ...resultado,
        error: `No se pudo registrar la pasada: ${eRegistro.message}`,
      },
      500
    );
  }

  return json(resultado, resultado.ok ? 200 : 500);
}
