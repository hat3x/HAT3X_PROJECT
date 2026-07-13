/**
 * Salon OS usa login por ID + contraseña (sin email de cara al usuario).
 * Supabase Auth necesita un email internamente, así que derivamos uno sintético
 * a partir del ID. Nunca se envía ningún correo a este dominio.
 *
 * DEBE coincidir con el dominio usado al provisionar credenciales (admin API).
 */
const SYNTHETIC_EMAIL_DOMAIN = "salonos.app";

export function idToEmail(id: string): string {
  return `${id.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
