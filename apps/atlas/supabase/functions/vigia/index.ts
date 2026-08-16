//
// El vigía. Lo despierta pg_cron cada minuto a través de pg_net, coge los
// checks que ya tocan y los comprueba en paralelo.
//
// Corre sobre Deno: imports por JSR o URL, variables por Deno.env, y nada de
// módulos de Node.
//
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { comprobar, type DefinicionCheck } from "./comprobar.ts";
import { transicion, type EstadoCheck } from "./maquina.ts";

const TAMANO_LOTE = 50;

/**
 * La fila tal y como llega de la consulta. Se declara explícitamente en vez de
 * usar `any`: es el único sitio donde los nombres de columna en snake_case se
 * cruzan con el resto del código, y equivocarse aquí no lo detecta nadie.
 */
type FilaCheck = {
  id: string;
  servicio_id: string;
  tipo: DefinicionCheck["tipo"];
  url: string | null;
  metodo: string;
  cabeceras: Record<string, string> | null;
  cuerpo: string | null;
  espera_status: number[] | null;
  espera_texto: string | null;
  timeout_ms: number;
  intervalo_s: number;
  umbral_fallos: number;
  umbral_latencia_ms: number | null;
  notifica: boolean;
  estado: EstadoCheck;
  fallos_consecutivos: number;
  servicios: { proyecto_id: string };
};

const COLUMNAS = `id, servicio_id, tipo, url, metodo, cabeceras, cuerpo,
   espera_status, espera_texto, timeout_ms, intervalo_s,
   umbral_fallos, umbral_latencia_ms, notifica,
   estado, fallos_consecutivos,
   servicios!inner(proyecto_id)`;

Deno.serve(async (peticion: Request) => {
  // Solo la puede invocar pg_net con la service_role key.
  const autorizacion = peticion.headers.get("Authorization");
  const esperado = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (autorizacion !== esperado) {
    return new Response("No autorizado", { status: 401 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // El instante se calcula UNA vez y viaja a todo el lote: si cada check leyera
  // su propio reloj, dos resultados de la misma pasada tendrían marcas distintas
  // y el histórico quedaría desordenado sin motivo.
  const ahora = new Date().toISOString();

  const { data: pendientes, error } = await sb
    .from("checks")
    .select(COLUMNAS)
    .eq("activo", true)
    .lte("proximo_check_en", ahora)
    .limit(TAMANO_LOTE);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const resultados = await Promise.all(
    ((pendientes ?? []) as unknown as FilaCheck[]).map((fila) => procesar(sb, fila, ahora))
  );

  // Latido para el vigilante externo: si deja de llegar, alguien avisa de que
  // Atlas se ha quedado ciego. Es el único fallo que no puede detectar solo.
  const latido = Deno.env.get("ATLAS_LATIDO_URL");
  if (latido) {
    await fetch(latido).catch(() => {
      // Que el vigilante externo esté caído no debe tumbar la vigilancia.
    });
  }

  return Response.json({
    comprobados: resultados.length,
    incidenciasAbiertas: resultados.filter((r) => r.abrio).length,
    incidenciasCerradas: resultados.filter((r) => r.cerro).length,
  });
});

async function procesar(sb: SupabaseClient, fila: FilaCheck, ahora: string) {
  const def: DefinicionCheck = {
    id: fila.id,
    servicioId: fila.servicio_id,
    tipo: fila.tipo,
    url: fila.url,
    metodo: fila.metodo,
    cabeceras: fila.cabeceras,
    cuerpo: fila.cuerpo,
    esperaStatus: fila.espera_status ?? [],
    esperaTexto: fila.espera_texto,
    timeoutMs: fila.timeout_ms,
  };

  const resultado = await comprobar(def, fetch);

  // ¿Está silenciado? Dos motivos: ventana de mantenimiento del proyecto, o
  // incidencia silenciada a mano.
  const [{ data: ventana }, { data: incidencia }] = await Promise.all([
    sb
      .from("ventanas_mantenimiento")
      .select("id")
      .eq("proyecto_id", fila.servicios.proyecto_id)
      .lte("desde", ahora)
      .gte("hasta", ahora)
      .maybeSingle(),
    sb
      .from("incidencias")
      .select("id, silenciada_hasta")
      .eq("check_id", fila.id)
      .is("cerrada_en", null)
      .maybeSingle(),
  ]);

  const silenciadaHasta = incidencia?.silenciada_hasta as string | null | undefined;
  const silenciado =
    ventana !== null || (silenciadaHasta != null && silenciadaHasta > ahora);

  const t = transicion(resultado, {
    estadoActual: fila.estado,
    fallosConsecutivos: fila.fallos_consecutivos,
    umbralFallos: fila.umbral_fallos,
    umbralLatenciaMs: fila.umbral_latencia_ms,
    incidenciaAbierta: incidencia != null,
    silenciado,
    notifica: fila.notifica,
  });

  const proximo = new Date(
    new Date(ahora).getTime() + fila.intervalo_s * 1000
  ).toISOString();

  await Promise.all([
    // El resultado se guarda SIEMPRE, esté silenciado o no: lo que se calla es
    // el aviso, nunca el registro.
    sb.from("check_resultados").insert({
      check_id: fila.id,
      ts: ahora,
      ok: resultado.ok,
      latencia_ms: resultado.latenciaMs,
      status_code: resultado.statusCode,
      error: resultado.error,
    }),
    sb
      .from("checks")
      .update({
        estado: t.estadoNuevo,
        fallos_consecutivos: t.fallosConsecutivos,
        ultimo_check_en: ahora,
        proximo_check_en: proximo,
      })
      .eq("id", fila.id),
  ]);

  if (t.abrirIncidencia) {
    await sb.from("incidencias").insert({
      servicio_id: fila.servicio_id,
      check_id: fila.id,
      abierta_en: ahora,
      severidad: "critica",
      causa: resultado.error,
      ultimo_error: resultado.error,
    });
  }
  if (t.cerrarIncidencia && incidencia) {
    await sb.from("incidencias").update({ cerrada_en: ahora }).eq("id", incidencia.id);
  }

  // El vigía no envía nada: deja la incidencia escrita y `avisar` la recoge en
  // su siguiente pasada. Comprobar servicios no debe quedarse esperando a un
  // servidor de correo. `t.notificar` se devuelve solo para el resumen.
  return { abrio: t.abrirIncidencia, cerro: t.cerrarIncidencia, avisar: t.notificar };
}
