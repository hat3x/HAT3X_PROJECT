"use client";

import { useMutation } from "@tanstack/react-query";

import { updateSalonFiscal } from "@/app/(dashboard)/ajustes/fiscal/actions";
import { emitInvoiceAction } from "@/app/(dashboard)/tpv/invoice-actions";
import type { InvoiceEmissionInput } from "@/lib/validations/invoice";
import type { SalonFiscalInput } from "@/lib/validations/salon-fiscal";

/**
 * Emite una factura desde el cliente (envuelve el Server Action `emitInvoiceAction`).
 *
 * El tipo de retorno (`EmittedInvoice`) se infiere del Server Action, así que no
 * hace falta importar el motor server-only en cliente. Lanza `Error` con el mensaje
 * de dominio si la emisión falla, para que la UI lo muestre.
 */
export function useEmitInvoice() {
  return useMutation({
    mutationFn: async (input: InvoiceEmissionInput) => {
      const result = await emitInvoiceAction(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
}

/**
 * Guarda los datos fiscales del salón (emisor) — reutiliza el Server Action de
 * Ajustes › Fiscal. Se usa en el diálogo de emisión cuando el salón aún no tiene
 * NIF/razón social: se guardan UNA vez y las siguientes emisiones ya los tienen.
 */
export function useSaveSalonFiscal() {
  return useMutation({
    mutationFn: async (input: SalonFiscalInput) => {
      const result = await updateSalonFiscal(input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });
}
