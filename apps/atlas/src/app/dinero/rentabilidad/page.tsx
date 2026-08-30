// src/app/dinero/rentabilidad/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { rentabilidadDelMes } from "@/lib/db/rentabilidad";
import { formatear, hoyEnMadrid, mesDe, mesVecino } from "@/lib/dinero";
import { formatearMinutos } from "@/lib/horas/tramos";
import type { FilaMargen, Linea } from "@/lib/rentabilidad/margen";
import { BotonCierreMes } from "@/components/dinero/BotonCierreMes";
import { Distintivo } from "@/components/ui/Distintivo";

const MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

function Tabla({ titulo, filas, eje, facturadoSinEje, lineaExtra, extraNombre, estructura }: {
  titulo: string; filas: FilaMargen[]; eje: string;
  // Solo lo usa la tabla «Por proyecto»: es facturado puro (una línea de
  // factura sin proyecto), no gastos ni minutos, así que no encaja en el
  // tipo `Linea` que comparten `lineaExtra` y `estructura`.
  facturadoSinEje?: number;
  lineaExtra: Linea; extraNombre: string; estructura: Linea;
}) {
  const th = "px-4 py-2 font-medium";
  const td = "whitespace-nowrap px-4 py-2.5 tabular-nums text-right";
  const total = (l: Linea) => l.gastosCentimos + l.horasCentimos;
  // Ronda de arreglo 1: una línea «sin repartir» con coste de la hora en cero
  // puede tener minutos y ningún céntimo (gastos y horas a 0): `total() > 0`
  // la escondía igual que si no hubiera pasado nada ese mes. Los minutos
  // cuentan como actividad aunque no cuesten dinero.
  const hayActividad = (l: Linea) => total(l) > 0 || l.minutos > 0;
  return (
    <div className="space-y-2">
      <h2 className="pt-2 text-lg font-semibold">{titulo}</h2>
      <div className="cristal cristal-denso overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider" style={{ borderColor: "var(--cristal-borde)", color: "var(--texto-tenue)" }}>
              <th scope="col" className={th}>{eje}</th>
              <th scope="col" className={`${th} text-right`}>Facturado</th>
              <th scope="col" className={`${th} text-right`}>Gastos directos</th>
              <th scope="col" className={`${th} text-right`}>Horas</th>
              <th scope="col" className={`${th} text-right`}>Coste horas</th>
              <th scope="col" className={`${th} text-right`}>Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {filas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-4 text-center" style={{ color: "var(--texto-tenue)" }}>Nada este mes.</td></tr>
            )}
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2.5">{f.nombre}</td>
                <td className={td}>{formatear(f.facturadoCentimos)}</td>
                <td className={td}>{formatear(f.gastosCentimos)}</td>
                <td className={td}>{formatearMinutos(f.minutos)}</td>
                <td className={td}>{formatear(f.horasCentimos)}</td>
                <td className={`${td} font-semibold`} style={f.margenCentimos < 0 ? { color: "var(--estado-caido)" } : undefined}>{formatear(f.margenCentimos)}</td>
              </tr>
            ))}
            {/* Solo en «Por proyecto»: el facturado de una línea sin proyecto
                (§2A: el proyecto vive en la línea) no tiene fila propia, pero
                sí cuenta en el total — sin esta fila la tabla no cuadraba a
                la vista. Es facturado puro: nada que repartir en las demás
                columnas. */}
            {typeof facturadoSinEje === "number" && facturadoSinEje > 0 && (
              <tr style={{ color: "var(--texto-tenue)" }}>
                <td className="px-4 py-2.5">Sin proyecto</td>
                <td className={td}>{formatear(facturadoSinEje)}</td>
                <td className={td}>—</td>
                <td className={td}>—</td>
                <td className={td}>—</td>
                <td className={td}>—</td>
              </tr>
            )}
            {/* Las dos líneas de abajo NO se reparten (§6.3): repartirlas
                inventaría una precisión por cliente que el dato no tiene. */}
            {hayActividad(lineaExtra) && (
              <tr style={{ color: "var(--texto-tenue)" }}>
                <td className="px-4 py-2.5">{extraNombre}</td>
                <td className={td}>—</td>
                <td className={td}>{formatear(lineaExtra.gastosCentimos)}</td>
                <td className={td}>{formatearMinutos(lineaExtra.minutos)}</td>
                <td className={td}>{formatear(lineaExtra.horasCentimos)}</td>
                <td className={td}>−{formatear(total(lineaExtra))}</td>
              </tr>
            )}
            <tr style={{ color: "var(--texto-tenue)" }}>
              <td className="px-4 py-2.5">Estructura, sin repartir</td>
              <td className={td}>—</td>
              <td className={td}>{formatear(estructura.gastosCentimos)}</td>
              <td className={td}>{formatearMinutos(estructura.minutos)}</td>
              <td className={td}>{formatear(estructura.horasCentimos)}</td>
              <td className={td}>−{formatear(total(estructura))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function PaginaRentabilidad({ searchParams }: { searchParams: { mes?: string } }) {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) notFound();

  const hoy = hoyEnMadrid();
  const mesActual = mesDe(hoy);
  // Un `mes` que no sea AAAA-MM no rompe: se vuelve al actual. Se guarda en
  // variable aparte y sin `!`: el `test` ya deja acotado que, si pasa, la
  // cadena original es un `AAAA-MM` válido, pero afirmarlo con `!` sería
  // fiarse del regex sin que el compilador lo compruebe.
  const mesPedido = searchParams.mes;
  const mes = mesPedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesPedido) ? mesPedido : mesActual;
  const { r, costeHoraCentimos, cerrado } = await rentabilidadDelMes(sb, mes);
  const esActual = mes === mesActual;

  // Ronda de arreglo 1: tipado explícito y no un array de tuplas sin tipo —
  // `String(t)` y `Number(v)` tapaban que el título y el valor podían ser
  // cualquier cosa, y el rojo comparaba contra el literal del título en vez
  // de decidirse una sola vez aquí, junto al dato que lo justifica. El orden
  // es el mismo que el de las columnas de las tablas de abajo, para que
  // arriba y abajo signifiquen lo mismo mirado en la misma fila.
  const kpis: { etiqueta: string; texto: string; enRojo?: boolean }[] = [
    { etiqueta: "Facturado (base)", texto: formatear(r.total.facturadoCentimos) },
    { etiqueta: "Gastos (base)", texto: formatear(r.total.gastosCentimos) },
    { etiqueta: "Horas", texto: formatearMinutos(r.total.minutos) },
    { etiqueta: "Coste horas", texto: formatear(r.total.horasCentimos) },
    { etiqueta: "Resultado del negocio", texto: formatear(r.total.margenCentimos), enRojo: r.total.margenCentimos < 0 },
  ];

  return (
    <section className="max-w-5xl space-y-4">
      <header>
        <Link href="/dinero" className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <ChevronLeft size={15} aria-hidden="true" />
          Dinero
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Rentabilidad</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo que queda de cada cliente después de lo que cuesta atenderlo. Con bases, sin IVA, y sin
          repartir lo que no tiene contador.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/dinero/rentabilidad?mes=${mesVecino(mes, -1)}`} className="text-sm underline opacity-80 hover:opacity-100">← anterior</Link>
        <span className="text-lg font-semibold capitalize">{MES.format(new Date(`${mes}-01T12:00:00Z`))}</span>
        {!esActual && <Link href={`/dinero/rentabilidad?mes=${mesVecino(mes, 1)}`} className="text-sm underline opacity-80 hover:opacity-100">siguiente →</Link>}
        {cerrado ? (
          <Distintivo estado="ok" texto={`Cerrado a ${formatear(cerrado.costeHoraCentimos)}/h`} />
        ) : costeHoraCentimos === 0 ? (
          <Distintivo estado="aviso" texto="Sin coste de la hora: las horas cuentan cero" />
        ) : (
          <span className="text-sm" style={{ color: "var(--texto-tenue)" }}>{formatear(costeHoraCentimos)}/h</span>
        )}
        {/* El mes en curso no se cierra: le faltan días. */}
        {!esActual && <BotonCierreMes mes={mes} cerrado={cerrado !== null} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.etiqueta} className="cristal cristal-denso p-4">
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>{k.etiqueta}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums" style={k.enRojo ? { color: "var(--estado-caido)" } : undefined}>{k.texto}</div>
          </div>
        ))}
      </div>

      <Tabla titulo="Por cliente" eje="Cliente" filas={r.porCliente} lineaExtra={r.sinCliente} extraNombre="De proyectos sin cliente" estructura={r.estructura} />
      <Tabla titulo="Por proyecto" eje="Proyecto" filas={r.porProyecto} facturadoSinEje={r.facturadoSinProyectoCentimos} lineaExtra={r.sinProyecto} extraNombre="De clientes sin proyecto" estructura={r.estructura} />
      <p className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        La estructura es la misma línea en las dos tablas: se resta una sola vez del resultado.
      </p>
    </section>
  );
}
