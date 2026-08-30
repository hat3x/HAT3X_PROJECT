// src/lib/db/acciones-economia.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirAjustes, type EntradaAjustes } from "./ajustes-economia";
import { cerrarMes, reabrirMes } from "./cierres";
import type { Ok } from "./proyectos";

// Envoltorios del límite HTTP; validar y escribir es de los módulos que
// reciben `sb`. Un módulo "use server" expone TODO lo exportado, así que
// aquí no hay nada más que estas tres funciones: ninguna lógica que no deba
// ser un endpoint público.

export async function guardarAjustesEconomia(entrada: EntradaAjustes): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirAjustes(sb, entrada);
  if (!r.ok) return r;
  revalidatePath("/ajustes/economia");
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}

export async function cerrarMesAccion(mes: string, costeHoraCentimos: number): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await cerrarMes(sb, mes, costeHoraCentimos, Date.now());
  if (!r.ok) return r;
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}

export async function reabrirMesAccion(mes: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await reabrirMes(sb, mes);
  if (!r.ok) return r;
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}
