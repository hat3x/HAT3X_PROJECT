"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Check, ExternalLink, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEmitInvoice, useSaveSalonFiscal } from "@/hooks/use-invoicing";
import { cn } from "@/lib/utils";
import type { InvoiceEmissionInput } from "@/lib/validations/invoice";

/** Serie de facturación por tipo. Numeración correlativa sin huecos por serie. */
const SERIES = { ticket: "S", completa: "F" } as const;

type InvoiceType = "ticket" | "completa";

/** Datos fiscales actuales del salón (emisor). */
export interface InvoiceIssuer {
  taxId: string | null;
  legalName: string | null;
  fiscalAddress: string | null;
}

/** Datos del cliente de la venta, para prerellenar el receptor de la factura completa. */
export interface InvoiceCustomer {
  name: string | null;
  taxId: string | null;
  address: string | null;
}

export interface EmitInvoiceDialogProps {
  /** Venta a facturar (`pos_sales.id`). */
  saleId: string;
  /** Datos fiscales del salón: si faltan NIF/razón social, el diálogo los pide y los guarda. */
  issuer: InvoiceIssuer;
  /** Cliente de la venta (opcional) para prerellenar el receptor de una factura completa. */
  customer?: InvoiceCustomer | null;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerSize?: "default" | "sm" | "lg";
  triggerClassName?: string;
}

function isFilled(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== "";
}

/**
 * Diálogo para EMITIR una factura de una venta ya cobrada.
 *
 * - Elegir tipo: **Simplificada** (sin receptor) o **Completa** (con receptor).
 * - Si al salón le faltan los datos fiscales (NIF + razón social), los pide en el
 *   propio diálogo y los GUARDA (Ajustes › Fiscal) antes de emitir; las próximas
 *   veces ya no los pide.
 * - Para la completa, pide los datos del receptor (prerellenos con la ficha del
 *   cliente si existe).
 * - Al emitir muestra el número de factura y un enlace al documento imprimible.
 *
 * Reutiliza el motor de emisión ya existente (`emitInvoiceAction`, numeración
 * correlativa + encadenado) vía `useEmitInvoice`.
 */
