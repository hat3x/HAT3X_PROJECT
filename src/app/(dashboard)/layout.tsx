import { SalonBrandStyle } from "@/components/branding/salon-brand-theme";
import { DashboardNav } from "@/components/dashboard-nav";
import { QueryProvider } from "@/components/providers/query-provider";
import { SalonFeaturesProvider } from "@/components/providers/salon-features-provider";
import {
  canManageSettings,
  getActiveMembership,
  getActiveSalon,
  getActiveSalonFeatureFlags,
} from "@/lib/salon";
import { getActiveSalonBranding } from "@/lib/salon-branding/server";
import { BRAND_SCOPE_ATTR } from "@/lib/salon-branding/theme";

/**
 * Layout compartido de las rutas autenticadas del panel.
 * Envuelve el árbol en el provider de TanStack Query y añade la navegación
 * principal (barra superior premium con glass, jerarquía y responsive real).
 *
 * Tematizado white-label: carga la marca del salón activo en SERVIDOR y la
 * pinta en el subárbol del panel — el color primario tiñe acentos (botones, anillo de
 * foco, estados) vía variables CSS acotadas a `[data-salon-brand]`, y el logo sustituye
 * a la marca genérica en la cabecera. Sin marca configurada, `SalonBrandStyle` no
 * inyecta nada y manda el tema premium por defecto: [[salon-branding-server]].
 *
 * Gating por entitlements: resuelve el snapshot de add-ons del salón activo en SERVIDOR
 * (`getActiveSalonFeatureFlags`) y lo siembra en `SalonFeaturesProvider`, para que el
 * árbol cliente pueda ocultar módulos de pago (Facturación, gráficas de ingresos) cuando
 * falta `pos` (TPV) sin refetch — dejando visible la analítica de gestión. Presentación:
 * el gate de datos sigue vivo en el servidor de cada dominio.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const [membership, salon, branding, featureFlags] = await Promise.all([
    getActiveMembership(),
    getActiveSalon(),
    getActiveSalonBranding(),
    getActiveSalonFeatureFlags(),
  ]);
  const showSettings = canManageSettings(membership?.role);

  return (
    <QueryProvider>
      <SalonBrandStyle branding={branding} />
      <SalonFeaturesProvider flags={featureFlags}>
        <div {...{ [BRAND_SCOPE_ATTR]: "" }} className="flex min-h-screen flex-col">
          <DashboardNav
            brandName={salon?.name ?? null}
            logoUrl={branding?.logo_url ?? null}
            role={membership?.role ?? null}
            showSettings={showSettings}
          />
          <div className="flex-1">{children}</div>
        </div>
      </SalonFeaturesProvider>
    </QueryProvider>
  );
}
