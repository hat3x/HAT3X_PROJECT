/**
 * `EmitInvoiceDialog` sobre una venta traída de un volcado histórico.
 *
 * El servidor ya se niega a facturarlas (`emitInvoiceAction`), así que no hay
 * riesgo de emitir nada. Lo que queda es el botón: sigue ahí, invitando a
 * pulsarlo en 34.883 tickets antiguos para devolver un error rojo. Ofrecer una
 * acción que siempre falla es peor que no ofrecerla — y en una demostración
 * delante del cliente, mucho peor.
 *
 * Lo que fija este test:
 *  · una venta migrada NO enseña el botón, y sí dice por qué;
 *  · una venta nativa lo sigue enseñando igual que siempre, porque esto no
 *    puede convertirse en un freno para cobrar el día a día.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/hooks/use-invoicing", () => ({
  useEmitInvoice: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveSalonFiscal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { EmitInvoiceDialog } from "@/components/facturacion/emit-invoice-dialog";

const VENTA = "11111111-1111-1111-1111-111111111111";
const EMISOR = {
  taxId: "B12345678",
  legalName: "Espiral SL",
  fiscalAddress: "Fuenlabrada, Madrid",
};

afterEach(() => {
  cleanup();
});

describe("EmitInvoiceDialog con histórico migrado", () => {
  it("no ofrece emitir factura de una venta del sistema anterior", () => {
    render(
      <EmitInvoiceDialog saleId={VENTA} issuer={EMISOR} migratedFrom="AAR:ticket:217176" />,
    );

    expect(screen.queryByRole("button", { name: /emitir factura/i })).not.toBeInTheDocument();
  });

  it("explica por qué no se puede, en vez de dejar el hueco vacío", () => {
    render(
      <EmitInvoiceDialog saleId={VENTA} issuer={EMISOR} migratedFrom="AAR:ticket:217176" />,
    );

    expect(screen.getByText(/sistema anterior/i)).toBeInTheDocument();
  });

  it("sigue ofreciendo emitir en una venta nativa de Kairos", () => {
    render(<EmitInvoiceDialog saleId={VENTA} issuer={EMISOR} />);

    expect(screen.getByRole("button", { name: /emitir factura/i })).toBeInTheDocument();
  });
});
