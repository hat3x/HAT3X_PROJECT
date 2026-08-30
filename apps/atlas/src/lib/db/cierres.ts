// src/lib/db/cierres.ts
//
// Cerrar un mes congela el coste de la hora con el que se calculó (§4.8).
//
import type { Sb } from "./clientes";
import type { Ok } from "./proyectos";
import { mesDe, mesEnMadrid } from "@/lib/dinero";

export type Cierre = { mes: string; costeHoraCentimos: number; cerradoEn: string };

export async function cierreDe(sb: Sb, mes: string): Promise<Cierre | null> {
  const { data, error } = await sb
    .from("cierres_mes")
    .select("mes, coste_hora, cerrado_en")
    .eq("mes", `${mes}-01`)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { mes: mesDe(data.mes), costeHoraCentimos: Math.round(Number(data.coste_hora) * 100), cerradoEn: data.cerrado_en }
    : null;
}

export async function cerrarMes(sb: Sb, mes: string, costeHoraCentimos: number, ahoraMs: number): Promise<Ok> {
  // El mes en curso no se cierra: le faltan días. Se compara por texto de mes
  // porque el instante viene por parámetro y así se prueba sin esperar. Se
  // corta en Madrid, no en UTC: el resto de la app (`limitesMesMadrid`,
  // `hoyEnMadrid`) corta meses ahí, y entre las 00:00 y las ~02:00 de Madrid
  // del día 1, el mes que acaba de terminar todavía es el anterior en UTC —
  // con `toISOString` esa ventana de dos horas impediría cerrar un mes que sí
  // ha terminado.
  const mesActual = mesEnMadrid(ahoraMs);
  if (mes >= mesActual) return { ok: false, error: "No se cierra un mes que no ha terminado." };
  const {
    data: { user },
  } = await sb.auth.getUser();
  const { error } = await sb.from("cierres_mes").insert({
    mes: `${mes}-01`,
    coste_hora: costeHoraCentimos / 100,
    cerrado_por: user?.id ?? null,
  });
  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, error: "Ese mes ya está cerrado." };
  return { ok: false, error: error.message };
}

export async function reabrirMes(sb: Sb, mes: string): Promise<Ok> {
  const { data, error } = await sb.from("cierres_mes").delete().eq("mes", `${mes}-01`).select("mes");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Ese mes no estaba cerrado." };
  return { ok: true };
}
