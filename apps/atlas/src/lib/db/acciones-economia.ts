// src/lib/db/acciones-economia.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirAjustes, leerAjustes, type EntradaAjustes } from "./ajustes-economia";
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

// Recibe solo `mes`, no el coste: lo que llega por la red no decide con qué
// coste se congela un mes. Una pestaña abierta antes de cambiar el coste en
// Ajustes mandaría aquí un valor obsoleto si el cliente lo escogiera; leerlo
// en el servidor, justo antes de cerrar, es la única fuente que puede ser el
// coste vigente en ese instante.
export async function cerrarMesAccion(mes: string): Promise<Ok> {
  const sb = await clienteServidor();
  const ajustes = await leerAjustes(sb);
  const r = await cerrarMes(sb, mes, ajustes.costeHoraCentimos, Date.now());
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
