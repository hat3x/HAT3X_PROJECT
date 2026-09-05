import { SalonBrandStyle } from "@/components/branding/salon-brand-theme";
import { AppSidebar } from "@/components/app-sidebar";
import { SalonFeaturesProvider } from "@/components/providers/salon-features-provider";
import { SectorProvider } from "@/components/providers/sector-provider";
import {
  canManageSettings,
  getActiveMembership,
  getActiveSalon,
  getActiveSalonFeatureFlags,
} from "@/lib/salon";
import { buildLogoSrc } from "@/lib/salon-branding/branding";
import { getActiveSalonBranding } from "@/lib/salon-branding/server";
import { BRAND_SCOPE_ATTR } from "@/lib/salon-branding/theme";
import { canEnterSettings } from "@/lib/settings/access";

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
  // DOS permisos distintos, y por eso dos banderas.
  //
  // `showSettings` es solo el enlace a Ajustes: `staff` entra, porque dentro
  // tiene secciones suyas (su horario, gabinetes, apariencia).
  //
  // `showManagement` es la analítica, la facturación y el arqueo: dinero del
  // negocio, owner/manager. Las dos eran la MISMA bandera, así que abrir
  // Ajustes a staff destapó también las cuentas de la clínica.
  const showSettings = canEnterSettings(membership?.role);
  const showManagement = canManageSettings(membership?.role);
  const sector = salon?.sector ?? "peluqueria";

  return (
    <>
      <SalonBrandStyle branding={branding} sector={sector} />
      <SalonFeaturesProvider flags={featureFlags}>
        <SectorProvider sector={sector}>
          <div
            {...{ [BRAND_SCOPE_ATTR]: "" }}
            className="relative isolate flex min-h-screen flex-col lg:flex-row"
          >
            {/* Aurora: glows suaves (derivados de la marca) detrás de la chrome
                glass. El contenido va por encima (z-10). */}
            <div className="kairos-aurora" aria-hidden="true" />
            <AppSidebar
              brandName={salon?.name ?? null}
              logoUrl={buildLogoSrc(branding)}
              role={membership?.role ?? null}
              showSettings={showSettings}
              showManagement={showManagement}
            />
            <main className="relative z-10 min-w-0 flex-1">{children}</main>
          </div>
        </SectorProvider>
      </SalonFeaturesProvider>
    </>
  );
}
