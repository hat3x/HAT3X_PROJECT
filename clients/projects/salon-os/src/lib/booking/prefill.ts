/**
 * Precarga «best-effort» del asistente de reserva pública (sub-6). USO EXCLUSIVO DE
 * SERVIDOR: se invoca desde el Server Component `/reservar/[slug]` (page.tsx).
 *
 * Si quien abre la página es un cliente AUTENTICADO con ficha en ESTE salón, devuelve
 * sus datos de perfil ya con la forma del formulario ({@link BookingPrefill}) para
 * sembrar el paso «Tus datos» y que no reescriba lo que el salón ya sabe de él. Gracias
 * a la identidad por teléfono (sub-1), reservar con ese teléfono REUTILIZA su ficha.
 *
 * CONTRATO CLAVE — nunca romper la reserva: la precarga es una comodidad, jamás un
 * requisito. Por eso esta función:
 *   · devuelve `null` para el visitante ANÓNIMO (el caso común de una página pública), y
 *   · ATRAPA cualquier fallo de la lectura self y también devuelve `null`.
 * Es el único sitio donde se «traga» el error a propósito: aquí la ausencia de precarga
 * degrada con elegancia (el usuario teclea sus datos, como siempre), mientras que la
 * primitiva `getMyCustomerForSalon` mantiene su contrato honesto (propaga el 500).
 *
 * Aislamiento heredado de la lectura self: RLS `self_select_own_customer`
 * (`user_id = auth.uid()`) + filtro por `salon_id`. Imposible precargar datos de otra
 * cuenta o de otro salón.
 */
import type { BookingPrefill } from "@/lib/booking/types";
import { getMyCustomerForSalon } from "@/lib/customers/account";

/**
 * Datos de precarga del cliente autenticado para `salonId`, o `null` si no hay nada que
 * precargar (anónimo, sin ficha en el salón) o si la lectura falla (degradación elegante).
 * Nunca lanza.
 */
export async function resolveBookingPrefill(
  salonId: string,
): Promise<BookingPrefill | null> {
  try {
    const customer = await getMyCustomerForSalon(salonId);
    if (customer === null) return null;

    return {
      fullName: customer.full_name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      marketingConsent: customer.marketing_consent,
    };
  } catch {
    // Best-effort: un fallo al precargar NUNCA debe impedir reservar. Se degrada a
    // «sin precarga» (el formulario arranca vacío) en lugar de romper la página.
    return null;
  }
}
