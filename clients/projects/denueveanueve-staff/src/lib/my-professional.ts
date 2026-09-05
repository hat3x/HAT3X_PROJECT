/**
 * «¿Qué profesional soy?» — resolución PURA del vínculo cuenta↔ficha.
 *
 * El vínculo vive en `professionals.user_id` (uuid nullable con FK a `auth.users`). Un
 * índice único parcial `(salon_id, user_id)` garantiza que dentro de un salón la respuesta
 * es única, así que basta con la primera coincidencia.
 *
 * Devuelve null cuando no hay sesión, cuando la cuenta no tiene ficha (owner o manager que
 * no atiende), o cuando el vínculo aún no se ha poblado. En todos esos casos la pantalla
 * cae al selector, que sigue siendo el comportamiento correcto para quien ve varias agendas.
 */
export function findMyProfessionalId(
  professionals: ReadonlyArray<{ id: string; userId: string | null }>,
  userId: string | null,
): string | null {
  if (userId === null) return null;
  return professionals.find((p) => p.userId === userId)?.id ?? null;
}
