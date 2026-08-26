// <SalonProvider> — resuelve el salón en runtime y bloquea el árbol hasta tenerlo.
//
// Flujo:
//   1) Resuelve el slug con la función PURA resolveSalonSlug() a partir del host
//      y la URL reales (subdominio > ?salon > VITE_SALON_SLUG).
//   2) Carga el branding vía la RPC pública get_salon_branding (react-query).
//   3) Mientras carga → pantalla de carga; si falla o no hay salón → pantalla de
//      error CONTROLADA (sin pantallazo en blanco); si resuelve → expone el
//      branding por contexto (useSalon), del que se DERIVA salon_id.
//
// Se monta por encima de las rutas (ver App.tsx) para que el tema white-label
// esté disponible ANTES del login, tal y como diseña la RPC de branding.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { resolveSalonSlug, type SalonBranding } from '@/lib/salon';
import { fetchSalonBranding } from '@/lib/salon-branding';
import { resolveBrandTheme } from '@/lib/salon-theme';

const SalonContext = createContext<SalonBranding | null>(null);

/**
 * Devuelve el salón resuelto (branding + `id`). Sólo es válido dentro de
 * <SalonProvider>, que garantiza que a esta altura el salón YA está cargado.
 * Deriva `salon_id` de aquí: `const { id: salonId } = useSalon()`.
 */
export const useSalon = (): SalonBranding => {
  const ctx = useContext(SalonContext);
  if (!ctx) throw new Error('useSalon() debe usarse dentro de <SalonProvider>.');
  return ctx;
};

/** Pantalla de carga (mismo estilo que el PageLoader de App.tsx). */
const SalonLoading = () => {
  const { t } = useI18n();
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-sm text-muted-foreground">{t('salon.loading')}</p>
    </div>
  );
};

/**
 * Pantalla de error CONTROLADA. Dos variantes:
 *   · 'not-found' → slug sin salón (inexistente/inactivo) o sin slug resuelto.
 *   · 'error'     → la RPC falló (red/servidor); reintentable.
 */
const SalonError = ({
  variant,
  onRetry,
}: {
  variant: 'not-found' | 'error';
  onRetry: () => void;
}) => {
  const { t } = useI18n();
  const title = variant === 'not-found' ? t('salon.error.notFoundTitle') : t('salon.error.connTitle');
  const body = variant === 'not-found' ? t('salon.error.notFoundBody') : t('salon.error.connBody');
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6" role="alert">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="mb-2 font-display text-2xl text-foreground">{title}</h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg gradient-gold px-6 text-sm font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('general.retry')}
        </button>
      </div>
    </div>
  );
};

export const SalonProvider = ({ children }: { children: ReactNode }) => {
  // Resolución PURA del slug con el host/URL reales (una vez por carga).
  const slug = useMemo(
    () =>
      resolveSalonSlug({
        hostname: window.location.hostname,
        search: window.location.search,
        // Fallback de último recurso: VITE_SALON_SLUG. Sin cablear ningún salón por
        // defecto — si no hay subdominio, ni ?salon, ni esta variable, el árbol cae
        // a la pantalla "salón no encontrado" (comportamiento white-label correcto).
        envSlug: (import.meta.env.VITE_SALON_SLUG as string | undefined) ?? null,
      }).slug,
    []
  );

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['salon-branding', slug],
    queryFn: () => fetchSalonBranding(slug as string),
    enabled: !!slug,
    staleTime: Infinity, // el branding es estable durante la sesión
    gcTime: Infinity,
    retry: 1,
  });

  // Tema white-label: deriva el color de marca del salón a los tokens de acento del
  // tema (familia --gold/--primary/--ring, --accent, gradiente y sombra) y ELIGE el
  // color de texto sobre el acento por CONTRASTE WCAG AA real (--primary-foreground /
  // --accent-foreground), de modo que un acento claro u oscuro siempre quede legible.
  // También titula la pestaña con el nombre del salón. Así el acento es el del salón
  // resuelto en runtime, no un color cableado. Si el primario no es un hex válido,
  // resolveBrandTheme devuelve null ⇒ no tocamos ninguna variable y manda el tema
  // dorado por defecto de index.css (fallback limpio, sin pantallazos ni regresión).
  useEffect(() => {
    if (!data) return;
    const root = document.documentElement;
    const theme = resolveBrandTheme(data);
    if (theme) {
      // Espeja el acento en los tokens del sidebar (back-office) para que, si se
      // reactiva el área admin, también siga a la marca del salón resuelto.
      const vars = {
        ...theme,
        '--sidebar-primary': theme['--primary'],
        '--sidebar-ring': theme['--primary'],
      };
      for (const [token, value] of Object.entries(vars)) {
        root.style.setProperty(token, value);
      }
    }
    // Alinea el color de la barra del navegador/PWA con la marca del salón.
    if (data.primaryColor) {
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', data.primaryColor);
    }
    if (data.name) document.title = data.name;
  }, [data]);

  // Sin slug → nada que resolver (recargar por si cambió el host/URL).
  if (!slug) return <SalonError variant="not-found" onRetry={() => window.location.reload()} />;
  if (isPending) return <SalonLoading />;
  // RPC con error de red/servidor → error de conexión, reintentable.
  if (isError) return <SalonError variant="error" onRetry={() => refetch()} />;
  // Slug resuelto pero la RPC no trae salón (inexistente/inactivo) → no encontrado.
  if (!data) return <SalonError variant="not-found" onRetry={() => refetch()} />;

  return <SalonContext.Provider value={data}>{children}</SalonContext.Provider>;
};
