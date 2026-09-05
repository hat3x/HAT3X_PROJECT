/**
 * GET /api/reception/opening-hours
 *
 * Endpoint del RECEPCIONISTA IA: devuelve el HORARIO DE APERTURA del salón
 * (`salon_opening_hours`). Permite que la recepcionista de voz anuncie el horario
 * REAL del negocio sin tenerlo hardcodeado en su prompt, de modo que un cambio de
 * horario en el panel lo refleje sola.
 *
 *   · Authn + entitlement — {@link withReceptionGuard} resuelve `x-api-key → salón`
 *     y exige el add-on `ai_receptionist`. El `salonId` que llega es de fiar y ES
 *     LO QUE ACOTA la consulta (aislamiento cross-tenant).
 *   · Salida — `{ hours: [{ weekday, start_time, end_time }] }` (weekday 0=domingo…6=sábado,
 *     horas `HH:MM:SS` en la zona del salón). `hours` vacío = sin horario configurado.
 *
 * La lógica vive en el módulo hermano `./handler`.
 */
import { withReceptionGuard } from "@/lib/reception";

import { handleReceptionOpeningHours } from "./handler";

/** Horario vivo y autenticado: nunca cachear. */
export const dynamic = "force-dynamic";

export const GET = withReceptionGuard((_request, { salonId }) =>
  handleReceptionOpeningHours(salonId),
);
