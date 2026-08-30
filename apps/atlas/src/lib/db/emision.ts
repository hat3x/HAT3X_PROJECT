// src/lib/db/emision.ts
//
// La emisión fiscal (§7): borradores, emitir, anular y rectificar. Recibe `sb`
// para probarse contra la base; el envoltorio "use server" llega en
// `acciones-emision.ts` (tarea 6).
//
// El reparto de responsabilidades es la regla de todo el módulo: LA
// APLICACIÓN CALCULA (huella, firma, instante), LA BASE GARANTIZA (número
// correlativo bajo bloqueo, punta de la cadena, inmutabilidad). Por eso este
// fichero nunca escribe `numero`, `huella`, `firma` ni `estado = 'emitida'`
// en `facturas`: solo lo hace `atlas_emitir_factura`, y el disparador de
// inmutabilidad se estrellaría con cualquier otro intento.
//
import type { Sb } from "./clientes";
import type { Ok } from "./proyectos";
import { obtenerPerfil } from "./perfil";
import { obtenerFactura, type EntradaLinea } from "./facturas";
import { usarCredencial } from "./credenciales";
import { leerAjustes } from "./ajustes-economia";
import { aCentimos, desglosar } from "@/lib/dinero";
import { ajustesDeEmision } from "@/lib/facturas/ajustes-emision";
import {
  cadenaCanonica,
  huellaDe,
  instanteMadrid,
  numSerie,
  type Eslabon,
  type RegistroAlta,
} from "@/lib/facturas/huella";
import { firmar } from "@/lib/facturas/firma";
import type { Database, Json } from "@/types/supabase";

export type EntradaBorrador = {
  clienteId: string;
  /** La elige el llamador. Las rectificativas van siempre a `SERIE_RECTIFICATIVAS`. */
  serie: string;
  /** ISO AAAA-MM-DD */
  fechaEmision: string;
  fechaVencimiento?: string | null;
  ivaTipo: number;
  lineas: EntradaLinea[];
  notas?: string | null;
};

export type TipoFactura = RegistroAlta["tipoFactura"];

export type TipoEvento = Database["public"]["Tables"]["factura_eventos"]["Insert"]["tipo"];

/** La serie de las rectificativas. Una serie es de un solo origen (migración de cierres): así el correlativo R-n no se mezcla con las normales. */
export const SERIE_RECTIFICATIVAS = "R";

/** Cuántas veces se recalcula si la RPC dice «reintenta» antes de rendirse. */
const REINTENTOS_MAX = 3;

const NO_PROPIETARIO = "Solo el propietario puede gestionar facturas.";

/** Céntimos → el `numeric(12,2)` que espera Postgres. */
function aEuros(centimos: number): number {
  return centimos / 100;
}

/**
 * `numeric` de la base → céntimos enteros. `aCentimos` rechaza negativos a
 * propósito (viene de formularios), así que el signo se separa y se vuelve a
 * poner: aquí un negativo es legítimo (una rectificativa en la huella).
 */
function centimosDe(euros: number): number {
  const abs = aCentimos(Math.abs(euros));
  if (abs === null) throw new Error(`Importe fuera de rango: ${euros}`);
  return euros < 0 ? -abs : abs;
}

/**
 * El signo con que una factura entra en la huella. La base (migración 2A)
 * exige `base`, `iva_cuota`, `total` e `importe` de línea >= 0, y ese check
 * no se toca desde aquí: una rectificativa guarda sus importes en valor
 * absoluto y su signo vive en `tipo_factura = 'R1'`. En el registro de alta
 * de la AEAT una rectificativa por diferencias lleva los importes en negativo,
 * y es AQUÍ, al construir el registro, donde se aplica.
 */
function signoDe(tipo: TipoFactura): 1 | -1 {
  return tipo === "R1" ? -1 : 1;
}

/** AAAA-MM-DD de un instante, en Madrid: el día de la rectificativa es el del propietario, no el de UTC. */
function diaEnMadrid(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(ms));
}

async function soloPropietario(sb: Sb): Promise<Ok> {
  const perfil = await obtenerPerfil(sb);
  return perfil?.esPropietario ? { ok: true } : { ok: false, error: NO_PROPIETARIO };
}

