//
// Silenciar una incidencia desde la notificación, SIN sesión.
//
// Aquí no hay usuario autenticado: se llega desde una notificación del sistema,
// a veces con la app cerrada. La firma del token es la única autorización que
// existe, y por eso caduca en 24 h y lleva dentro el id de la incidencia — que
// NO se lee de un parámetro suelto de la URL, o cualquiera podría cambiarlo.
//
import { createClient } from "@supabase/supabase-js";
import { verificar } from "@/lib/alertas/firma";

/** Lo abre un navegador, no un programa: la respuesta es una página. */
function pagina(titulo: string, detalle: string, estado: number): Response {
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · Atlas</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#050810;color:#f5f5f7;
       display:grid;place-items:center;min-height:100vh;margin:0;padding:1.5rem}
  main{max-width:26rem;text-align:center}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{color:#9b9ba3;margin:0;line-height:1.5}
</style></head>
<body><main><h1>${titulo}</h1><p>${detalle}</p></main></body></html>`,
    { status: estado, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(peticion: Request): Promise<Response> {
  const token = new URL(peticion.url).searchParams.get("t") ?? "";
  const clave = process.env.ATLAS_FIRMA_KEY ?? "";

  if (clave === "") {
    return pagina(
      "No se ha podido silenciar",
      "Atlas no tiene configurada la clave de firma (ATLAS_FIRMA_KEY).",
      500
    );
  }

  const carga = await verificar(token, clave, Date.now());
  if (!carga) {
    // 410 y no 400: el enlace existió y ya no sirve. Sin traza ni detalle de por
    // qué falló, que solo ayudaría a quien esté probando enlaces a ver.
    return pagina(
      "Este enlace ya no vale",
      "Ha caducado o no es válido. Abre Atlas y silencia la incidencia desde la ficha del proyecto.",
      410
    );
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Se pide de vuelta la fila afectada: si la incidencia ya no existe, el update
  // no falla, simplemente no toca nada, y devolver 200 sería mentir.
  const { data, error } = await sb
    .from("incidencias")
    .update({ silenciada_hasta: carga.hasta })
    .eq("id", carga.incidenciaId)
    .select("id");

  if (error) {
    return pagina("No se ha podido silenciar", error.message, 500);
  }
  if (!data || data.length === 0) {
    return pagina(
      "Esa incidencia ya no está",
      "Puede que se cerrara o se borrara mientras tanto.",
      410
    );
  }

  const cuando =
    carga.hasta === "infinity"
      ? "hasta que se resuelva"
      : `hasta las ${new Date(carga.hasta).toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        })}`;

  return pagina(
    "Silenciada",
    `No recibirás más avisos de esta incidencia ${cuando}. Se sigue vigilando y registrando igual.`,
    200
  );
}
