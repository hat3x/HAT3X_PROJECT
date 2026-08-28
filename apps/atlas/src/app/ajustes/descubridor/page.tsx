import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import {
  listarDescubrimientos,
  saludDelDescubridor,
  type Descubrimiento,
  type Salud,
} from "@/lib/db/descubrimientos";
import { Distintivo, type EstadoVisual } from "@/components/ui/Distintivo";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

/** Las últimas dos semanas largas, a una pasada por hora. */
const CUANTAS = 40;

/**
 * Lo que se enseña arriba del todo. «Nunca» y «atrasado» no son el mismo
 * problema y no llevan a mirar lo mismo: uno es que falta configurar algo, el
 * otro es que dejó de dispararse.
 */
const CARTEL: Record<Salud, { color: EstadoVisual; texto: string; que: string }> = {
  "al-dia": {
    color: "ok",
    texto: "Al día",
    que: "El censo de Kairos y lo que Atlas vigila coinciden.",
  },
  atrasado: {
    color: "caido",
    texto: "Atrasado",
    que: "Lleva más de tres horas sin pasar, y pasa cada hora. No es que falle la reconciliación: es que no se dispara. Mira app.atlas_web_url y app.atlas_cron_key en la base, y cron.job.",
  },
  nunca: {
    color: "desconocido",
    texto: "Nunca ha corrido",
    que: "No hay ninguna pasada registrada. O no se ha configurado el disparador en la base, o la ruta no está respondiendo.",
  },
};

function Movimientos({ d }: { d: Descubrimiento }) {
  if (!d.ok) return <span style={{ color: "var(--texto-tenue)" }}>—</span>;

  const partes = [
    d.altas > 0 ? `+${d.altas}` : null,
    d.pausados > 0 ? `−${d.pausados}` : null,
    d.reactivados > 0 ? `↻${d.reactivados}` : null,
  ].filter((p): p is string => p !== null);

  // Lo normal es que no se mueva nada. Decirlo con palabras y no con «0 0 0»
  // evita que la columna se lea como si algo hubiera fallado.
  if (partes.length === 0) {
    return <span style={{ color: "var(--texto-tenue)" }}>sin cambios</span>;
  }

  // Cada símbolo en su propio elemento: unidos por espacios, el HTML los
  // colapsa a uno y «+2 ↻1» se lee como una sola cifra rara.
  return (
    <span className="inline-flex gap-3 tabular-nums">
      {partes.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </span>
  );
}

export default async function PaginaDescubridor() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya devolvería lista vacía, pero un 404 es más honesto que
  // una pantalla vacía que parece rota.
  if (!perfil?.esPropietario) notFound();

  const pasadas = await listarDescubrimientos(sb, CUANTAS);
  const ultima = pasadas[0] ?? null;
  const salud = saludDelDescubridor(ultima?.ejecutadoEn ?? null, Date.now());
  const cartel = CARTEL[salud];

  return (
    <section className="max-w-4xl space-y-4">
      <header>
        <Link
          href="/ajustes"
          className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Ajustes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Descubridor</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Cada hora compara el censo de salones de Kairos con lo que Atlas
          vigila. Da de alta lo nuevo y pausa lo que se da de baja — nunca lo
          borra.
        </p>
      </header>

      {/* El estado va arriba y con su motivo al lado. Una tabla de números no
          responde a «¿va bien?», que es lo único que se viene a mirar. */}
      <div className="cristal cristal-denso space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Distintivo estado={cartel.color} texto={cartel.texto} />
          {ultima && (
            <span className="text-sm" style={{ color: "var(--texto-tenue)" }}>
              Última pasada: {FECHA.format(new Date(ultima.ejecutadoEn))}
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
          {cartel.que}
        </p>

        {/* El motivo del último fallo, aunque el descubridor siga al día: una
            pasada mala entre buenas se pierde en la tabla, y suele ser la
            primera señal de que Kairos rotó una clave. */}
        {ultima && !ultima.ok && ultima.error && (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              color: "var(--estado-caido)",
              backgroundColor:
                "color-mix(in srgb, var(--estado-caido) calc(var(--estado-fondo-alfa) * 100%), transparent)",
            }}
          >
            {ultima.error}
          </p>
        )}
      </div>

      {pasadas.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Aquí aparecerá cada pasada.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Con lo que movió, o con el motivo si no pudo. Hasta que corra la
            primera, no hay nada que contar.
          </p>
        </div>
      ) : (
        <div className="cristal cristal-denso overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Historial de pasadas del descubridor de tenants de Kairos
            </caption>
            <thead>
              <tr
                className="border-b text-left text-xs uppercase tracking-wider"
                style={{
                  borderColor: "var(--cristal-borde)",
                  color: "var(--texto-tenue)",
                }}
              >
                <th scope="col" className="px-4 py-2 font-medium">
                  Cuándo
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Resultado
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Movimientos
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Motivo
                </th>
              </tr>
            </thead>
            <tbody
              className="divide-y"
              style={{ borderColor: "var(--cristal-borde)" }}
            >
              {pasadas.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {FECHA.format(new Date(d.ejecutadoEn))}
                  </td>
                  <td className="px-4 py-2.5">
                    <Distintivo
                      estado={d.ok ? "ok" : "caido"}
                      texto={d.ok ? "Bien" : "Falló"}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Movimientos d={d} />
                  </td>
                  <td
                    className="max-w-[24rem] truncate px-4 py-2.5"
                    style={{ color: "var(--texto-tenue)" }}
                    title={d.error ?? undefined}
                  >
                    {d.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        Se guardan seis meses. Los símbolos: <strong>+</strong> altas,{" "}
        <strong>−</strong> pausados, <strong>↻</strong> reactivados.
      </p>
    </section>
  );
}
