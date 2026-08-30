// La huella del registro de alta (Orden HAC/1177/2024; documento técnico de la
// AEAT v0.1.2). Pura: sin base, sin reloj. Los dos vectores públicos del
// documento están en el test y son la única verdad que esta función acepta.
//
export type RegistroAlta = {
  nifEmisor: string;
  numSerie: string;
  /** ISO AAAA-MM-DD */
  fechaExpedicion: string;
  tipoFactura: "F1" | "R1";
  cuotaTotalCentimos: number;
  importeTotalCentimos: number;
  huellaAnterior: string | null;
  /** ISO con desfase explícito: 2024-01-01T19:20:30+01:00 */
  genEn: string;
};

export type Eslabon = RegistroAlta & { huella: string };

/** Céntimos → «123.45». Dos decimales y punto: es lo que el documento muestra. */
export function importeAeat(centimos: number): string {
  const signo = centimos < 0 ? "-" : "";
  const abs = Math.abs(centimos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** AAAA-MM-DD → dd-mm-aaaa. */
export function fechaAeat(iso: string): string {
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** Una sola regla para el identificador: la que va en la huella, el documento y el QR. */
export function numSerie(serie: string, numero: number): string {
  return `${serie}-${numero}`;
}

/**
 * El instante de generación, en Madrid y con su desfase escrito. La orden pide
 * fecha, hora y huso; escribir el desfase (+01:00/+02:00) lo hace verificable
 * sin conocer la zona.
 */
export function instanteMadrid(ms: number): string {
  const d = new Date(ms);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  const hora = String(Number(g("hour")) % 24).padStart(2, "0");
  const local = Date.UTC(Number(g("year")), Number(g("month")) - 1, Number(g("day")), Number(hora), Number(g("minute")), Number(g("second")));
  const desfaseMin = Math.round((local - Math.floor(ms / 1000) * 1000) / 60_000);
  const signo = desfaseMin >= 0 ? "+" : "-";
  const abs = Math.abs(desfaseMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${g("year")}-${g("month")}-${g("day")}T${hora}:${g("minute")}:${g("second")}${signo}${hh}:${mm}`;
}

const v = (s: string | null) => (s ?? "").trim();

/** Exactamente el orden y los nombres del documento; cambiarlos invalida la cadena. */
export function cadenaCanonica(r: RegistroAlta): string {
  return (
    `IDEmisorFactura=${v(r.nifEmisor)}` +
    `&NumSerieFactura=${v(r.numSerie)}` +
    `&FechaExpedicionFactura=${fechaAeat(v(r.fechaExpedicion))}` +
    `&TipoFactura=${r.tipoFactura}` +
    `&CuotaTotal=${importeAeat(r.cuotaTotalCentimos)}` +
    `&ImporteTotal=${importeAeat(r.importeTotalCentimos)}` +
    `&Huella=${v(r.huellaAnterior)}` +
    `&FechaHoraHusoGenRegistro=${v(r.genEn)}`
  );
}

export async function huellaDe(r: RegistroAlta): Promise<string> {
  const bytes = new TextEncoder().encode(cadenaCanonica(r));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Recorre la cadena y recalcula cada huella. Si algo no encaja, dice dónde.
 *
 * `eslabones` debe venir ordenado por `genEn` (fecha de generación): esta
 * función no reordena ni asume nada sobre el orden de llegada, solo compara
 * cada `huellaAnterior` contra la huella calculada del eslabón previo en el
 * array. Un array desordenado (o con eslabones fuera de secuencia) se informa
 * como una rotura de cadena igual que una huella manipulada.
 */
export async function verificarCadena(
  eslabones: Eslabon[]
): Promise<{ ok: true } | { ok: false; rotaEn: number; esperada: string; encontrada: string }> {
  let anterior: string | null = null;
  for (let i = 0; i < eslabones.length; i++) {
    const e = eslabones[i];
    if (e === undefined) break;
    if ((e.huellaAnterior ?? null) !== anterior) {
      return { ok: false, rotaEn: i, esperada: anterior ?? "", encontrada: e.huellaAnterior ?? "" };
    }
    const esperada = await huellaDe(e);
    if (esperada !== e.huella) return { ok: false, rotaEn: i, esperada, encontrada: e.huella };
    anterior = e.huella;
  }
  return { ok: true };
}
