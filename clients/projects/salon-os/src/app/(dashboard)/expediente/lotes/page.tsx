import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PackageSearch, Search } from "lucide-react";

import { ImplantList } from "@/components/dental/implant-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchImplantsByLot } from "@/lib/queries/implants";
import { getActiveSalon } from "@/lib/salon";

export const metadata: Metadata = {
  title: "Buscar por lote",
};

/**
 * A quién se le puso un lote (A3).
 *
 * Esta pantalla existe para un día concreto: el fabricante retira un lote y la
 * clínica tiene que llamar a los pacientes afectados. Todo lo que hay aquí está
 * ordenado a eso — la búsqueda va en la URL para poder guardarla o pasarla, y
 * los teléfonos salen marcables porque lo siguiente es coger el teléfono.
 *
 * Puerta de sector explícita: la RLS aísla por salón, no por sector.
 */
export default async function LotesPage({
  searchParams,
}: {
  searchParams: { lote?: string };
}): Promise<React.ReactElement> {
  const salon = await getActiveSalon();
  if (salon === null) redirect("/login?next=/expediente/lotes");
  if (salon.sector !== "odontologia") notFound();

  const lote = (searchParams.lote ?? "").trim();
  const implantes = lote === "" ? [] : await fetchImplantsByLot(salon.id, lote);

  return (
    <main className="container max-w-3xl py-8">
      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-accent/60 px-3 py-1 text-xs font-medium text-accent-foreground">
          <PackageSearch className="h-3.5 w-3.5" aria-hidden="true" />
          Trazabilidad
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Buscar por lote</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Si retiran un lote, aquí salen los pacientes a los que se les puso, con su teléfono.
        </p>
      </header>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label htmlFor="lote">Lote</Label>
          <Input
            id="lote"
            name="lote"
            defaultValue={lote}
            placeholder="Por ejemplo, LOT123"
            className="mt-1"
          />
        </div>
        <Button type="submit">
          <Search className="mr-2 h-4 w-4" aria-hidden="true" />
          Buscar
        </Button>
      </form>

      {lote === "" ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Escribe el lote que aparece en el aviso del fabricante.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            {implantes.length === 0 ? (
              <>
                Ningún implante del lote <strong>{lote}</strong> figura colocado en esta clínica.
              </>
            ) : (
              <>
                <strong>{implantes.length}</strong>{" "}
                {implantes.length === 1 ? "implante colocado" : "implantes colocados"} del lote{" "}
                <strong>{lote}</strong>.
              </>
            )}
          </p>
          <ImplantList implants={implantes} showCustomer />
        </>
      )}
    </main>
  );
}
