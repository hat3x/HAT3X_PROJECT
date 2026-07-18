"use server";

import {
  BrandingError,
  removeActiveSalonLogo,
  updateActiveSalonColors,
  uploadActiveSalonLogo,
  type SalonBranding,
  type SalonColorsInput,
} from "@/lib/salon-branding/server";

/** Resultado tipado de un Server Action de la marca del salón. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Traduce cualquier fallo a un `ActionResult` con mensaje LEGIBLE. Los
 * `BrandingError` (401/403/400/404) ya traen un mensaje pensado para el usuario
 * —incluida la denegación de permiso «No tienes permiso para editar la marca del
 * salón.»—; cualquier otro error se registra en servidor y se opaca con un
 * mensaje genérico para no filtrar detalles internos.
 */
function toErrorResult(error: unknown): { ok: false; error: string } {
  if (error instanceof BrandingError) {
    return { ok: false, error: error.message };
  }
  console.error("[ajustes/marca] error inesperado", error);
  return {
    ok: false,
    error: "No se pudo completar la operación. Inténtalo de nuevo.",
  };
}

/**
 * Guarda los colores de marca (principal y, opcionalmente, de acento) del salón
 * activo. La validación de hex y la revalidación de rutas viven en la capa de
 * datos ({@link updateActiveSalonColors}); aquí solo envolvemos el resultado en
 * el `ActionResult` que consume el formulario.
 *
 * Defensa en profundidad: el guard de ruta del layout ya exige owner/manager;
 * la capa de datos vuelve a exigir el rol y RLS es la última línea.
 */
export async function saveSalonColors(
  input: SalonColorsInput,
): Promise<ActionResult<SalonBranding>> {
  try {
    return { ok: true, data: await updateActiveSalonColors(input) };
  } catch (error) {
    return toErrorResult(error);
  }
}

/**
 * Sube o REEMPLAZA el logo del salón activo. Recibe el `File` del formulario,
 * lee sus bytes y delega en {@link uploadActiveSalonLogo}, que valida MIME y
 * tamaño en servidor (≤ 2 MiB) y persiste la URL pública. Revalida las rutas de
 * marca.
 */
export async function saveSalonLogo(
  file: File,
): Promise<ActionResult<SalonBranding>> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecciona un archivo de imagen para el logo." };
  }
  try {
    const { branding } = await uploadActiveSalonLogo({
      data: await file.arrayBuffer(),
      contentType: file.type,
    });
    return { ok: true, data: branding };
  } catch (error) {
    return toErrorResult(error);
  }
}

/**
 * Quita el logo del salón activo (borra los objetos del bucket y pone
 * `logo_url = null`). Revalida. Devuelve la fila resultante, o `null` si el
 * salón aún no tenía marca personalizada.
 */
export async function deleteSalonLogo(): Promise<
  ActionResult<SalonBranding | null>
> {
  try {
    return { ok: true, data: await removeActiveSalonLogo() };
  } catch (error) {
    return toErrorResult(error);
  }
}