// ---------------------------------------------------------------------------
// Borradores
// ---------------------------------------------------------------------------

/** Las líneas y el desglose en céntimos, una sola vez para crear y guardar. */
function calcularLineas(entrada: EntradaBorrador) {
  const lineas = entrada.lineas.map((l, i) => ({
    orden: i,
    concepto: l.concepto,
    descripcion: l.descripcion ?? null,
    cantidad: l.cantidad,
    precio_unitario: aEuros(l.precioUnitarioCentimos),
    importe: aEuros(Math.round(l.precioUnitarioCentimos * l.cantidad)),
    proyecto_id: l.proyectoId ?? null,
  }));
  const baseCentimos = entrada.lineas.reduce(
    (suma, l) => suma + Math.round(l.precioUnitarioCentimos * l.cantidad),
    0
  );
  const d = desglosar(baseCentimos, entrada.ivaTipo);
  return {
    lineas,
    cabecera: {
      cliente_id: entrada.clienteId,
      serie: entrada.serie,
      fecha_emision: entrada.fechaEmision,
      fecha_vencimiento: entrada.fechaVencimiento ?? null,
      iva_tipo: entrada.ivaTipo,
      base: aEuros(d.base),
      iva_cuota: aEuros(d.cuota),
      total: aEuros(d.total),
      notas: entrada.notas ?? null,
    },
  };
}

