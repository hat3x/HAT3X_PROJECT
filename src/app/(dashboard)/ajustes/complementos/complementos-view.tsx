import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Blocks,
  CheckCircle2,
  CreditCard,
  Headset,
  Info,
  Lock,
  PauseCircle,
  Smartphone,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SalonFeature } from "@/types/database";

/** Correo de soporte de HAT3X para gestionar (alta/baja) de complementos. */
const HAT3X_CONTACT_EMAIL = "info@hat3x.com";

/** Estado de un add-on de cara a la UI, derivado del mapa `feature → enabled`. */
type AddonStatus = "active" | "paused" | "not_contracted";

interface AddonMeta {
  feature: SalonFeature;
  /** Nombre comercial mostrado (español). */
  name: string;
  /** Qué aporta el add-on, en una línea. */
  description: string;
  /** Icono representativo del add-on. */
  Icon: LucideIcon;
}

/**
 * Catálogo de add-ons contratables, EN EL MISMO ORDEN que el enum `public.salon_feature`
 * (loyalty · client_app · staff_app · ai_receptionist · pos), que a su vez coincide con
 * el orden pedido: fidelización · app de cliente · app de personal · recepcionista IA ·
 * TPV. Es la única fuente de la presentación; el estado se cruza en runtime.
 */
const ADDONS: readonly AddonMeta[] = [
  {
    feature: "loyalty",
    name: "Fidelización",
    description: "Puntos, cupones y recompensas para tus clientes.",
    Icon: Sparkles,
  },
  {
    feature: "client_app",
    name: "App de cliente",
    description: "PWA de reservas, QR y cartilla de puntos.",
    Icon: Smartphone,
  },
  {
    feature: "staff_app",
    name: "App de personal",
    description: "PWA de agenda y check-in para tu equipo.",
    Icon: UsersRound,
  },
  {
    feature: "ai_receptionist",
    name: "Recepcionista IA",
    description: "Atención telefónica automatizada, día y noche.",
    Icon: Headset,
  },
  {
    feature: "pos",
    name: "TPV",
    description: "Punto de venta: tickets, cobros y facturación.",
    Icon: CreditCard,
  },
];

interface StatusMeta {
  /** Etiqueta TEXTUAL del estado (nunca solo color: accesible por lectores de pantalla). */
  label: string;
  badgeVariant: BadgeProps["variant"];
  /** Icono del estado dentro de la badge. */
  StatusIcon: LucideIcon;
  /** Tinte del chip del icono del add-on según esté (o no) contratado. */
  chipClassName: string;
  /** Realce opcional del contenedor de la tarjeta. */
  cardClassName?: string;
}

const STATUS_META: Record<AddonStatus, StatusMeta> = {
  active: {
    label: "Contratado",
    badgeVariant: "default",
    StatusIcon: CheckCircle2,
    chipClassName: "border-primary/15 bg-accent text-primary",
  },
  paused: {
    label: "En pausa",
    badgeVariant: "secondary",
    StatusIcon: PauseCircle,
    // Contratado (por eso mantiene el tinte de marca), pero suspendido.
    chipClassName: "border-primary/15 bg-accent text-primary",
  },
  not_contracted: {
    label: "No contratado",
    badgeVariant: "outline",
    StatusIcon: Lock,
    // Atenuado —sin bajar el contraste del texto— para distinguir de un vistazo lo que
    // el salón NO tiene, sin ocultarlo (se ofrece como complemento disponible).
    chipClassName: "border-border/70 bg-muted text-muted-foreground",
    cardClassName: "bg-muted/25",
  },
};

/** Deriva el estado de UI a partir del mapa de entitlements (ausencia = no contratado). */
function statusOf(
  features: ReadonlyMap<SalonFeature, boolean>,
  feature: SalonFeature,
): AddonStatus {
  const enabled = features.get(feature);
  if (enabled === undefined) return "not_contracted";
  return enabled ? "active" : "paused";
}

interface ComplementosViewProps {
  /** Entitlements del salón activo (`feature → enabled`); ver `listSalonFeatures`. */
  features: ReadonlyMap<SalonFeature, boolean>;
  /**
   * Nombre de la recepcionista IA vinculada (p. ej. "Sara"), o `null` si el add-on
   * `ai_receptionist` no está activo / sin nombre. Ver `getReceptionistName`. Solo se
   * muestra en la tarjeta de Recepcionista IA cuando está contratada y activa, para
   * VERIFICAR de un vistazo que la recepcionista vinculada es la correcta.
   */
  receptionistName?: string | null;
}

/**
 * Rejilla de SOLO CONSULTA de los add-ons del salón. Componente de servidor sin estado ni
 * interactividad: cada tarjeta muestra el add-on, una descripción breve y una badge de
 * estado (contratado / en pausa / no contratado). No hay ningún control de activación —
 * los complementos se contratan y gestionan con HAT3X (nota al pie).
 */
export function ComplementosView({
  features,
  receptionistName = null,
}: ComplementosViewProps): React.ReactElement {
  const contractedCount = ADDONS.filter(
    (addon) => statusOf(features, addon.feature) !== "not_contracted",
  ).length;

  return (
    <div>
      <SectionHeader
        icon={Blocks}
        title="Complementos"
        description="Los add-ons que tu salón tiene contratados con HAT3X. Esta vista es solo de consulta."
      />

      <p className="mb-5 animate-fade-up text-sm text-muted-foreground [animation-delay:30ms]">
        <span className="font-medium text-foreground">
          {contractedCount} de {ADDONS.length}
        </span>{" "}
        complementos contratados.
      </p>

      <ul
        role="list"
        className="grid animate-fade-up gap-4 [animation-delay:60ms] sm:grid-cols-2"
      >
        {ADDONS.map(({ feature, name, description, Icon }) => {
          const status = statusOf(features, feature);
          const meta = STATUS_META[status];
          const { StatusIcon } = meta;

          return (
            <li key={feature}>
              <div
                className={cn(
                  "flex h-full flex-col gap-4 rounded-xl border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-5 shadow-xs",
                  meta.cardClassName,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-xs",
                      meta.chipClassName,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <Badge variant={meta.badgeVariant} className="gap-1">
                    <StatusIcon className="h-3 w-3" aria-hidden="true" />
                    {meta.label}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <h3 className="font-semibold tracking-tight">{name}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>

                {feature === "ai_receptionist" &&
                status === "active" &&
                receptionistName ? (
                  <div className="mt-auto flex items-center gap-2 rounded-lg border border-primary/15 bg-accent/60 px-3 py-2 text-sm">
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">
                      Recepcionista vinculada:{" "}
                      <span className="font-semibold text-foreground">
                        {receptionistName}
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex animate-fade-up items-start gap-3 rounded-xl border border-border/70 bg-muted/30 p-4 [animation-delay:120ms]">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground shadow-xs"
        >
          <Info className="h-4 w-4" />
        </span>
        <div className="space-y-1 text-sm">
          <p className="font-medium">Los complementos se gestionan con HAT3X</p>
          <p className="text-muted-foreground">
            El alta, la baja y la activación de cada complemento las realiza HAT3X;
            no pueden cambiarse desde el panel. Para contratar o modificar un
            complemento, escribe a{" "}
            <a
              href={`mailto:${HAT3X_CONTACT_EMAIL}`}
              className="font-medium text-foreground underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
            >
              {HAT3X_CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
