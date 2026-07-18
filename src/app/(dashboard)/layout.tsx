import { SalonBrandStyle } from "@/components/branding/salon-brand-theme";
import { DashboardNav } from "@/components/dashboard-nav";
import { QueryProvider } from "@/components/providers/query-provider";
import { canManageSettings, getActiveMembership, getActiveSalon } from "@/lib/salon";
import { getActiveSalonBranding } from "@/lib/salon-branding/server";
import { BRAND_SCOPE_ATTR } from "@/lib/salon-branding/theme";

/**
 * Layout compartido de las rutas autenticadas del panel.
 * Envuelve el árbol en el provider de TanStack Query y añade la navegación
 * principal (barra superior premium con glass, jerarquía y responsive real).
 *
 * Tematizado white-label (sub-3): carga la marca del salón activo en SERVIDOR y la
 * pinta en el subárbol del panel — el color primario tiñe acentos (botones, anillo de
 * foco, estados) vía variables CSS acotadas a `[data-salon-brand]`, y el logo sustituye
 * a la marca genérica en la cabecera. Sin marca configurada, `SalonBrandStyle` no
 * inyecta nada y manda el tema premium por defecto: [[salon-branding-server]].
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const [membership, salon, branding] = await Promise.all([
    getActiveMembership(),
    getActiveSalon(),
    getActiveSalonBranding(),
  ]);
  const showSettings = canManageSettings(membership?.role);

  return (
    <QueryProvider>
      <SalonBrandStyle branding={branding} />
      <div {...{ [BRAND_SCOPE_ATTR]: "" }} className="flex min-h-screen flex-col">
        <DashboardNav
          brandName={salon?.name ?? null}
          logoUrl={branding?.logo_url ?? null}
          role={membership?.role ?? null}
          showSettings={showSettings}
        />
        <div className="flex-1">{children}</div>
      </div>
    </QueryProvider>
  );
}
