/**
 * Feature flags — capabilities gated on the Salon OS backend.
 *
 * The customer app was originally built against a backend that had marketing,
 * subscription (Stripe) and RBAC/admin tables. The current Salon OS schema
 * (project `jztoyekixcziaicrnlce`) does NOT contain those tables, so the screens
 * that depend on them are disabled to avoid runtime errors and dead navigation.
 *
 * Each flag is `false` until the matching backend is provisioned. Flipping a flag
 * on its own is not enough to bring a screen back — follow the re-enable checklist.
 *
 * ── Disabled capabilities & their missing tables ────────────────────────────────
 *   subscriptions  → Club (/club) + Premium (/premium)   · needs `subscriptions`
 *   promos         → Promos feed (/promos)                · needs `campaigns`
 *   admin          → Admin area (/admin/*) + API Keys     · needs `user_roles`, `api_keys`
 *
 * ── Re-enable checklist (per capability) ────────────────────────────────────────
 *   1. Create the table(s) above in Salon OS (+ RLS) and regenerate
 *      `src/integrations/supabase/types.ts`.
 *   2. Set the flag below to `true`.
 *   3. In `src/App.tsx`, restore the lazy import + protected <Route> and remove the
 *      legacy redirect for that path.
 *   4. Re-surface the entry points guarded by this flag (Home quick-actions,
 *      Profile admin section).
 *
 * The page components themselves are kept intact under `src/pages/` (Club,
 * PremiumBenefits, Promos, admin/ApiKeys) and are simply unreachable while disabled.
 */
export const FEATURES = {
  /** Club / Premium subscriptions (Stripe). Requires the `subscriptions` table. */
  subscriptions: false,
  /** Promos feed driven by staff campaigns. Requires the `campaigns` table. */
  promos: false,
  /** Admin area + API keys. Requires `user_roles` (RBAC) and `api_keys`. */
  admin: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;
