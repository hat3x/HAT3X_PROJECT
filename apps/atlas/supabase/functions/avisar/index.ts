//
// El que avisa. Lo despierta pg_cron cada minuto: recoge las incidencias sin
// notificar, las agrupa por proyecto, resuelve quién debe enterarse y envía.
//
// Va aparte del vigía a propósito: comprobar servicios no debe quedarse
// esperando a un servidor de correo.
//
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { agrupar, type SucesoAviso, type Aviso } from "./agrupar.ts";
import { clasificar, repartirSellos, type FilaPendiente } from "./pendientes.ts";
import { firmar } from "./firma.ts";
import { enviarCorreo, type AvisoEnviable } from "./correo.ts";
import { enviarPush } from "./push.ts";
import { pendientesDeCobro } from "./cobro.ts";
import { abiertosDemasiado } from "./fichajes.ts";

const VENTANA_MS = 2 * 60 * 1000;
const CADUCIDAD_ENLACE_MS = 24 * 60 * 60 * 1000;

type FilaIncidencia = {
  id: string;
  abierta_en: string;
  cerrada_en: string | null;
  causa: string | null;
  silenciada_hasta: string | null;
  notificada_en: string | null;
  recuperacion_notificada_en: string | null;
  servicios: {
    nombre: string;
    proyectos: { id: string; nombre: string; slug: string };
  };
};

