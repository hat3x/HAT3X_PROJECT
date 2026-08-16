//
// El que avisa. Lo despierta pg_cron cada minuto: recoge las incidencias sin
// notificar, las agrupa por proyecto, resuelve quién debe enterarse y envía.
//
// Va aparte del vigía a propósito: comprobar servicios no debe quedarse
// esperando a un servidor de correo.
//
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { agrupar, type SucesoAviso, type Aviso } from "./agrupar.ts";
import { firmar } from "./firma.ts";
import { enviarCorreo, type AvisoEnviable } from "./correo.ts";
import { enviarPush } from "./push.ts";

const VENTANA_MS = 2 * 60 * 1000;
const CADUCIDAD_ENLACE_MS = 24 * 60 * 60 * 1000;

type FilaIncidencia = {
  id: string;
  abierta_en: string;
  cerrada_en: string | null;
  causa: string | null;
  silenciada_hasta: string | null;
  servicios: {
    nombre: string;
    proyectos: { id: string; nombre: string; slug: string };
  };
};

Deno.serve(async (peticion: Request) => {
  const autorizacion = peticion.headers.get("Authorization");
  if (autorizacion !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const ahora = new Date().toISOString();

  // `notificada_en` es el candado contra el doble envío: si pg_net reintenta, la
  // segunda invocación no encuentra nada que mandar.
  const { data, error } = await sb
    .from("incidencias")
    .select(
      `id, abierta_en, cerrada_en, causa, silenciada_hasta,
       servicios!inner(nombre, proyectos!inner(id, nombre, slug))`
    )
    .is("notificada_en", null)
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const pendientes = (data ?? []) as unknown as FilaIncidencia[];

  // Silenciadas: se sellan igual para que no vuelvan, pero NO se envían. Lo que
  // se calla es el aviso, nunca el registro.
  const enviables = pendientes.filter(
    (i) => !i.silenciada_hasta || i.silenciada_hasta <= ahora
  );

  const sucesos: SucesoAviso[] = enviables.map((i) => ({
    incidenciaId: i.id,
    proyectoId: i.servicios.proyectos.id,
    proyectoNombre: i.servicios.proyectos.nombre,
    servicioNombre: i.servicios.nombre,
    tipo: i.cerrada_en ? "recuperacion" : "apertura",
    abiertaEn: i.cerrada_en ?? i.abierta_en,
    causa: i.causa,
  }));

  const avisos = agrupar(sucesos, VENTANA_MS);
  const rutas = new Map(enviables.map((i) => [i.id, i.servicios.proyectos.slug] as const));

  let enviadas = 0;
  for (const aviso of avisos) {
    enviadas += await repartir(sb, aviso, rutas.get(aviso.incidenciaIds[0]!) ?? "", ahora);
  }

  const ids = pendientes.map((i) => i.id);
  if (ids.length > 0) {
    await sb.from("incidencias").update({ notificada_en: ahora }).in("id", ids);
  }

  return Response.json({
    avisos: avisos.length,
    silenciadas: pendientes.length - enviables.length,
    notificaciones: enviadas,
  });
});

/** Resuelve destinatarios, envía por los dos canales y registra cada intento. */
async function repartir(
  sb: SupabaseClient,
  aviso: Aviso,
  slugProyecto: string,
  ahora: string
): Promise<number> {
  const base = Deno.env.get("ATLAS_URL_PUBLICA") ?? "http://localhost:3010";
  const claveFirma = Deno.env.get("ATLAS_FIRMA_KEY") ?? "";

  // El enlace de silenciar va firmado porque se pulsa sin sesión, desde una
  // notificación del sistema. Caduca en 24 h.
  const token =
    claveFirma === ""
      ? ""
      : await firmar(
          {
            incidenciaId: aviso.incidenciaIds[0]!,
            hasta: new Date(Date.parse(ahora) + 60 * 60 * 1000).toISOString(),
            expira: Date.parse(ahora) + CADUCIDAD_ENLACE_MS,
          },
          claveFirma
        );

  const enviable: AvisoEnviable = {
    titulo: aviso.titulo,
    cuerpo: aviso.cuerpo,
    url: `${base}/proyectos/${slugProyecto}${token ? `?silenciar=${token}` : ""}`,
  };

  const [{ data: personas }, { data: suscripciones }] = await Promise.all([
    sb.from("perfiles").select("id, es_propietario, permisos(proyecto_id)"),
    sb.from("suscripciones_push").select("id, usuario_id, endpoint, p256dh, auth"),
  ]);

  const destinatarios = (personas ?? [])
    .filter(
      (p) =>
        p.es_propietario ||
        (p.permisos ?? []).some(
          (q: { proyecto_id: string }) => q.proyecto_id === aviso.proyectoId
        )
    )
    .map((p) => p.id as string);

  const claves = {
    publica: Deno.env.get("VAPID_PUBLICA") ?? "",
    privada: Deno.env.get("VAPID_PRIVADA") ?? "",
    contacto: Deno.env.get("VAPID_CONTACTO") ?? "mailto:info@hat3x.com",
  };
  const apiKeyCorreo = Deno.env.get("RESEND_API_KEY") ?? "";

  let enviadas = 0;

  for (const usuarioId of destinatarios) {
    const suyas = (suscripciones ?? []).filter((s) => s.usuario_id === usuarioId);

    for (const s of suyas) {
      const r = await enviarPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        enviable,
        claves
      );
      await registrar(sb, usuarioId, aviso.incidenciaIds[0]!, "push", r.ok, r.error);
      if (r.ok) enviadas++;
      // Una suscripción que el navegador tiró se borra: si no, se reintentaría
      // en cada aviso, para siempre.
      if (r.caducada) await sb.from("suscripciones_push").delete().eq("id", s.id);
    }

    // El correo se intenta aunque el push haya salido: es el rastro escrito.
    const correo = await correoDe(sb, usuarioId);
    const rc = await enviarCorreo(correo, enviable, apiKeyCorreo, fetch);
    await registrar(sb, usuarioId, aviso.incidenciaIds[0]!, "email", rc.ok, rc.error);
    if (rc.ok) enviadas++;
  }

  return enviadas;
}

/** El correo vive en auth.users, al que solo llega la service_role key. */
async function correoDe(sb: SupabaseClient, usuarioId: string): Promise<string> {
  const { data } = await sb.auth.admin.getUserById(usuarioId);
  return data?.user?.email ?? "";
}

async function registrar(
  sb: SupabaseClient,
  usuarioId: string,
  incidenciaId: string,
  canal: "push" | "email",
  ok: boolean,
  error: string | null
): Promise<void> {
  // Los fallos se registran igual que los aciertos: una suscripción caducada o
  // un canal sin configurar tienen que verse, no perderse en silencio.
  await sb.from("notificaciones").insert({
    usuario_id: usuarioId,
    incidencia_id: incidenciaId,
    canal,
    ok,
    error,
  });
}
