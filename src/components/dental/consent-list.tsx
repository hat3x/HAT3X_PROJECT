"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSignature,
  Loader2,
  Printer,
  ShieldOff,
  Trash2,
} from "lucide-react";

import { deleteConsent, signImageUrls } from "@/app/(dashboard)/expediente/actions";
import { SignaturePad } from "@/components/dental/signature-pad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRevokeConsent, useSignConsent } from "@/hooks/use-consents";
import { isMeaningfulSignature, type SignatureStroke } from "@/lib/dental/signature";
import {
  CONSENT_STATUS_LABELS,
  CONSENT_TYPE_LABELS,
  canRevokeConsent,
  canSignConsent,
} from "@/lib/dental/consents";
import { consentKeys } from "@/lib/queries/consents";
import type { Consent, ConsentStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// ConsentList — lista de consentimientos informados de un paciente. Componente
// CLIENTE: llama directamente a `useSignConsent`/`useRevokeConsent` (cada fila
// necesita su propio botón de acción, mismo patrón que `PlanDetail`). El borrado
// (`deleteConsent`) no tiene hook propio en `use-consents.ts` — se envuelve aquí
// la server action con `useMutation`, igual patrón que `useAddPlanPhase` en
// `plan-workspace.tsx`.
// ---------------------------------------------------------------------------

export interface ConsentListProps {
  salonId: string;
  customerId: string;
  consents: readonly Consent[];
}

/** Color del badge de estado: ámbar (pendiente), verde (firmado), gris (revocado). */
const STATUS_BADGE_CLASSES: Record<ConsentStatus, string> = {
  pending:
    "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  signed:
    "border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  revoked: "border-transparent bg-muted text-muted-foreground",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Borra un consentimiento pendiente. `use-consents.ts` no expone un hook para
 * esto (borrado residual, solo aplica a `pending`) — se envuelve aquí la
 * server action con `useMutation`, invalidando la lista del paciente en éxito.
 */
function useDeleteConsent(salonId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (consentId: string) => {
      const result = await deleteConsent(consentId);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: consentKeys.list(salonId, customerId),
      });
    },
  });
}

