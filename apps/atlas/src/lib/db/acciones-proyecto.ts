"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "./perfil";

export type Ok = { ok: true } | { ok: false; error: string };

export type EntradaContrato = {
  clienteId: string;
  proyectoId: string;
  cuotaMensual: number | null;
  addons: string[];
  alta: string; // ISO AAAA-MM-DD
  baja: string | null; // ISO AAAA-MM-DD
  estado: string;
};

export type EntradaServicio = {
  proyectoId: string;
  clienteId: string | null;
  nombre: string;
  tipo: string;
  proveedor: string | null;
};

const TIPOS_SERVICIO = [
  "web", "api", "webhook", "workflow", "agente-voz",
  "telefonia", "base-datos", "cron", "dominio", "otro",
] as const;

const ESTADOS_CONTRATO = ["activo", "pausado", "finalizado"] as const;

/**
 * Comprueba que la cadena es una fecha ISO AAAA-MM-DD *real*: el patrón por sí
 * solo aceptaría 2026-13-01 o 2026-02-31.
 */
function esFechaISO(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

// OJO: en un módulo "use server" TODAS las exportaciones deben ser async,
// incluidas estas dos aunque no esperen nada. Es el error que tsc no ve y
// next build sí.
export async function validarContrato(entrada: EntradaContrato): Promise<Ok> {
  if (entrada.cuotaMensual !== null && entrada.cuotaMensual < 0) {
    return { ok: false, error: "La cuota no puede ser negativa." };
  }
  if (!esFechaISO(entrada.alta)) {
    return { ok: false, error: "La fecha de alta debe tener el formato AAAA-MM-DD." };
  }
  if (entrada.baja !== null) {
    if (!esFechaISO(entrada.baja)) {
      return { ok: false, error: "La fecha de baja debe tener el formato AAAA-MM-DD." };
    }
    // Comparar cadenas ISO es correcto: AAAA-MM-DD ordena igual alfabética que
    // cronológicamente. Duplica el CHECK de la tabla a propósito, para dar un
    // mensaje entendible en vez de un error crudo de Postgres.
    if (entrada.baja < entrada.alta) {
      return { ok: false, error: "La fecha de baja no puede ser anterior a la de alta." };
    }
  }
  if (!(ESTADOS_CONTRATO as readonly string[]).includes(entrada.estado)) {
    return { ok: false, error: `El estado «${entrada.estado}» no existe.` };
  }
  return { ok: true };
}

export async function validarServicio(entrada: EntradaServicio): Promise<Ok> {
  if (entrada.nombre.trim().length === 0) {
    return { ok: false, error: "El nombre del servicio no puede estar vacío." };
  }
  if (!(TIPOS_SERVICIO as readonly string[]).includes(entrada.tipo)) {
    return {
      ok: false,
      error: `El tipo «${entrada.tipo}» no existe. Admitidos: ${TIPOS_SERVICIO.join(", ")}.`,
    };
  }
  return { ok: true };
}

export async function guardarContrato(entrada: EntradaContrato): Promise<Ok> {
  const valido = await validarContrato(entrada);
  if (!valido.ok) return valido;

  const sb = await clienteServidor();
  // Un contrato lleva dinero: esto es cosa del propietario. RLS lo impediría
  // igualmente, pero así el mensaje es claro en vez de un 42501 seco.
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar contratos." };
  }

  const { error } = await sb.from("contratos").insert({
    cliente_id: entrada.clienteId,
    proyecto_id: entrada.proyectoId,
    cuota_mensual: entrada.cuotaMensual,
    addons: entrada.addons,
    alta: entrada.alta,
    baja: entrada.baja,
    estado: entrada.estado,
  });
  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          error:
            "Ya existe un contrato de ese cliente y proyecto con esa fecha de alta.",
        }
      : { ok: false, error: error.message };
  }

  revalidatePath("/clientes");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function guardarServicio(
  entrada: EntradaServicio,
  slugProyecto: string
): Promise<Ok> {
  const valido = await validarServicio(entrada);
  if (!valido.ok) return valido;

  const sb = await clienteServidor();
  // Aquí NO se exige ser propietario: un editor gestiona los servicios de sus
  // proyectos. Quien decide es la política RLS `servicios_escribir`, que ya
  // comprueba `atlas_edita_proyecto`.
  const { error } = await sb.from("servicios").insert({
    proyecto_id: entrada.proyectoId,
    cliente_id: entrada.clienteId,
    nombre: entrada.nombre.trim(),
    tipo: entrada.tipo,
    proveedor: entrada.proveedor,
  });
  if (error) {
    return error.code === "42501"
      ? { ok: false, error: "No tienes permiso para editar este proyecto." }
      : { ok: false, error: error.message };
  }

  revalidatePath(`/proyectos/${slugProyecto}`);
  return { ok: true };
}
