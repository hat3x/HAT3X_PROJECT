// src/app/dinero/cobro/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { leerCobro } from "@/lib/db/cobro";
import { pendientesDeCobro } from "@/lib/cobro/pendientes";
import { formatear, hoyEnMadrid } from "@/lib/dinero";
import { Distintivo } from "@/components/ui/Distintivo";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const MES = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

/** Días que lleva vencida, para que se vea cuál duele más. */
function diasDeRetraso(vencimiento: string, hoy: string): number {
  // Se recorta a AAAA-MM-DD por la misma razón que en `pendientesDeCobro`:
  // si alguna vez llegara una fecha con hora, pegarle `T00:00:00Z` daría un
  // `Date.parse` en NaN y el distintivo diría «NaN días». Que la pantalla se
  // proteja igual que la función evita que una asimetría muerda un día.
  const ms =
    Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`) -
    Date.parse(`${vencimiento.slice(0, 10)}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

export default async function PaginaCobro() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya devolvería listas vacías, pero un 404 es más honesto
  // que una pantalla en blanco que parece rota.
  if (!perfil?.esPropietario) notFound();

  const hoy = hoyEnMadrid();
  const { periodos, facturas } = await leerCobro(sb, hoy);
  const c = pendientesDeCobro(periodos, facturas, hoy);

  return (
    <section className="max-w-4xl space-y-4">
      <header>
        <Link
          href="/dinero"
          className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Dinero
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Cobro</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo que falta por facturar y lo que falta por cobrar. Llega también al
          móvil, una vez al día.
        </p>
      </header>

      {!c.hayAlgo ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Nada pendiente. Buena señal.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Todos los meses cerrados están facturados y ninguna factura ha
            pasado su plazo.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="cristal cristal-denso p-4">
            <div
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--texto-tenue)" }}
            >
              Sin facturar
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatear(c.totalSinFacturarCentimos)}
            </div>
          </div>
          <div className="cristal cristal-denso p-4">
            <div
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--texto-tenue)" }}
            >
              Vencido sin cobrar
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatear(c.totalVencidoCentimos)}
            </div>
          </div>
        </div>
      )}

      {c.sinFacturar.length > 0 && (
        <>
          <h2 className="pt-2 text-lg font-semibold">Meses sin facturar</h2>
          <div className="cristal cristal-denso overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Periodos de contrato sin factura</caption>
              <thead>
                <tr
                  className="border-b text-left text-xs uppercase tracking-wider"
                  style={{
                    borderColor: "var(--cristal-borde)",
                    color: "var(--texto-tenue)",
                  }}
                >
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-2 font-medium">Mes</th>
                  <th scope="col" className="px-4 py-2 font-medium">Esperado</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
                {c.sinFacturar.map((p) => (
                  <tr key={`${p.contratoId}-${p.periodo}`}>
                    <td className="px-4 py-2.5">{p.clienteNombre}</td>
                    <td className="px-4 py-2.5 capitalize">
                      {MES.format(new Date(p.periodo))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {formatear(p.importeEsperadoCentimos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {c.vencidas.length > 0 && (
        <>
          <h2 className="pt-2 text-lg font-semibold">Facturas vencidas</h2>
          <div className="cristal cristal-denso overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Facturas emitidas que pasaron su plazo</caption>
              <thead>
                <tr
                  className="border-b text-left text-xs uppercase tracking-wider"
                  style={{
                    borderColor: "var(--cristal-borde)",
                    color: "var(--texto-tenue)",
                  }}
                >
                  <th scope="col" className="px-4 py-2 font-medium">Número</th>
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-2 font-medium">Venció</th>
                  <th scope="col" className="px-4 py-2 font-medium">Retraso</th>
                  <th scope="col" className="px-4 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
                {c.vencidas.map((f) => {
                  // Sin `!`: `f.fechaVencimiento` ya es `string` en el tipo —
                  // `pendientesDeCobro` estrecha `vencidas` porque su propio
                  // filtro descarta las facturas sin plazo antes de llegar
                  // aquí, así que la pantalla no tiene que asegurar a gritos
                  // algo que la función ya garantiza.
                  const dias = diasDeRetraso(f.fechaVencimiento, hoy);
                  return (
                    <tr key={f.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        {f.serie}-{f.numero ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">{f.clienteNombre}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        {FECHA.format(new Date(f.fechaVencimiento))}
                      </td>
                      <td className="px-4 py-2.5">
                        {/* Más de un mes de retraso deja de ser un despiste. */}
                        <Distintivo
                          estado={dias > 30 ? "caido" : "aviso"}
                          texto={`${dias} ${dias === 1 ? "día" : "días"}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        {formatear(f.totalCentimos)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
