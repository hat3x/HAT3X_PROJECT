"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ImageOff, Palette, RefreshCw, Trash2, Upload } from "lucide-react";

import { SaveStatus } from "@/app/(dashboard)/ajustes/save-status";
import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useRemoveSalonLogo,
  useSaveSalonColors,
  useUploadSalonLogo,
} from "@/hooks/use-salon-branding";
import {
  ALLOWED_LOGO_MIME_TYPES,
  DEFAULT_PRIMARY_COLOR,
  LOGO_MIME_EXTENSIONS,
  MAX_LOGO_BYTES,
  isAllowedLogoMime,
  isValidHexColor,
  type SalonBranding,
} from "@/lib/salon-branding/branding";
import { cn } from "@/lib/utils";

// Constantes de presentación derivadas del contrato de la marca (espejo del SQL),
// para que los mensajes y el `accept` nunca se desincronicen del backend real.
const LOGO_ACCEPT = ALLOWED_LOGO_MIME_TYPES.join(",");
const LOGO_FORMATS_LABEL = Object.values(LOGO_MIME_EXTENSIONS)
  .map((ext) => ext.toUpperCase())
  .join(", ");
const MAX_LOGO_MB = Math.round(MAX_LOGO_BYTES / (1024 * 1024));

interface SalonMarcaFormProps {
  /** Nombre del salón, solo para rotular la vista previa de la marca. */
  salonName: string;
  /** Marca actual, o `null` si el salón aún no la ha personalizado. */
  branding: SalonBranding | null;
}

/** Devuelve `value` si es un hex válido; si no, el `fallback` (para pintar sin romper). */
function safeColor(value: string, fallback: string): string {
  return isValidHexColor(value) ? value.trim() : fallback;
}

/**
 * Color de texto legible (negro/blanco) sobre un fondo `#rrggbb`, por luminancia
 * relativa (WCAG). Mantiene el texto de la vista previa contrastado sea cual sea
 * el color de marca elegido. Solo se invoca con un hex ya saneado.
 */
function readableTextColor(hex: string): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return "#ffffff";
  const channel = (start: number): number =>
    parseInt(value.slice(start, start + 2), 16) / 255;
  const toLinear = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance =
    0.2126 * toLinear(channel(0)) +
    0.7152 * toLinear(channel(2)) +
    0.0722 * toLinear(channel(4));
  return luminance > 0.45 ? "#111827" : "#ffffff";
}

/** Valida un archivo de logo en cliente (feedback inmediato); el servidor revalida. */
function validateLogoFile(file: File): string | null {
  const type = file.type.trim().toLowerCase();
  if (!isAllowedLogoMime(type)) {
    return `Formato de imagen no admitido. Usa ${LOGO_FORMATS_LABEL}.`;
  }
  if (file.size === 0) {
    return "El archivo del logo está vacío.";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return `La imagen supera el tamaño máximo de ${MAX_LOGO_MB} MB.`;
  }
  return null;
}

interface ColorFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  required?: boolean;
  /** Si se pasa, muestra un botón «Quitar» para vaciar el color (acento opcional). */
  onClear?: () => void;
}

/**
 * Selector de color de marca: muestrario nativo (`input[type=color]`) sincronizado
 * con un campo de texto para el hex `#RRGGBB`. El campo de texto es el control
 * accesible (asociado a la etiqueta); el muestrario lleva su propio `aria-label`.
 * Marca `aria-invalid` mientras el hex tecleado no cumple el formato.
 */