const aPendiente = (i: FilaIncidencia): FilaPendiente => ({
  id: i.id,
  abiertaEn: i.abierta_en,
  cerradaEn: i.cerrada_en,
  notificadaEn: i.notificada_en,
  recuperacionNotificadaEn: i.recuperacion_notificada_en,
  silenciadaHasta: i.silenciada_hasta,
});

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

  // La misma función sirve a dos cadencias: las incidencias van cada minuto y
  // el cobro una vez al día, disparados por dos tareas de cron distintas. Se
  // reutiliza esta y no se escribe una nueva porque una nueva necesitaría su
  // propia copia de `push.ts` y `correo.ts`, y dos copias del envío divergen
  // siempre.
  const cuerpo = await peticion.json().catch(() => ({}));
  if (cuerpo?.cobro === true) {
    return await avisarDeCobro(sb);
  }
  if (cuerpo?.fichajes === true) {
    return await avisarDeFichajes(sb);
  }

  const ahora = new Date().toISOString();

  // Los dos sellos son el candado contra el doble envío: si pg_net reintenta,
  // la segunda invocación no encuentra nada que mandar. Se piden las filas a
  // las que les falte alguno; cuál toca lo decide `clasificar`.
  const { data, error } = await sb
    .from("incidencias")
    .select(
      `id, abierta_en, cerrada_en, causa, silenciada_hasta,
       notificada_en, recuperacion_notificada_en,
       servicios!inner(nombre, proyectos!inner(id, nombre, slug))`
    )
    .or("notificada_en.is.null,recuperacion_notificada_en.is.null")
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const candidatas = (data ?? []) as unknown as FilaIncidencia[];

  // Silenciadas: se sellan igual para que no vuelvan, pero NO se envían. Lo que
  // se calla es el aviso, nunca el registro.
  const sucesos: SucesoAviso[] = [];
  let silenciadas = 0;

  for (const i of candidatas) {
    const { tipo, sello } = clasificar(aPendiente(i), ahora);
    if (tipo === null) {
      if (sello !== null) silenciadas++;
      continue;
    }
    sucesos.push({
      incidenciaId: i.id,
      proyectoId: i.servicios.proyectos.id,
      proyectoNombre: i.servicios.proyectos.nombre,
      servicioNombre: i.servicios.nombre,
      tipo,
      abiertaEn: i.cerrada_en ?? i.abierta_en,
      causa: i.causa,
    });
  }

  const avisos = agrupar(sucesos, VENTANA_MS);
  const rutas = new Map(candidatas.map((i) => [i.id, i.servicios.proyectos.slug] as const));

  let enviadas = 0;
  for (const aviso of avisos) {
    enviadas += await repartir(sb, aviso, rutas.get(aviso.incidenciaIds[0]!) ?? "", ahora);
  }

  // Sellar SIEMPRE al final: si algo falla al enviar queda registrado en
  // `notificaciones` con su motivo, y aun así no se reintenta en bucle cada
  // minuto hasta el fin de los tiempos.
  const sellos = repartirSellos(candidatas.map(aPendiente), ahora);
  if (sellos.apertura.length > 0) {
    await sb
      .from("incidencias")
      .update({ notificada_en: ahora })
      .in("id", sellos.apertura);
  }
  if (sellos.recuperacion.length > 0) {
    await sb
      .from("incidencias")
      .update({ recuperacion_notificada_en: ahora })
      .in("id", sellos.recuperacion);
  }

  return Response.json({
    avisos: avisos.length,
    silenciadas,
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
      if (r.ok) {
        enviadas++;
        // Sin esto la columna se queda en null para siempre y no hay forma de
        // distinguir una suscripción viva de una que nunca ha recibido nada.
        await sb
          .from("suscripciones_push")
          .update({ ultima_ok_en: ahora })
          .eq("id", s.id);
      }
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
  // Un aviso de cobro no tiene incidencia: admite `null` para que esa rama
  // pueda registrar sin fingir una que no existe.
  incidenciaId: string | null,
  canal: "push" | "email",
  ok: boolean,
  error: string | null,
  // Al final y con valor por defecto para que las dos llamadas que ya
  // existían (las de incidencia, arriba) no tengan que tocarse: siguen
  // pasando sus mismos seis argumentos y siguen quedando marcadas 'incidencia'.
  tipo: "incidencia" | "cobro" | "fichaje" = "incidencia"
): Promise<void> {
  // Los fallos se registran igual que los aciertos: una suscripción caducada o
  // un canal sin configurar tienen que verse, no perderse en silencio.
  await sb.from("notificaciones").insert({
    usuario_id: usuarioId,
    incidencia_id: incidenciaId,
    canal,
    ok,
    error,
    tipo,
  });
}

/**
 * El envío a una persona por los dos canales, con su registro. Lo comparten
 * `avisarDeCobro` y `avisarDeFichajes`: las dos mandan push + correo a un
 * único destinatario y registran cada intento con `registrar`, y una segunda
 * copia de ese cuerpo en el mismo fichero habría divergido igual que si
 * viviera en dos ficheros distintos.
 *
 * `ahora` entra por parámetro y no se calcula aquí dentro a propósito: cada
 * llamante fija un único instante para todo su ciclo (el mismo que usa para
 * su propio candado), así que el sello `ultima_ok_en` de todas las
 * suscripciones tratadas en una misma invocación cae en la misma fecha, sin
 * depender de cuánto tarde la vuelta a la base entre una persona y la
 * siguiente.
 */
async function enviarA(
  sb: SupabaseClient,
  usuarioId: string,
  titulo: string,
  cuerpo: string,
  url: string,
  tipo: "cobro" | "fichaje",
  ahora: string
): Promise<number> {
  const enviable: AvisoEnviable = { titulo, cuerpo, url };

  const claves = {
    publica: Deno.env.get("VAPID_PUBLICA") ?? "",
    privada: Deno.env.get("VAPID_PRIVADA") ?? "",
    contacto: Deno.env.get("VAPID_CONTACTO") ?? "mailto:info@hat3x.com",
  };
  const apiKeyCorreo = Deno.env.get("RESEND_API_KEY") ?? "";

  let enviados = 0;

  const { data: suscripciones } = await sb
    .from("suscripciones_push")
    .select("id, endpoint, p256dh, auth")
    .eq("usuario_id", usuarioId);

  for (const s of suscripciones ?? []) {
    const r = await enviarPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      enviable,
      claves
    );
    await registrar(sb, usuarioId, null, "push", r.ok, r.error, tipo);
    if (r.ok) {
      enviados++;
      // Igual que hace `repartir` para las incidencias: sin este sello la
      // columna se queda en null para siempre y el runbook de
      // MANTENIMIENTO.md acusaría a las claves VAPID de un problema que no
      // existe.
      await sb
        .from("suscripciones_push")
        .update({ ultima_ok_en: ahora })
        .eq("id", s.id);
    }
    // Una suscripción que el navegador tiró se borra: si no, se reintentaría
    // en cada aviso, para siempre.
    if (r.caducada) await sb.from("suscripciones_push").delete().eq("id", s.id);
  }

  // El correo se intenta aunque el push haya salido: es el rastro escrito.
  const correo = await correoDe(sb, usuarioId);
  const rc = await enviarCorreo(correo, enviable, apiKeyCorreo, fetch);
  await registrar(sb, usuarioId, null, "email", rc.ok, rc.error, tipo);
  if (rc.ok) enviados++;

  return enviados;
}

