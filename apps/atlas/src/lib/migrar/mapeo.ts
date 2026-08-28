//
// Traducción entre el esquema antiguo (Oficina Virtual) y el de Atlas.
// Lógica pura: sin red, sin base de datos, sin `Date.now()`. Vive en src/lib y
// no en scripts/ para que entre en la cobertura como todo lo demás.
//
import { aSlug } from "@/lib/texto";

// Se reexporta para que el script de migración tenga un único sitio del que
// tirar, pero la implementación es la que ya usa el formulario de clientes: dos
// versiones del mismo slug acabarían divergiendo.
export { aSlug };

export type FilaClienteVieja = {
  id: string;
  name: string | null;
  sector: string | null;
  status: string | null;
};

export type FilaProyectoVieja = {
  id: string;
  client_id: string | null;
  name: string;
  status: string;
  budget: string | null; // numeric llega como string desde pg
  pm_vertical: string | null;
  start_date: string | null; // ISO AAAA-MM-DD
  end_date: string | null;
};

const ESTADO_CLIENTE: Record<string, string> = {
  active: "activo",
  lead: "potencial",
  paused: "pausado",
  closed: "cerrado",
};

export function mapearCliente(fila: FilaClienteVieja) {
  const nombre = (fila.name ?? "").trim();
  if (nombre.length === 0) return null; // un cliente sin nombre no es un cliente
  return {
    nombre,
    slug: aSlug(nombre),
    sector: fila.sector,
    estado: ESTADO_CLIENTE[fila.status ?? ""] ?? "potencial",
  };
}

const TIPO_POR_VERTICAL: Record<string, string> = {
  voz: "voz",
  chatbots: "chatbot",
  "webs-apps": "web-app",
  automatizaciones: "automatizacion",
  operaciones: "interno",
};

const ESTADO_PROYECTO: Record<string, string> = {
  proposal: "desarrollo",
  active: "produccion",
  delivered: "mantenimiento",
  invoiced: "mantenimiento",
  paid: "mantenimiento",
  cancelled: "retirado",
};

export function mapearProyecto(fila: FilaProyectoVieja) {
  const nombre = fila.name.trim();
  if (nombre.length === 0) return null;
  return {
    nombre,
    slug: aSlug(nombre),
    tipo: TIPO_POR_VERTICAL[fila.pm_vertical ?? ""] ?? "interno",
    estado: ESTADO_PROYECTO[fila.status] ?? "desarrollo",
  };
}

/** `""` o texto no numérico darían NaN, que PostgREST rechazaría a mitad. */
function aNumeroONulo(valor: string | null): number | null {
  if (valor === null || valor.trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function mapearContrato(fila: FilaProyectoVieja) {
  // Sin fecha de alta no hay contrato: `contratos.alta` es NOT NULL y forma
  // parte de la clave única. Inventar una fecha sería peor que no traerlo.
  if (!fila.start_date) return null;

  const alta = fila.start_date;
  // La restricción `baja >= alta` del esquema rechazaría estos casos; se
  // descartan aquí para que el informe pueda contarlos en vez de reventar.
  const baja = fila.end_date && fila.end_date >= alta ? fila.end_date : null;

  return {
    cuotaMensual: aNumeroONulo(fila.budget),
    alta,
    baja,
    estado: fila.status === "cancelled" ? "finalizado" : "activo",
  };
}
