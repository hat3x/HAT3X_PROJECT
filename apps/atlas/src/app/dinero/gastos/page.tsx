import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarGastos } from "@/lib/db/gastos";
import { listarRecurrentes } from "@/lib/db/recurrentes";
import { listarPlataformas } from "@/lib/db/plataformas";
import { listarClientes } from "@/lib/db/clientes";
import { desglosar, type Fila } from "@/lib/gastos/desglose";
import { formatear, aCentimos, hoyEnMadrid } from "@/lib/dinero";
import { FormRecurrente } from "@/components/dinero/FormRecurrente";
import { Distintivo } from "@/components/ui/Distintivo";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

/** Primer y último día del mes al que pertenece `dia`. */
function limites(dia: string): { desde: string; hasta: string } {
  const d = new Date(`${dia.slice(0, 7)}-01T00:00:00Z`);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { desde: d.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
}

function Desglose({
  titulo,
  filas,
  total,
}: {
  titulo: string;
  filas: Fila[];
  total: number;
}) {
  return (
    <div className="cristal cristal-denso p-4">
      <h3
        className="mb-2 text-xs uppercase tracking-wider"
        style={{ color: "var(--texto-tenue)" }}
      >
        {titulo}
      </h3>
      {filas.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
          Nada este mes.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {filas.map((f) => (
            <li key={f.id ?? "sin"} className="flex items-baseline justify-between gap-3">
              <span className="truncate">{f.nombre}</span>
              <span className="shrink-0 tabular-nums">{formatear(f.centimos)}</span>
            </li>
          ))}
        </ul>
      )}
      {/* El total de cada desglose, a la vista. Los tres tienen que coincidir:
          si uno sale distinto, hay un gasto perdido en esa agrupación. Un test
          lo exige, pero verlo aquí lo hace evidente sin ejecutar nada. */}
      <p
        className="mt-2 border-t pt-2 text-sm font-semibold tabular-nums"
        style={{ borderColor: "var(--cristal-borde)" }}
      >
        {formatear(total)}
      </p>
    </div>
  );
}

export default async function PaginaGastos() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya devolvería listas vacías, pero un 404 es más honesto
  // que una pantalla en blanco que parece rota.
  if (!perfil?.esPropietario) notFound();

  const { desde, hasta } = limites(hoyEnMadrid());
  const [gastos, recurrentes, plataformas, clientes] = await Promise.all([
    listarGastos(sb, { desde, hasta }),
    listarRecurrentes(sb),
    listarPlataformas(sb),
    listarClientes(sb),
  ]);

  const d = desglosar(
    gastos.map((g) => ({
      totalCentimos: aCentimos(g.total) ?? 0,
      plataformaId: g.plataformaId,
      plataformaNombre: g.plataformaNombre,
      clienteId: g.clienteId,
      clienteNombre: g.clienteNombre,
      proyectoId: g.proyectoId,
      proyectoNombre: g.proyectoNombre,
    }))
  );

  return (
    <section className="max-w-5xl space-y-4">
      <header>
        <Link
          href="/dinero"
          className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Dinero
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Gastos del mes</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          El mismo dinero por tres caminos. Si los tres no suman igual, hay un
          gasto mal imputado.
        </p>
      </header>

      <div className="cristal cristal-denso p-4">
        <div
          className="text-xs uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}
        >
          Total del mes
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {formatear(d.total)}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Desglose titulo="Por plataforma" filas={d.porPlataforma} total={d.total} />
        <Desglose titulo="Por cliente" filas={d.porCliente} total={d.total} />
        <Desglose titulo="Por proyecto" filas={d.porProyecto} total={d.total} />
      </div>

      <h2 className="pt-2 text-lg font-semibold">Recibos fijos</h2>
      <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
        Se convierten en gasto solos el día que toque de cada mes. La columna
        «última vez» es la que delata a uno que dejó de aparecer.
      </p>

      {recurrentes.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Todavía no hay ningún recibo fijo.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Da de alta aquí lo que pagas todos los meses —alojamiento, correo,
            dominios— y dejará de haber que teclearlo doce veces al año.
          </p>
        </div>
      ) : (
        <div className="cristal cristal-denso overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Recibos fijos dados de alta</caption>
            <thead>
              <tr
                className="border-b text-left text-xs uppercase tracking-wider"
                style={{
                  borderColor: "var(--cristal-borde)",
                  color: "var(--texto-tenue)",
                }}
              >
                <th scope="col" className="px-4 py-2 font-medium">Concepto</th>
                <th scope="col" className="px-4 py-2 font-medium">Plataforma</th>
                <th scope="col" className="px-4 py-2 font-medium">Día</th>
                <th scope="col" className="px-4 py-2 font-medium">Importe</th>
                <th scope="col" className="px-4 py-2 font-medium">Última vez</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {recurrentes.map((r) => (
                <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.5 }}>
                  <td className="px-4 py-2.5">{r.concepto}</td>
                  <td className="px-4 py-2.5">{r.plataformaNombre ?? "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.diaDelMes}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {formatear(aCentimos(r.total) ?? 0)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {r.ultimaVez ? (
                      FECHA.format(new Date(r.ultimaVez))
                    ) : (
                      <Distintivo estado="desconocido" texto="Nunca" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="pt-2 text-lg font-semibold">Dar de alta un recibo fijo</h2>
      <FormRecurrente
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        plataformas={plataformas.map((p) => ({ id: p.id, nombre: p.nombre }))}
      />

      <h2 className="pt-2 text-lg font-semibold">Los gastos de este mes</h2>

      {gastos.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Ningún gasto este mes.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Los recibos fijos aparecerán solos el día que toque; los sueltos se
            apuntan desde la pantalla de Dinero.
          </p>
        </div>
      ) : (
        <div className="cristal cristal-denso overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Gastos del mes en curso</caption>
            <thead>
              <tr
                className="border-b text-left text-xs uppercase tracking-wider"
                style={{
                  borderColor: "var(--cristal-borde)",
                  color: "var(--texto-tenue)",
                }}
              >
                <th scope="col" className="px-4 py-2 font-medium">Fecha</th>
                <th scope="col" className="px-4 py-2 font-medium">Concepto</th>
                <th scope="col" className="px-4 py-2 font-medium">Plataforma</th>
                <th scope="col" className="px-4 py-2 font-medium">Imputado a</th>
                <th scope="col" className="px-4 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {gastos.map((g) => (
                <tr key={g.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {FECHA.format(new Date(g.fecha))}
                  </td>
                  <td className="px-4 py-2.5">{g.concepto}</td>
                  <td className="px-4 py-2.5">{g.plataformaNombre ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {g.esDirecto ? (
                      (g.clienteNombre ?? g.proyectoNombre)
                    ) : (
                      <span style={{ color: "var(--texto-tenue)" }}>Estructura</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {formatear(aCentimos(g.total) ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
