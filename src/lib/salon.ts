// Identificación del salón (Salón OS · multi-tenant).
// La app de cliente de denueveanueve es mono-salón: todas las lecturas "self"
// (customers, loyalty_accounts, welcome_coupons, rewards, points_movements) se
// filtran además por `salon_id = SALON_ID`, coherente con las FKs compuestas
// (id, salon_id) del esquema y como defensa en profundidad sobre las RLS.
//
// El valor se lee de VITE_SALON_ID (ver .env.example). Slug informativo aparte.
const SALON_ID_RAW = import.meta.env.VITE_SALON_ID as string | undefined;

if (!SALON_ID_RAW) {
  // Fallo temprano y claro en vez de queries silenciosamente vacías por un
  // filtro `salon_id = undefined`.
  throw new Error(
    'Falta la variable de entorno VITE_SALON_ID. Defínela en tu archivo .env ' +
      '(consulta .env.example).'
  );
}

/** UUID del salón denueveanueve en Salón OS. */
export const SALON_ID: string = SALON_ID_RAW;

/** Slug público del salón (opcional; informativo). */
export const SALON_SLUG: string =
  (import.meta.env.VITE_SALON_SLUG as string | undefined) ?? 'denueveanueve';