/**
 * El resumen diario de cobro: qué lleva sin facturarse y qué sin cobrarse.
 *
 * No manda nada si no hay nada. Un aviso diario que llega vacío se convierte
 * en ruido, y el ruido se deja de leer — con lo que el día que sí importe
 * tampoco se leerá.
 *
 * No usa `repartir`: esa función construye un enlace firmado para silenciar
 * UNA incidencia, y un aviso de cobro no tiene incidencia que silenciar.
 * Forzar la firma habría sido más código para menos verdad; en su lugar se
 * llama a `enviarPush` y `enviarCorreo` directamente, que es lo que
 * `repartir` hace por dentro.
 */
async function avisarDeCobro(sb: SupabaseClient): Promise<Response> {
  // Un solo instante para todo el ciclo, igual que hace `repartir` con su
  // propio `ahora`: así el filtro del día y el sello de `ultima_ok_en` no
  // pueden caer en fechas distintas por una carrera contra el reloj.
  const ahora = new Date().toISOString();
  // «Hoy» se calcula en Madrid, no en UTC, igual que hace `hoyEnMadrid()` en
  // `src/lib/dinero.ts` para la pantalla. A la hora del cron coinciden, pero
  // una invocación a mano entre las 00:00 y las 02:00 de Madrid daría «ayer»
  // con el día UTC — y el día 1 eso hace desaparecer el mes recién cerrado,
  // que es justo el que hay que perseguir. Se calcula aquí y no en
  // `cobro.ts`, que tiene que seguir byte a byte igual que su original.
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(
    new Date(ahora)
  );
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;

  // Se lee la tabla `contratos`, NO la vista `contratos_visibles` que usa la
  // pantalla (`src/lib/db/cobro.ts`). La vista filtra por `auth.uid()` y solo
  // tiene `grant select` para `authenticated`; esta función entra con la
  // service_role, que no tiene ni `auth.uid()` ni ese grant, y la consulta
  // fallaba con «permission denied for view contratos_visibles». Las tablas
  // base sí las lee la service_role (lo comprueba
  // `src/tests/esquema/service-role-lee.test.ts`, que también comprueba que
  // la vista sigue vedada a ese rol). Quién llama decide qué puede leer: la
  // app entra con el JWT del propietario y debe pasar por la vista; esta
  // función entra con la service_role y debe ir a la tabla. Lo que tiene que
  // ser idéntico entre las dos consultas —y lo es— son los filtros, las
  // exclusiones, el corte del mes y el orden: la misma pregunta hecha de dos
  // formas distintas puede acabar respondiendo cosas distintas, y entonces
  // el aviso diario y la pantalla dirían números que no cuadran.
  const { data: per, error: errorPer } = await sb
    .from("periodos_contrato")
    .select(
      `contrato_id, periodo, importe_esperado,
       contratos!inner(clientes!inner(nombre))`
    )
    .is("factura_id", null)
    .lt("periodo", mesEnCurso)
    .order("periodo");

  const { data: fac, error: errorFac } = await sb
    .from("facturas")
    .select("id, serie, numero, total, fecha_vencimiento, clientes!inner(nombre)")
    .is("cobrada_en", null)
    .eq("estado", "emitida")
    .order("fecha_vencimiento");

  // Mismo criterio que el candado del día, más abajo: si una lectura falla,
  // no se envía nada y la respuesta lo dice. Un permiso denegado o un corte
  // de red que se leyera como lista vacía se convertiría en «nada pendiente»
  // — el peor fallo posible, porque nadie lo nota: el aviso no llega y el
  // silencio se parece exactamente a un día sin deudas.
  if (errorPer || errorFac) {
    return new Response(
      JSON.stringify({ error: (errorPer ?? errorFac)!.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // PostgREST devuelve cada relación como objeto o como array según la
  // cardinalidad que infiera. Se normaliza en un solo sitio, igual que en
  // `src/lib/db/cobro.ts`.
  const uno = (u: unknown) => (Array.isArray(u) ? u[0] : u);

  const cobro = pendientesDeCobro(
    (per ?? []).map((p) => ({
      contratoId: p.contrato_id,
      clienteNombre: uno(uno(p.contratos).clientes).nombre,
      periodo: p.periodo,
      // Ningún float toca un importe: el numeric(12,2) de Postgres se
      // convierte a céntimos enteros aquí, una sola vez, al leerlo.
      importeEsperadoCentimos: Math.round(Number(p.importe_esperado) * 100),
    })),
    (fac ?? []).map((f) => ({
      id: f.id,
      serie: f.serie,
      numero: f.numero,
      clienteNombre: uno(f.clientes).nombre,
      totalCentimos: Math.round(Number(f.total) * 100),
      fechaVencimiento: f.fecha_vencimiento,
    })),
    hoy
  );

  if (!cobro.hayAlgo) {
    return new Response(JSON.stringify({ enviados: 0, motivo: "nada pendiente" }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Solo la url hace falta aquí: `enviarA` arma su propio `AvisoEnviable`
  // con `titulo`/`cuerpo`/`url` a partir de sus parámetros, así que guardar
  // los tres en un objeto aparte para leer luego un único campo sería
  // repetir sin necesidad lo que ya tienen `cobro.titulo` y `cobro.cuerpo`.
  // Abre la pantalla que enseña esto mismo con detalle, no la raíz.
  const url = `${Deno.env.get("ATLAS_URL_PUBLICA") ?? "http://localhost:3010"}/dinero/cobro`;

  const { data: perfiles, error: errorPerfiles } = await sb
    .from("perfiles")
    .select("id")
    .eq("es_propietario", true);
  // Igual que arriba: sin la lista de destinatarios no se puede fingir que
  // se avisó, ni callar que no se pudo saber a quién.
  if (errorPerfiles) {
    return new Response(JSON.stringify({ error: errorPerfiles.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let enviados = 0;
  // Propietarios para los que el candado del día no se pudo comprobar: se
  // cuentan aparte, no se confunden con "ya avisado" ni con "nada pendiente".
  const noComprobados: string[] = [];
  for (const p of perfiles ?? []) {
    // El candado del día. Si el cron se dispara dos veces, el segundo no manda
    // nada: un aviso repetido enseña que el sistema no se controla a sí mismo.
    // Escrita así (usuario_id + tipo='cobro' + enviada_en), la consulta encaja
    // exactamente con el índice parcial `notificaciones_cobro_del_dia`.
    const { data: yaHoy, error: errorYaHoy } = await sb
      .from("notificaciones")
      .select("id")
      .eq("usuario_id", p.id)
      .eq("tipo", "cobro")
      .gte("enviada_en", `${hoy}T00:00:00Z`)
      .limit(1);
    // Fallar cerrado, no abierto: si esta consulta se cae no hay forma de
    // saber si ya se avisó hoy, y enviar de todos modos convertiría el
    // candado en decorativo justo el día en que hace falta. Y el fallo se
    // cuenta en la respuesta en vez de callarse, porque un candado roto en
    // silencio se lee igual que un día sin nada pendiente.
    if (errorYaHoy) {
      noComprobados.push(p.id);
      continue;
    }
    if (yaHoy && yaHoy.length > 0) continue;

    enviados += await enviarA(sb, p.id, cobro.titulo, cobro.cuerpo, url, "cobro", ahora);
  }

  return new Response(JSON.stringify({ enviados, noComprobados }), {
    headers: { "content-type": "application/json" },
  });
}

/**
 * El aviso del fichaje que se dejó abierto. Cada hora se mira qué lleva
 * abierto más de AVISO_HORAS y se avisa a su dueño —a él, no al propietario:
 * es su olvido y es él quien puede cerrarlo.
 *
 * Lee TABLAS: la service_role no tiene `auth.uid()` y las vistas filtradas
 * la rechazan (lección del cobro).
 */
async function avisarDeFichajes(sb: SupabaseClient): Promise<Response> {
  const ahora = Date.now();
  const ahoraIso = new Date(ahora).toISOString();

  const { data: abiertos, error: errorAbiertos } = await sb
    .from("fichajes")
    .select("id, usuario_id, inicio, proyectos(nombre), clientes(nombre)")
    .is("fin", null);
  if (errorAbiertos) {
    // Un permiso denegado disfrazado de «nada abierto» sería invisible.
    return new Response(JSON.stringify({ error: errorAbiertos.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const uno = (u: unknown) => (Array.isArray(u) ? u[0] : u);
  const avisos = abiertosDemasiado(
    (abiertos ?? []).map((f) => ({
      id: f.id,
      usuarioId: f.usuario_id,
      inicio: f.inicio,
      proyectoNombre: uno(f.proyectos)?.nombre ?? null,
      clienteNombre: uno(f.clientes)?.nombre ?? null,
    })),
    ahora
  );

  if (avisos.length === 0) {
    return new Response(JSON.stringify({ enviados: 0, motivo: "nada abierto de más" }), {
      headers: { "content-type": "application/json" },
    });
  }

  // id → inicio. Un `abiertos!.find(...)!.inicio` dentro del bucle mentiría
  // sobre lo que el compilador puede garantizar: nada asegura que ESE id siga
  // en el array (y de hecho no hace falta que lo compruebe, porque `avisos`
  // sale de mapear el propio `abiertos`). Un mapa hecho una vez, antes del
  // bucle, dice lo mismo sin el `!`.
  const inicioPorFichaje = new Map((abiertos ?? []).map((f) => [f.id, f.inicio] as const));

  let enviados = 0;
  const noComprobados: string[] = [];
  for (const a of avisos) {
    const inicio = inicioPorFichaje.get(a.fichajeId)!;
    // El candado: un aviso por fichaje, no uno por hora. Si ya hay un aviso
    // de fichaje a esta persona POSTERIOR al inicio del fichaje, es de este
    // mismo, y no se repite. Falla cerrado: si no se puede comprobar, no se
    // manda, y se cuenta.
    //
    // El candado no filtra por `ok`: una fila de `notificaciones` con
    // ok=false también lo cierra. Si el push Y el correo de un fichaje
    // fallan los dos, ese fichaje no se reintenta en la siguiente hora.
    // Mismo criterio que `avisarDeCobro`, y aceptado por el mismo motivo: lo
    // cubre el runbook semanal de mirar `notificaciones` por `ok = false`
    // (ver «Tareas periódicas» en MANTENIMIENTO.md).
    const { data: ya, error: errorYa } = await sb
      .from("notificaciones")
      .select("id")
      .eq("usuario_id", a.usuarioId)
      .eq("tipo", "fichaje")
      .gte("enviada_en", inicio)
      .limit(1);
    if (errorYa) {
      noComprobados.push(a.usuarioId);
      continue;
    }
    if (ya && ya.length > 0) continue;

    const url = `${Deno.env.get("ATLAS_URL_PUBLICA") ?? "http://localhost:3010"}/dinero/horas`;
    enviados += await enviarA(sb, a.usuarioId, a.titulo, a.cuerpo, url, "fichaje", ahoraIso);
  }

  return new Response(JSON.stringify({ enviados, noComprobados }), {
    headers: { "content-type": "application/json" },
  });
}
