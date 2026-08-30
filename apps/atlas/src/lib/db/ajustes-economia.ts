// src/lib/db/ajustes-economia.ts
//
// La configuración económica: una fila (§4.8). Recibe `sb` para probarse; el
// envoltorio "use server" está en `acciones-economia.ts`.
//
import type { Sb } from "./clientes";
import type { Ok } from "./proyectos";

export type AjustesEconomia = {
  razonSocial: string | null;
  cif: string | null;
  direccion: string | null;
  costeHoraCentimos: number;
};

export type EntradaAjustes = AjustesEconomia;

const limpia = (s: string | null) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Puro. Una acción de servidor es un endpoint público: se valida aquí, no en el formulario. */
export function validarAjustes(e: EntradaAjustes): Ok {
  if (!Number.isInteger(e.costeHoraCentimos) || e.costeHoraCentimos < 0) {
    return { ok: false, error: "El coste de la hora tiene que ser un importe de cero o más." };
  }
  if (e.costeHoraCentimos > 99_999_999) {
    return { ok: false, error: "El coste de la hora no cabe en la base." };
  }
  return { ok: true };
}

export async function leerAjustes(sb: Sb): Promise<AjustesEconomia> {
  const { data, error } = await sb
    .from("ajustes_economia")
    .select("razon_social, cif, direccion, coste_hora")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  // RLS devuelve cero filas al colaborador. Lanzar y no devolver ceros: unos
  // ceros parecerían «no configurado» y no «no tienes permiso».
  if (!data) throw new Error("No hay configuración económica visible para este usuario.");
  return {
    razonSocial: data.razon_social,
    cif: data.cif,
    direccion: data.direccion,
    // numeric(8,2) → céntimos, una sola vez.
    costeHoraCentimos: Math.round(Number(data.coste_hora) * 100),
  };
}

export async function escribirAjustes(sb: Sb, e: EntradaAjustes): Promise<Ok> {
  const valido = validarAjustes(e);
  if (!valido.ok) return valido;
  const { data, error } = await sb
    .from("ajustes_economia")
    .update({
      razon_social: limpia(e.razonSocial),
      cif: limpia(e.cif),
      direccion: limpia(e.direccion),
      coste_hora: e.costeHoraCentimos / 100,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  return { ok: true };
}
