"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { deleteInvoiceAction } from "./actions";

interface DeleteInvoiceButtonProps {
  invoiceId: string;
  invoiceNumber: string;
}

/**
 * Botón de BORRAR una factura, con confirmación en diálogo.
 *
 * Verifactu ya no aplica: la factura es un registro normal y se puede eliminar (p. ej.
 * para corregir un error de emisión). La acción de servidor revalida el libro, así que
 * al confirmar la fila desaparece; `router.refresh()` refuerza el refresco de la vista.
 * El gate de rol (owner/manager) vive en el Server Action; aquí solo se confirma.
 */
export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber,
}: DeleteInvoiceButtonProps): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete(): void {
    setError(null);
    startTransition(async () => {
      const result = await deleteInvoiceAction(invoiceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          aria-label={`Borrar la factura ${invoiceNumber}`}
          title="Borrar factura"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only sm:ml-1.5">Borrar</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Borrar la factura {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Se eliminará de forma permanente del libro de facturas. Esta acción no se
            puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {error !== null ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Borrando…" : "Borrar factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