export function EmitInvoiceDialog({
  saleId,
  issuer,
  customer,
  triggerLabel = "Emitir factura",
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName,
}: EmitInvoiceDialogProps): React.ReactElement {
  const router = useRouter();
  const emit = useEmitInvoice();
  const saveFiscal = useSaveSalonFiscal();

  const [open, setOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("ticket");
  const [success, setSuccess] = useState<{ invoiceId: string; fullNumber: string } | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Datos fiscales del emisor (prerellenos con lo que haya).
  const [fiscalTaxId, setFiscalTaxId] = useState(issuer.taxId ?? "");
  const [fiscalLegalName, setFiscalLegalName] = useState(issuer.legalName ?? "");
  const [fiscalAddress, setFiscalAddress] = useState(issuer.fiscalAddress ?? "");
  const [fiscalSaved, setFiscalSaved] = useState(false);

  // Receptor (factura completa), prerelleno con la ficha del cliente.
  const [recTaxId, setRecTaxId] = useState(customer?.taxId ?? "");
  const [recName, setRecName] = useState(customer?.name ?? "");
  const [recAddress, setRecAddress] = useState(customer?.address ?? "");

  const issuerReady = isFilled(issuer.taxId) && isFilled(issuer.legalName);
  const needsFiscal = !issuerReady && !fiscalSaved;
  const pending = emit.isPending || saveFiscal.isPending;
  const actionError =
    emit.error instanceof Error
      ? emit.error.message
      : saveFiscal.error instanceof Error
        ? saveFiscal.error.message
        : null;

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) {
      setSuccess(null);
      setFormError(null);
      emit.reset();
      saveFiscal.reset();
    }
  }

  async function handleEmit(): Promise<void> {
    setFormError(null);

    if (needsFiscal && !(isFilled(fiscalTaxId) && isFilled(fiscalLegalName))) {
      setFormError("Completa el NIF/CIF y la razón social de tu salón.");
      return;
    }
    if (invoiceType === "completa" && !(isFilled(recTaxId) && isFilled(recName))) {
      setFormError("Una factura completa necesita el NIF y el nombre del cliente.");
      return;
    }

    try {
      if (needsFiscal) {
        await saveFiscal.mutateAsync({
          tax_id: fiscalTaxId.trim(),
          legal_name: fiscalLegalName.trim(),
          fiscal_address: fiscalAddress.trim() === "" ? undefined : fiscalAddress.trim(),
        });
        setFiscalSaved(true);
      }

      const input: InvoiceEmissionInput = {
        saleId,
        invoiceType,
        series: SERIES[invoiceType],
        ...(invoiceType === "completa"
          ? {
              recipient: {
                taxId: recTaxId.trim(),
                name: recName.trim(),
                address: recAddress.trim() === "" ? undefined : recAddress.trim(),
              },
            }
          : {}),
      };

      const invoice = await emit.mutateAsync(input);
      setSuccess({ invoiceId: invoice.invoiceId, fullNumber: invoice.fullNumber });
      router.refresh();
    } catch {
      // El mensaje se muestra desde `actionError` (emit/saveFiscal.error).
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        onClick={() => handleOpenChange(true)}
      >
        <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {success !== null ? (
            <div className="space-y-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-success/15 text-success">
                    <Check className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  Factura emitida
                </DialogTitle>
                <DialogDescription>
                  Número <span className="font-semibold text-foreground">{success.fullNumber}</span>.
                  Ya aparece en Facturación › Facturas.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" asChild>
                  <a
                    href={`/api/facturacion/documento/${success.invoiceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    Ver / descargar
                  </a>
                </Button>
                <Button onClick={() => handleOpenChange(false)}>Cerrar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <DialogHeader>
                <DialogTitle>Emitir factura</DialogTitle>
                <DialogDescription>
                  De esta venta ya cobrada. El ticket se conserva; la factura es un
                  documento aparte con numeración correlativa.
                </DialogDescription>
              </DialogHeader>

              {/* Tipo de factura */}
              <div className="space-y-2">
                <Label>Tipo de factura</Label>
                <div
                  role="radiogroup"
                  aria-label="Tipo de factura"
                  className="grid grid-cols-2 gap-2"
                >
                  {(
                    [
                      { id: "ticket", label: "Simplificada", hint: "Sin datos del cliente" },
                      { id: "completa", label: "Completa", hint: "Con NIF del cliente" },
                    ] as const
                  ).map((opt) => {
                    const active = invoiceType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setInvoiceType(opt.id)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200 ease-apple-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          active
                            ? "border-primary/40 bg-accent text-accent-foreground shadow-xs"
                            : "border-border/70 text-muted-foreground hover:border-primary/30 hover:bg-accent/50 hover:text-foreground",
                        )}
                      >
                        <span className="text-sm font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Datos fiscales del salón (solo si faltan) */}
              {needsFiscal ? (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-accent/40 p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Datos fiscales de tu salón</p>
                    <p className="text-xs text-muted-foreground">
                      Aún no los tienes guardados. Rellénalos una vez y se guardan para
                      las próximas facturas (Ajustes › Fiscal).
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="emit-tax-id">NIF / CIF *</Label>
                      <Input
                        id="emit-tax-id"
                        value={fiscalTaxId}
                        onChange={(e) => setFiscalTaxId(e.target.value)}
                        placeholder="B12345678"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="emit-legal-name">Razón social *</Label>
                      <Input
                        id="emit-legal-name"
                        value={fiscalLegalName}
                        onChange={(e) => setFiscalLegalName(e.target.value)}
                        placeholder="Clínica Dental Biodental, S.L."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="emit-fiscal-address">Domicilio fiscal</Label>
                      <Textarea
                        id="emit-fiscal-address"
                        value={fiscalAddress}
                        onChange={(e) => setFiscalAddress(e.target.value)}
                        placeholder="Calle, número, CP, población"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Receptor (solo factura completa) */}
              {invoiceType === "completa" ? (
                <div className="space-y-3 rounded-xl border border-border/70 p-4">
                  <p className="text-sm font-medium">Datos del cliente (receptor)</p>
                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="emit-rec-tax-id">NIF / CIF *</Label>
                      <Input
                        id="emit-rec-tax-id"
                        value={recTaxId}
                        onChange={(e) => setRecTaxId(e.target.value)}
                        placeholder="12345678Z"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="emit-rec-name">Nombre / razón social *</Label>
                      <Input
                        id="emit-rec-name"
                        value={recName}
                        onChange={(e) => setRecName(e.target.value)}
                        placeholder="Nombre del cliente"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="emit-rec-address">Dirección</Label>
                      <Textarea
                        id="emit-rec-address"
                        value={recAddress}
                        onChange={(e) => setRecAddress(e.target.value)}
                        placeholder="Domicilio del cliente (opcional)"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {formError !== null || actionError !== null ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {formError ?? actionError}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
                <Button onClick={() => void handleEmit()} disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      Emitiendo…
                    </>
                  ) : (
                    "Emitir factura"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
