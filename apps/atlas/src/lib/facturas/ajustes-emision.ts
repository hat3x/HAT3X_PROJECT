// La puerta de emisión (§7): todo lo que hace falta tener puesto ANTES de
// poder emitir una factura fiscal. Sigue el patrón de
// `lib/descubrir/ajustes.ts` — cada fallo nombra qué falta y dónde ponerlo, en
// vez de un `undefined` que no explica nada.
//
// No filtra por rol «a mano» más allá del primer mensaje: la única excepción
// deliberada es esa, porque sin ella el colaborador vería «falta el CIF» en
// vez de «no tienes permiso», y eso confundiría configuración con permiso.
// De ahí para abajo, quien decide es RLS: `leerAjustes` lanza si no hay fila
// visible, y aquí se captura.
import type { Sb } from "../db/clientes";
import { obtenerPerfil } from "../db/perfil";
import { leerAjustes } from "../db/ajustes-economia";

export type AjustesEmision = {
  razonSocial: string;
  cif: string;
  direccion: string;
  credencialFirmaId: string;
  validadoGestoria: boolean;
};

/** Proveedor y etiqueta de la credencial de firma en el llavero. Global: `proyecto_id` null, como el resto de credenciales de Atlas mismo. */
export const PROVEEDOR_FIRMA = "AEAT";
export const ETIQUETA_FIRMA = "firma";

export type ResultadoAjustesEmision =
  | { ok: true; ajustes: AjustesEmision }
  | { ok: false; error: string };

export async function ajustesDeEmision(sb: Sb): Promise<ResultadoAjustesEmision> {
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede emitir facturas." };
  }

  let datos;
  try {
    datos = await leerAjustes(sb);
  } catch {
    // El propietario ya está confirmado arriba; si aun así `leerAjustes`
    // lanza, RLS está negando algo que no debería (p.ej. una política mal
    // desplegada). Es un error de permiso, no de configuración: no tiene
    // sentido decir «rellena el CIF» cuando el problema es que no se puede
    // ni leer la fila.
    return { ok: false, error: "No tienes permiso para leer la configuración económica." };
  }

  if (!datos.razonSocial) {
    return {
      ok: false,
      error: "Falta la razón social del emisor: rellénala en Ajustes → Economía.",
    };
  }
  if (!datos.cif) {
    return { ok: false, error: "Falta el CIF del emisor: rellénalo en Ajustes → Economía." };
  }
  if (!datos.direccion) {
    return {
      ok: false,
      error: "Falta la dirección del emisor: rellénala en Ajustes → Economía.",
    };
  }

  const { data: credencial, error } = await sb
    .from("credenciales")
    .select("id")
    .is("proyecto_id", null)
    .eq("proveedor", PROVEEDOR_FIRMA)
    .eq("etiqueta", ETIQUETA_FIRMA)
    .maybeSingle();
  if (error) throw error;
  if (!credencial) {
    return {
      ok: false,
      error: `No hay en el llavero una credencial «${PROVEEDOR_FIRMA} / ${ETIQUETA_FIRMA}»: genérala en Ajustes → Economía.`,
    };
  }

  return {
    ok: true,
    ajustes: {
      razonSocial: datos.razonSocial,
      cif: datos.cif,
      direccion: datos.direccion,
      credencialFirmaId: credencial.id,
      validadoGestoria: datos.validadoGestoria,
    },
  };
}
