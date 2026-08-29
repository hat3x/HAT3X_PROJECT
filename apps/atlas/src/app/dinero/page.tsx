import { notFound } from "next/navigation";
import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { resumenDelMes } from "@/lib/db/resumen-dinero";
import { listarFacturas } from "@/lib/db/facturas";
import { listarClientes } from "@/lib/db/clientes";
import { listarProyectos } from "@/lib/db/proyectos";
import { listarPlataformas } from "@/lib/db/plataformas";
import { formatear, aCentimos, hoyEnMadrid } from "@/lib/dinero";
import { Distintivo } from "@/components/ui/Distintivo";
import { FormGasto } from "@/components/dinero/FormGasto";
import { FormFacturaExterna } from "@/components/dinero/FormFacturaExterna";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

function Cifra({ etiqueta, centimos }: { etiqueta: string; centimos: number }) {
  return (
    <div className="cristal cristal-denso p-4">
      <div
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--texto-tenue)" }}
      >
        {etiqueta}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {formatear(centimos)}
      </div>
    </div>
  );
}

export default async function PaginaDinero() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya devolvería listas vacías, pero un 404 es más honesto
  // que una pantalla en blanco que parece rota.
  if (!perfil?.esPropietario) notFound();

  const hoy = hoyEnMadrid();
  const [resumen, facturas, clientes, proyectos, plataformas] = await Promise.all([
    resumenDelMes(sb, hoy),
    listarFacturas(sb, {}),
    listarClientes(sb),
    listarProyectos(sb),
    listarPlataformas(sb),
  ]);

  return (
    <section className="max-w-5xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dinero</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo facturado, lo cobrado y lo que cuesta tenerlo en pie.
        </p>
      </header>

      {/* `resumen` ya llega en céntimos: `resumenDelMes` suma, y sumar en
          céntimos es justo lo que evita el error de coma flotante que se
          acumularía sumando euros. `Cifra` solo formatea, no vuelve a
          convertir. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="Facturado este mes" centimos={resumen.facturado} />
        <Cifra etiqueta="Cobrado" centimos={resumen.cobrado} />
        <Cifra etiqueta="Pendiente" centimos={resumen.pendiente} />
        <Cifra etiqueta="Gasto directo" centimos={resumen.gastoDirecto} />
      </div>

      {/* La estructura va aparte y sin repartir, a propósito: cualquier regla
          de reparto entre clientes sería una elección nuestra, no un dato. */}
      <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
        Coste de estructura del mes:{" "}
        <strong>{formatear(resumen.gastoEstructura)}</strong>. No se reparte
        entre clientes.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Registrar factura emitida fuera</h2>
      <FormFacturaExterna
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
      />

      <h2 className="pt-2 text-lg font-semibold">Apuntar un gasto</h2>
      <FormGasto
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        plataformas={plataformas.map((p) => ({ id: p.id, nombre: p.nombre }))}
      />

      <p className="text-sm">
        <Link href="/dinero/gastos" className="underline opacity-80 hover:opacity-100">
          Ver los gastos del mes, con su desglose por plataforma, cliente y proyecto →
        </Link>
      </p>

      <h2 className="pt-2 text-lg font-semibold">Facturas</h2>

      {facturas.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Todavía no hay ninguna factura.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Aquí aparecerán las que registres, con lo que falta por cobrar.
          </p>
        </div>
      ) : (
        <div className="cristal cristal-denso overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Facturas registradas</caption>
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
                <th scope="col" className="px-4 py-2 font-medium">Emitida</th>
                <th scope="col" className="px-4 py-2 font-medium">Total</th>
                <th scope="col" className="px-4 py-2 font-medium">Cobro</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {facturas.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {f.serie}-{f.numero ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">{f.clienteNombre}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {FECHA.format(new Date(f.fechaEmision))}
                  </td>
                  {/* Aquí SÍ hace falta `aCentimos`: `Factura.total` es un
                      modelo de lectura que refleja el `numeric(12,2)` de la
                      base tal cual, en euros, y no suma nada — no hay error de
                      coma flotante que acumular en una sola celda. No es una
                      inconsistencia con `Cifra`: es que una fila no es una
                      suma. */}
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {formatear(aCentimos(f.total) ?? 0)}
                  </td>
                  <td className="px-4 py-2.5">
                    {f.cobradaEn ? (
                      <Distintivo estado="ok" texto="Cobrada" />
                    ) : (
                      <Distintivo estado="aviso" texto="Pendiente" />
                    )}
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