export function ConsentList({
  salonId,
  customerId,
  consents,
}: ConsentListProps): React.ReactElement {
  const signMutation = useSignConsent(salonId, customerId);
  const revokeMutation = useRevokeConsent(salonId, customerId);
  const deleteMutation = useDeleteConsent(salonId, customerId);

  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signName, setSignName] = useState("");
  const [signStrokes, setSignStrokes] = useState<SignatureStroke[]>([]);
  /** Consentimiento cuyo PDF se está pidiendo, para no repetir el clic. */
  const [openingId, setOpeningId] = useState<string | null>(null);

  function handleStartSign(consentId: string) {
    setActionError(null);
    setSigningId(consentId);
    setSignName("");
    setSignStrokes([]);
  }

  function handleCancelSign() {
    setSigningId(null);
    setSignName("");
    setSignStrokes([]);
  }

  function handleConfirmSign(consentId: string) {
    const trimmed = signName.trim();
    if (trimmed === "") return;
    // Misma comprobación que hace el servidor: el botón ya está deshabilitado,
    // pero no se confía en el estado de un botón para decidir si hay firma.
    if (!isMeaningfulSignature(signStrokes)) return;
    setActionError(null);
    signMutation.mutate(
      {
        consentId,
        signedByPatient: trimmed,
        strokes: signStrokes,
        device: typeof navigator === "undefined" ? undefined : navigator.userAgent,
      },
      {
        onSuccess: () => {
          setSigningId(null);
          setSignName("");
          setSignStrokes([]);
        },
        onError: (err: unknown) => {
          setActionError(err instanceof Error ? err.message : "Error al firmar el consentimiento.");
        },
      },
    );
  }

  function handleRevoke(consentId: string) {
    setActionError(null);
    revokeMutation.mutate(consentId, {
      onError: (err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Error al revocar el consentimiento.");
      },
    });
  }

  function handleDelete(consentId: string) {
    setActionError(null);
    deleteMutation.mutate(consentId, {
      onError: (err: unknown) => {
        setActionError(err instanceof Error ? err.message : "Error al borrar el consentimiento.");
      },
    });
  }

  if (consents.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <span
            aria-hidden="true"
            className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10"
          >
            <FileSignature className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium">Sin consentimientos todavía</p>
          <p className="mt-1 max-w-[30ch] text-xs text-muted-foreground">
            Crea el primer consentimiento informado para este paciente con «Nuevo consentimiento».
          </p>
        </CardContent>
      </Card>
    );
  }

  /**
   * Abre el PDF sellado del consentimiento en una pestaña nueva.
   *
   * De ahí se imprime con la ventana del sistema, que es donde se elige la
   * impresora: una página web no puede —ni debe— ver las impresoras del
   * ordenador, así que "vincular una impresora" no es algo que se configure
   * aquí. Lo que hacía falta era poder llegar al documento.
   *
   * El PDF ya existe: se genera y se archiva al firmar. El bucket es privado,
   * así que se pide una URL firmada en el momento en vez de guardar un enlace
   * que caducaría.
   */
  async function abrirDocumento(consentId: string, path: string): Promise<void> {
    setActionError(null);
    setOpeningId(consentId);
    try {
      const result = await signImageUrls([path]);
      const url = result.ok ? result.data[path] : undefined;
      if (url === undefined) {
        setActionError("No se pudo abrir el documento firmado.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="space-y-3">
      {actionError !== null && (
        <p className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      )}

      {consents.map((consent) => {
        const isExpanded = expandedId === consent.id;
        const isSigning = signingId === consent.id;

        return (
          <Card key={consent.id}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{CONSENT_TYPE_LABELS[consent.type]}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(consent.created_at)}</span>
                    {consent.fdi_code !== null && <span>Diente {consent.fdi_code}</span>}
                    {consent.status === "signed" && consent.signed_by_patient !== null && (
                      <span>Firmado por {consent.signed_by_patient}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Solo cuando hay documento: los firmados antes de A2 no lo
                      tienen, y ofrecer abrir algo que no existe es peor que no
                      ofrecerlo. */}
                  {consent.document_uri !== null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={openingId === consent.id}
                      onClick={() => void abrirDocumento(consent.id, consent.document_uri!)}
                    >
                      {openingId === consent.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      Imprimir
                    </Button>
                  )}
                  <Badge className={STATUS_BADGE_CLASSES[consent.status]}>
                    {CONSENT_STATUS_LABELS[consent.status]}
                  </Badge>
                </div>
              </div>

              {consent.body !== null && consent.body !== "" && (
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setExpandedId(isExpanded ? null : consent.id)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    )}
                    {isExpanded ? "Ocultar texto" : "Ver texto"}
                  </button>
                  {isExpanded && (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      {consent.body}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {isSigning ? (
                  <div className="flex w-full flex-col gap-2">
                    <Input
                      aria-label="Nombre del paciente que firma"
                      placeholder="Nombre del paciente"
                      value={signName}
                      onChange={(e) => setSignName(e.target.value)}
                      className="h-8 w-48 text-xs"
                    />
                    <SignaturePad onChange={setSignStrokes} disabled={signMutation.isPending} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={
                          signMutation.isPending ||
                          signName.trim() === "" ||
                          !isMeaningfulSignature(signStrokes)
                        }
                        onClick={() => handleConfirmSign(consent.id)}
                      >
                        {signMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Confirmar firma
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={handleCancelSign}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {canSignConsent(consent.status) && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleStartSign(consent.id)}
                      >
                        <FileSignature className="h-3.5 w-3.5" aria-hidden="true" />
                        Firmar
                      </Button>
                    )}
                    {canRevokeConsent(consent.status) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={revokeMutation.isPending}
                        onClick={() => handleRevoke(consent.id)}
                      >
                        {revokeMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Revocar
                      </Button>
                    )}
                    {consent.status === "pending" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => handleDelete(consent.id)}
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Borrar
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