function ColorField({
  id,
  label,
  value,
  onChange,
  description,
  required = false,
  onClear,
}: ColorFieldProps): React.ReactElement {
  const trimmed = value.trim();
  const isEmpty = trimmed === "";
  const invalid = !isEmpty && !isValidHexColor(trimmed);
  const swatch = safeColor(trimmed, "#000000");

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : null}
      </Label>
      <div className="flex items-center gap-2">
        <span
          className="relative inline-flex h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-input shadow-xs"
          style={isEmpty ? undefined : { backgroundColor: swatch }}
        >
          {isEmpty ? (
            <span
              aria-hidden="true"
              className="text-xs font-medium text-muted-foreground"
            >
              —
            </span>
          ) : null}
          <input
            type="color"
            aria-label={`${label}: selector visual de color`}
            value={swatch}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#111827"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={7}
          aria-invalid={invalid}
          className={cn(
            "font-mono uppercase",
            invalid && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {onClear !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={isEmpty}
          >
            Quitar
          </Button>
        ) : null}
      </div>
      {description !== undefined ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

interface BrandPreviewProps {
  salonName: string;
  logoSrc: string | null;
  primary: string;
  secondary: string;
}

/**
 * Maqueta ilustrativa de cómo se ve la marca (encabezado + botón de reserva) con
 * el logo y los colores elegidos, incluidos los cambios AÚN sin guardar. Es puro
 * adorno visual → `aria-hidden`: la información real (hex, logo) ya la exponen los
 * controles del formulario.
 */
function BrandPreview({
  salonName,
  logoSrc,
  primary,
  secondary,
}: BrandPreviewProps): React.ReactElement {
  const safePrimary = safeColor(primary, DEFAULT_PRIMARY_COLOR);
  const safeSecondary = isValidHexColor(secondary.trim())
    ? secondary.trim()
    : null;
  const onPrimary = readableTextColor(safePrimary);
  const accent = safeSecondary ?? safePrimary;
  const monogram = salonName.trim().charAt(0).toUpperCase() || "S";

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs"
    >
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: safePrimary, color: onPrimary }}
      >
        {logoSrc !== null ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/95 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase Storage; next/image exigiría configurar remotePatterns. */}
            <img
              src={logoSrc}
              alt=""
              className="h-full w-full object-contain"
            />
          </span>
        ) : (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold"
            style={{ color: onPrimary }}
          >
            {monogram}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">
            {salonName}
          </p>
          <p className="text-[11px] leading-tight opacity-80">Reserva online</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2">
          <span className="text-sm text-foreground/80">Corte y peinado</span>
          <span className="text-sm font-semibold" style={{ color: accent }}>
            25 €
          </span>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className="w-full rounded-lg px-3 py-2.5 text-sm font-semibold shadow-sm"
          style={{ backgroundColor: safePrimary, color: onPrimary }}
        >
          Reservar cita
        </button>
      </div>
    </div>
  );
}

/**
 * Formulario de la MARCA (white-label) del salón: logotipo y colores. Sigue el
 * mismo patrón que el resto de la sección de ajustes (SectionHeader + Card +
 * SaveStatus), gated a owner/manager por el layout y por la capa de datos.
 *
 * · Logo — subir/reemplazar/quitar como acciones inmediatas, con validación en
 *   cliente de tipo y tamaño (mensajes claros) y revalidación en el servidor.
 * · Colores — principal (obligatorio) y acento (opcional), con muestrario +
 *   campo hex validado en cliente, y un botón «Guardar colores».
 * · Vista previa — refleja logo + colores (incluidos cambios sin guardar).
 *
 * El estado local `branding` se refresca con la fila devuelta por cada mutación
 * para dar feedback inmediato; el Server Action ya revalidó la ruta en servidor.
 */
