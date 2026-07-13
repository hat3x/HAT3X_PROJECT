/**
 * Pasarela manual / de registro.
 *
 * Es la implementación por defecto del proyecto: NO procesa ningún cobro contra
 * un datáfono ni una API externa. Su único trabajo es VALIDAR los medios de pago
 * elegidos por el cajero y transformarlos en las filas de `pos_payments` que la
 * capa de datos insertará. El "cobro" ya ha ocurrido físicamente (el cliente ha
 * dado el efectivo, ha pasado su tarjeta por un TPV ajeno, ha hecho el Bizum…);
 * aquí solo se DEJA CONSTANCIA de con qué método se pagó.
 *
 * Cuando exista una integración real (SumUp/Stripe/Redsys), será otra clase que
 * implemente `PaymentGateway` y, antes de devolver las filas, llame al proveedor
 * para autorizar el cargo. La capa que la usa (TPV) no cambiará: depende de la
 * interfaz, no de esta clase. Ver README.md → Roadmap.
 */
import {
  assertTendersCoverTotal,
  type PaymentGateway,
  type PaymentInsert,
  type PaymentResult,
  type RegisterPaymentInput,
} from "./gateway";

export class ManualPaymentGateway implements PaymentGateway {
  readonly id = "manual";

  /**
   * Valida que los tenders cubren el total y devuelve una fila de `pos_payments`
   * por tender (varias filas = pago mixto). No toca la base de datos: es la capa
   * de datos/Server Action quien persiste el resultado dentro de su transacción.
   */
  async registerPayment(input: RegisterPaymentInput): Promise<PaymentResult> {
    assertTendersCoverTotal(input.tenders, input.totalCents);

    const payments: PaymentInsert[] = input.tenders.map((tender) => ({
      salon_id: input.salonId,
      sale_id: input.saleId,
      session_id: input.sessionId ?? null,
      method: tender.method,
      payment_method_id: tender.paymentMethodId ?? null,
      amount_cents: tender.amountCents,
      // `paid_at` opcional: si no se indica, la BD pone now() por defecto.
      ...(input.paidAt ? { paid_at: input.paidAt } : {}),
      reference: tender.reference ?? null,
    }));

    return {
      status: "registered",
      payments,
      registeredCents: input.totalCents,
    };
  }
}

/** Instancia reutilizable (la pasarela manual no tiene estado). */
export const manualPaymentGateway = new ManualPaymentGateway();