async function insertarBorrador(
  sb: Sb,
  entrada: EntradaBorrador,
  tipoFactura: TipoFactura,
  rectificaA: string | null
): Promise<Ok & { id?: string }> {
  const { lineas, cabecera } = calcularLineas(entrada);

  // Sin `numero`: lo pondrá `atlas_emitir_factura` cuando se emita. Un
  // borrador con número parecería una factura, y no lo es todavía.
  const { data, error } = await sb
    .from("facturas")
    .insert({
      ...cabecera,
      origen: "atlas",
      estado: "borrador",
      tipo_factura: tipoFactura,
      rectifica_a: rectificaA,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  if (lineas.length > 0) {
    const { error: eLineas } = await sb
      .from("factura_lineas")
      .insert(lineas.map((l) => ({ ...l, factura_id: data.id })));
    if (eLineas) {
      // PostgREST no da transacciones entre dos llamadas: la cabecera se
      // retira a mano para no dejar un borrador vacío que nadie pidió.
      await sb.from("facturas").delete().eq("id", data.id);
      return { ok: false, error: eLineas.message };
    }
  }
  return { ok: true, id: data.id };
}

/** Un borrador normal (F1) de Atlas: sin número, en la serie que diga el llamador. */
export async function crearBorrador(sb: Sb, e: EntradaBorrador): Promise<Ok & { id?: string }> {
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;
  if (e.serie.trim() === "") return { ok: false, error: "Di en qué serie va la factura." };
  return insertarBorrador(sb, e, "F1", null);
}

/** Lo que hay que saber de una factura antes de tocarla como borrador. */
async function comprobarBorrador(sb: Sb, id: string): Promise<Ok> {
  const f = await obtenerFactura(sb, id);
  if (!f) return { ok: false, error: "Esa factura no existe." };
  if (f.origen !== "atlas") {
    return { ok: false, error: "Esa factura no es de Atlas: se edita desde el registro de facturas externas." };
  }
  if (f.estado !== "borrador") {
    return {
      ok: false,
      error: `La factura ${numSerie(f.serie, f.numero ?? 0)} ya está emitida y no se cambia. Si hay que corregirla, rectifícala.`,
    };
  }
  return { ok: true };
}

/** Reemplaza cabecera y líneas. Solo mientras siga siendo borrador; el tipo y `rectifica_a` no cambian aquí. */
export async function guardarBorrador(sb: Sb, id: string, e: EntradaBorrador): Promise<Ok> {
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;
  const estado = await comprobarBorrador(sb, id);
  if (!estado.ok) return estado;

  const { lineas, cabecera } = calcularLineas(e);
  const { error: eBorrar } = await sb.from("factura_lineas").delete().eq("factura_id", id);
  if (eBorrar) return { ok: false, error: eBorrar.message };
  if (lineas.length > 0) {
    const { error: eLineas } = await sb
      .from("factura_lineas")
      .insert(lineas.map((l) => ({ ...l, factura_id: id })));
    if (eLineas) return { ok: false, error: eLineas.message };
  }
  const { error } = await sb.from("facturas").update(cabecera).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function borrarBorrador(sb: Sb, id: string): Promise<Ok> {
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;
  const estado = await comprobarBorrador(sb, id);
  if (!estado.ok) return estado;

  // Las líneas primero y a mano: el `on delete cascade` las borraría igual,
  // pero así el disparador de líneas las ve con su factura aún en pie.
  const { error: eLineas } = await sb.from("factura_lineas").delete().eq("factura_id", id);
  if (eLineas) return { ok: false, error: eLineas.message };
  const { error } = await sb.from("facturas").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---------------------------------------------------------------------------
// Emitir
// ---------------------------------------------------------------------------

type RespuestaRpc =
  | { ok: true }
  | { ok: false; reintentar: true; numero: number; punta: string | null }
  | { ok: false; error: string };

/** El jsonb de las RPC, leído sin fiarse: cualquier forma rara es un error con texto. */
function leerRespuesta(data: unknown): RespuestaRpc {
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "La base no respondió." };
  }
  const r = data as Record<string, unknown>;
  if (r.ok === true) return { ok: true };
  if (r.reintentar === true && typeof r.numero === "number") {
    return { ok: false, reintentar: true, numero: r.numero, punta: typeof r.punta === "string" ? r.punta : null };
  }
  return { ok: false, error: typeof r.error === "string" ? r.error : "La base falló sin decir por qué." };
}

type ArgsEmitir = Database["public"]["Functions"]["atlas_emitir_factura"]["Args"];

/**
 * Emite un borrador de Atlas: le da número, huella y firma, y lo mete en la
 * cadena. `ahoraMs` entra por parámetro para que el instante de generación
 * sea reproducible en los tests y no dependa del reloj de la máquina.
 *
 * El bucle (§7.2): la aplicación lee «el siguiente número y la punta» SIN
 * bloqueo, calcula huella y firma para ese estado, y se lo lleva a
 * `atlas_emitir_factura`, que con el bloqueo cogido comprueba que siguen
 * siendo los actuales. Si otra emisión se coló entre medias, la RPC no
 * escribe nada y devuelve el número y la punta reales: se recalcula para esos
 * y se vuelve. La huella no puede calcularse dentro de la base (la firma vive
 * en la aplicación), y no se puede tener el bloqueo mientras se calcula fuera:
 * el reintento es lo que hace que dos emisiones a la vez no bifurquen la
 * cadena ni dejen un hueco.
 */
export async function emitir(sb: Sb, id: string, ahoraMs: number): Promise<Ok & { numero?: number }> {
  const puerta = await ajustesDeEmision(sb);
  if (!puerta.ok) return puerta;

  const f = await obtenerFactura(sb, id);
  if (!f) return { ok: false, error: "Esa factura no existe." };
  if (f.origen !== "atlas" || f.estado !== "borrador") {
    return { ok: false, error: "Solo se emite un borrador de Atlas." };
  }
  if (f.lineas.length === 0) {
    return { ok: false, error: "Una factura necesita al menos una línea." };
  }
  const { data: fila, error: eTipo } = await sb
    .from("facturas")
    .select("tipo_factura")
    .eq("id", id)
    .single();
  if (eTipo) return { ok: false, error: eTipo.message };
  const tipoFactura: TipoFactura = fila.tipo_factura === "R1" ? "R1" : "F1";
  const signo = signoDe(tipoFactura);

  // La clave se abre UNA vez por emisión, fuera del bucle (§7.3): cada
  // `usarCredencial` deja una fila en `credencial_usos`, y ese registro tiene
  // que decir «una firma, un uso». Si cada reintento volviera a abrirla, el
  // rastro contaría tres aperturas para una sola factura y no se podría
  // distinguir de una fuga.
  const pem = await usarCredencial(sb, puerta.ajustes.credencialFirmaId, `firma factura ${id}`);

  const { data: sig, error: eSig } = await sb.rpc("atlas_siguiente_emision", { p_serie: f.serie });
  if (eSig) return { ok: false, error: eSig.message };
  const primero = sig?.[0];
  if (primero === undefined) return { ok: false, error: "No se pudo leer el siguiente número de la serie." };

  let numero = primero.numero;
  // Tipada `string` por los tipos generados, pero con la cadena vacía es null.
  let punta: string | null = (primero.punta as string | null) ?? null;

  for (let intento = 1; intento <= REINTENTOS_MAX; intento++) {
    const genEn = instanteMadrid(ahoraMs);
    const registro: RegistroAlta = {
      nifEmisor: puerta.ajustes.cif,
      numSerie: numSerie(f.serie, numero),
      fechaExpedicion: f.fechaEmision,
      tipoFactura,
      cuotaTotalCentimos: signo * centimosDe(f.ivaCuota),
      importeTotalCentimos: signo * centimosDe(f.total),
      huellaAnterior: punta,
      genEn,
    };
    const huella = await huellaDe(registro);
    const firma = firmar(cadenaCanonica(registro), pem);

    // `p_huella_anterior` es null con la cadena vacía; los tipos generados no
    // saben decirlo.
    const args = {
      p_factura: id,
      p_numero: numero,
      p_huella_anterior: punta,
      p_huella: huella,
      p_firma: firma,
      p_gen_en: genEn,
    } as ArgsEmitir;
    const { data, error } = await sb.rpc("atlas_emitir_factura", args);
    if (error) return { ok: false, error: error.message };

    const r = leerRespuesta(data);
    if (r.ok) return { ok: true, numero };
    if (!("reintentar" in r)) return { ok: false, error: r.error };
    numero = r.numero;
    punta = r.punta;
  }
  return { ok: false, error: "La cadena se movió tres veces seguidas; inténtalo de nuevo." };
}

// ---------------------------------------------------------------------------
// Anular y rectificar
// ---------------------------------------------------------------------------

/** Anular no libera el número: la anulada sigue en la cadena y en el correlativo (§7). */
export async function anular(sb: Sb, id: string, motivo: string): Promise<Ok> {
  if (motivo.trim() === "") return { ok: false, error: "Di por qué se anula: queda en el registro." };
  const { data, error } = await sb.rpc("atlas_anular_factura", { p_factura: id, p_motivo: motivo.trim() });
  if (error) return { ok: false, error: error.message };
  const r = leerRespuesta(data);
  if (r.ok) return { ok: true };
  return { ok: false, error: "error" in r ? r.error : "No se pudo anular." };
}

/**
 * Crea el borrador R1 que rectifica a una emitida: mismo cliente y mismas
 * líneas, en la serie `R` y apuntando al original con `rectifica_a`. NO emite:
 * el propietario lo revisa y lo emite como cualquier borrador. Los importes
 * se guardan en valor absoluto (ver `signoDe`); el signo lo pone `R1`.
 *
 * No deja evento: la política de `factura_eventos` (migración de cierres, M5)
 * reserva `rectificacion` a las RPC, y desde PostgREST solo entran
 * `exportacion` y `config_fiscal`. El rastro está en la propia fila:
 * `rectifica_a` es inmutable en cuanto la R1 se emite, y esa emisión deja su
 * evento `emision` desde la RPC. Ningún evento apunta a un borrador.
 */
export async function rectificar(sb: Sb, id: string, ahoraMs: number): Promise<Ok & { id?: string }> {
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;

  const f = await obtenerFactura(sb, id);
  if (!f) return { ok: false, error: "Esa factura no existe." };
  if (f.origen !== "atlas" || f.estado !== "emitida" || f.numero === null) {
    return { ok: false, error: "Solo se rectifica una factura emitida por Atlas (una anulada ya no dice nada)." };
  }

  return insertarBorrador(
    sb,
    {
      clienteId: f.clienteId,
      serie: SERIE_RECTIFICATIVAS,
      fechaEmision: diaEnMadrid(ahoraMs),
      ivaTipo: f.ivaTipo,
      lineas: f.lineas.map((l) => ({
        concepto: l.concepto,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitarioCentimos: centimosDe(l.precioUnitario),
        proyectoId: l.proyectoId,
      })),
      notas: `Rectifica a ${numSerie(f.serie, f.numero)}.`,
    },
    "R1",
    id
  );
}

// ---------------------------------------------------------------------------
// La cadena y el registro de eventos
// ---------------------------------------------------------------------------

/**
 * Los eslabones de la cadena tal como los guardó la base, para `verificarCadena`:
 * emitidas y anuladas de Atlas, ordenadas por instante de sellado, con el CIF
 * actual del emisor. Si el CIF cambió después de emitir, la cadena no verifica:
 * es lo correcto, porque cambió lo que se selló.
 */
export async function eslabonesDeLaCadena(sb: Sb): Promise<Eslabon[]> {
  const ajustes = await leerAjustes(sb);
  const { data, error } = await sb
    .from("facturas")
    .select("serie, numero, fecha_emision, tipo_factura, iva_cuota, total, huella, huella_anterior, huella_gen_en")
    .eq("origen", "atlas")
    .in("estado", ["emitida", "anulada"])
    .not("huella", "is", null)
    .order("huella_gen_en", { ascending: true })
    .order("numero", { ascending: true });
  if (error) throw error;

  const eslabones: Eslabon[] = [];
  for (const f of data ?? []) {
    if (f.numero === null || f.huella === null || f.huella_gen_en === null) continue;
    const tipo: TipoFactura = f.tipo_factura === "R1" ? "R1" : "F1";
    const signo = signoDe(tipo);
    eslabones.push({
      nifEmisor: ajustes.cif ?? "",
      numSerie: numSerie(f.serie, f.numero),
      fechaExpedicion: f.fecha_emision,
      tipoFactura: tipo,
      cuotaTotalCentimos: signo * centimosDe(Number(f.iva_cuota)),
      importeTotalCentimos: signo * centimosDe(Number(f.total)),
      huellaAnterior: f.huella_anterior,
      // El mismo texto que entró en la huella: la base guarda el instante y
      // aquí se vuelve a escribir en Madrid con su desfase.
      genEn: instanteMadrid(Date.parse(f.huella_gen_en)),
      huella: f.huella,
    });
  }
  return ordenarPorEnlace(eslabones);
}

/**
 * `huella_gen_en` va al segundo, así que dos sellados en el mismo segundo
 * (dos clics seguidos, o dos emisiones a la vez) empatan y la base los devuelve
 * en un orden cualquiera. Dentro de cada empate se sigue el enlace: va antes
 * el eslabón cuya `huellaAnterior` es la huella del anterior. Si en un empate
 * no hay ninguno que enlace, se deja como vino y `verificarCadena` dirá dónde
 * se rompe: esta función ordena, no arregla.
 */
function ordenarPorEnlace(eslabones: Eslabon[]): Eslabon[] {
  const pendientes = [...eslabones];
  const resultado: Eslabon[] = [];
  let anterior: string | null = null;
  while (pendientes.length > 0) {
    const cabeza = pendientes[0];
    if (cabeza === undefined) break;
    let idx = pendientes.findIndex(
      (e) => e.genEn === cabeza.genEn && (e.huellaAnterior ?? null) === anterior
    );
    if (idx < 0) idx = 0;
    const [elegido] = pendientes.splice(idx, 1);
    if (elegido === undefined) break;
    resultado.push(elegido);
    anterior = elegido.huella;
  }
  return resultado;
}

/**
 * Deja un evento en el registro de solo inserción (§4.7). Desde la aplicación
 * solo entran `exportacion` y `config_fiscal` (política M5); los demás tipos
 * los escriben las RPC. Lanza si la base lo rechaza: un evento que no se pudo
 * escribir no es algo que se pueda ignorar. Nunca se llama con el id de un
 * borrador: `factura_id` es `on delete restrict` y un evento no se borra.
 */
export async function registrarEvento(
  sb: Sb,
  tipo: TipoEvento,
  detalle: Record<string, unknown>,
  facturaId?: string | null
): Promise<void> {
  const { data: sesion } = await sb.auth.getUser();
  const { error } = await sb.from("factura_eventos").insert({
    factura_id: facturaId ?? null,
    tipo,
    detalle: detalle as Json,
    usuario_id: sesion.user?.id ?? null,
  });
  if (error) throw error;
}