export function SalonMarcaForm({
  salonName,
  branding: initialBranding,
}: SalonMarcaFormProps): React.ReactElement {
  const [branding, setBranding] = useState<SalonBranding | null>(
    initialBranding,
  );
  const [primary, setPrimary] = useState<string>(
    () => initialBranding?.primary_color ?? DEFAULT_PRIMARY_COLOR,
  );
  const [secondary, setSecondary] = useState<string>(
    () => initialBranding?.secondary_color ?? "",
  );

  const [colorError, setColorError] = useState<string | null>(null);
  const [colorSaved, setColorSaved] = useState(false);

  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoSavedLabel, setLogoSavedLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const colorsMutation = useSaveSalonColors();
  const uploadMutation = useUploadSalonLogo();
  const removeMutation = useRemoveSalonLogo();

  const logoUrl = branding?.logo_url ?? null;
  // Cache-busting por `updated_at`: al reemplazar el logo con la MISMA extensión la
  // URL pública no cambia; el sufijo fuerza al navegador a recargar la imagen.
  const logoSrc =
    logoUrl !== null
      ? `${logoUrl}?v=${encodeURIComponent(branding?.updated_at ?? "")}`
      : null;
  const hasLogo = logoSrc !== null;
  const logoBusy = uploadMutation.isPending || removeMutation.isPending;

  const logoErrorMessage =
    logoError ??
    (uploadMutation.isError ? uploadMutation.error.message : null) ??
    (removeMutation.isError ? removeMutation.error.message : null);
  const colorErrorMessage =
    colorError ?? (colorsMutation.isError ? colorsMutation.error.message : null);

  function updatePrimary(value: string): void {
    setPrimary(value.trim().toUpperCase());
    setColorError(null);
    setColorSaved(false);
  }

  function updateSecondary(value: string): void {
    setSecondary(value.trim().toUpperCase());
    setColorError(null);
    setColorSaved(false);
  }

  function clearSecondary(): void {
    setSecondary("");
    setColorError(null);
    setColorSaved(false);
  }

  function handleColorsSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setColorSaved(false);

    // Validación en cliente (feedback inmediato); el Server Action revalida el hex.
    if (!isValidHexColor(primary)) {
      setColorError("El color principal debe estar en formato #RRGGBB.");
      return;
    }
    const trimmedSecondary = secondary.trim();
    if (trimmedSecondary !== "" && !isValidHexColor(trimmedSecondary)) {
      setColorError("El color de acento debe estar en formato #RRGGBB.");
      return;
    }
    setColorError(null);

    colorsMutation.mutate(
      {
        primaryColor: primary,
        secondaryColor: trimmedSecondary === "" ? null : trimmedSecondary,
      },
      {
        onSuccess: (data) => {
          setBranding(data);
          setColorSaved(true);
        },
      },
    );
  }

  function openFilePicker(): void {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    // Reset para permitir volver a elegir el MISMO archivo tras un error.
    event.target.value = "";
    if (file === undefined) return;

    setLogoSavedLabel(null);
    const validationError = validateLogoFile(file);
    if (validationError !== null) {
      setLogoError(validationError);
      return;
    }
    setLogoError(null);

    uploadMutation.mutate(file, {
      onSuccess: (data) => {
        setBranding(data);
        setLogoSavedLabel("Logo actualizado.");
      },
    });
  }

  function handleRemoveLogo(): void {
    setLogoSavedLabel(null);
    setLogoError(null);
    removeMutation.mutate(undefined, {
      onSuccess: (data) => {
        setBranding(data);
        setLogoSavedLabel("Logo eliminado.");
      },
    });
  }

  return (
    <div>
      <SectionHeader
        icon={Palette}
        title="Marca"
        description="Personaliza el logotipo y los colores con los que se muestran tus reservas y las apps de tu salón."
      />

      {/* Logotipo — acciones inmediatas (subir / reemplazar / quitar). */}
      <Card className="animate-fade-up [animation-delay:60ms]">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
              {hasLogo ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase Storage; next/image exigiría configurar remotePatterns.
                <img
                  src={logoSrc}
                  alt="Logo actual del salón"
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageOff className="h-6 w-6" aria-hidden="true" />
                  <span className="text-xs">Sin logo</span>
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Logotipo</h3>
                <p className="text-sm text-muted-foreground">
                  Formatos {LOGO_FORMATS_LABEL}. Tamaño máximo {MAX_LOGO_MB} MB.
                  Se usará en tu página de reservas y en las apps de tu salón.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={LOGO_ACCEPT}
                onChange={handleFileChange}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={hasLogo ? "outline" : "default"}
                  onClick={openFilePicker}
                  disabled={logoBusy}
                >
                  {hasLogo ? (
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {uploadMutation.isPending
                    ? "Subiendo…"
                    : hasLogo
                      ? "Reemplazar"
                      : "Subir logo"}
                </Button>
                {hasLogo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleRemoveLogo}
                    disabled={logoBusy}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {removeMutation.isPending ? "Quitando…" : "Quitar"}
                  </Button>
                ) : null}
              </div>

              <SaveStatus
                error={logoErrorMessage}
                saved={logoSavedLabel !== null}
                savedLabel={logoSavedLabel ?? undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colores + vista previa. */}
      <Card className="mt-6 animate-fade-up [animation-delay:120ms]">
        <form onSubmit={handleColorsSubmit}>
          <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
            <div className="grid content-start gap-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Colores</h3>
                <p className="text-sm text-muted-foreground">
                  Define el color principal y, opcionalmente, un color de acento.
                </p>
              </div>

              <ColorField
                id="primary_color"
                label="Color principal"
                required
                value={primary}
                onChange={updatePrimary}
                description="Color base de botones y encabezados."
              />
              <ColorField
                id="secondary_color"
                label="Color de acento"
                value={secondary}
                onChange={updateSecondary}
                onClear={clearSecondary}
                description="Opcional. Realza precios y detalles. Déjalo vacío para no usar acento."
              />

              <SaveStatus
                error={colorErrorMessage}
                saved={colorSaved}
                savedLabel="Colores guardados."
              />
            </div>

            <div className="grid content-start gap-2">
              <p className="text-sm font-medium">Vista previa</p>
              <BrandPreview
                salonName={salonName}
                logoSrc={logoSrc}
                primary={primary}
                secondary={secondary}
              />
            </div>
          </CardContent>

          <CardFooter className="justify-end border-t border-border/60 pt-6">
            <Button type="submit" disabled={colorsMutation.isPending}>
              {colorsMutation.isPending ? "Guardando…" : "Guardar colores"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
