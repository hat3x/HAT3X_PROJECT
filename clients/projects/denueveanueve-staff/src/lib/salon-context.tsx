import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { resolveSalonSlugFromLocation, type SalonBranding } from '@/lib/salon';
import { fetchSalonBranding } from '@/lib/salon-branding';
import { deriveSalonTheme } from '@/lib/theme';
import { applySalonPwaBranding } from '@/lib/pwa-manifest';
import { SalonSplash } from '@/components/staff/SalonSplash';
import { SalonUnavailable } from '@/components/staff/SalonUnavailable';

// Contexto del salón resuelto en runtime. Como SalonProvider NO renderiza a sus hijos
// hasta que el salón resuelve con ÉXITO, dentro del árbol el salón SIEMPRE existe: por
// eso el valor del contexto es la marca completa (no nullable) + el salon_id derivado.
export type SalonContextValue = SalonBranding & {
  /** salon_id efectivo de la app, DERIVADO del salón resuelto (no de VITE_SALON_ID). */
  salonId: string;
};

const SalonContext = createContext<SalonContextValue | null>(null);

/**
 * Resuelve el salón (slug → RPC get_salon_branding) y hace de PUERTA de la app:
 *   · loading            → splash a pantalla completa,
 *   · error de red/SQL   → pantalla de error 'network' (reintentable),
 *   · RPC vacía (no hay) → pantalla de error 'not-found' (slug inexistente/inactivo),
 *   · éxito              → provee el salón y renderiza a los hijos.
 * De este modo el resto de la app (auth incluida) solo se monta con un salón válido.
 */
export function SalonProvider({ children }: { children: ReactNode }) {
  // El slug se resuelve UNA vez desde la URL (subdominio > ?salon= > VITE_SALON_SLUG).
  // No cambia en toda la vida de la app: el salón lo fija el dominio por el que se entra.
  const slug = useMemo(() => resolveSalonSlugFromLocation(), []);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['salon-branding', slug],
    queryFn: () => fetchSalonBranding(slug),
    staleTime: Infinity, // la marca del salón no cambia dentro de una sesión
    gcTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Aplica la marca del salón resuelto: título, tokens de color y marca PWA. Efecto
  // idempotente y guardado (solo actúa con datos) y REVERSIBLE al desmontar.
  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;

    // Título del documento.
    const previousTitle = document.title;
    document.title = `${data.name} · Staff`;

    // Color de marca → design tokens de Tailwind (primary/accent/gold/…). Si el hex no es
    // válido, deriveSalonTheme devuelve null y se conserva el tema por defecto de index.css.
    const themeVars = deriveSalonTheme(data.primaryColor);
    if (themeVars) {
      for (const [token, value] of Object.entries(themeVars)) {
        root.style.setProperty(token, value);
      }
    }

    // Marca PWA en runtime (manifest por-tenant + theme-color + apple-touch-icon).
    const restorePwa = applySalonPwaBranding({
      name: data.name,
      primaryColor: data.primaryColor,
      logoUrl: data.logoUrl,
    });

    return () => {
      document.title = previousTitle;
      if (themeVars) {
        // Quita los overrides inline → vuelve al tema por defecto de index.css.
        for (const token of Object.keys(themeVars)) root.style.removeProperty(token);
      }
      restorePwa();
    };
  }, [data]);

  if (isLoading) {
    return <SalonSplash message="Cargando salón…" />;
  }

  // Error de red/SQL de la RPC: distinto de "no encontrado"; permite reintentar.
  if (isError) {
    return (
      <SalonUnavailable variant="network" slug={slug} onRetry={() => void refetch()} busy={isFetching} />
    );
  }

  // La RPC respondió VACÍO: el slug no existe o el salón está inactivo. Error controlado.
  if (!data) {
    return (
      <SalonUnavailable variant="not-found" slug={slug} onRetry={() => void refetch()} busy={isFetching} />
    );
  }

  const value: SalonContextValue = { ...data, salonId: data.id };
  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>;
}

/**
 * Acceso al salón resuelto. Lanza si se usa fuera de <SalonProvider>. Dentro del árbol
 * de la app el salón está garantizado (el provider hace de puerta), así que devuelve
 * un valor no nullable.
 */
export function useSalon(): SalonContextValue {
  const ctx = useContext(SalonContext);
  if (!ctx) throw new Error('useSalon debe usarse dentro de <SalonProvider>');
  return ctx;
}

/** Azúcar para consumidores que solo necesitan el salon_id del salón resuelto. */
export function useSalonId(): string {
  return useSalon().salonId;
}
