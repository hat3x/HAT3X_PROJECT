// src/app/dinero/horas/page.tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarTramos, ultimoInicio } from "@/lib/db/fichajes";
import { nombresDeProyectos } from "@/lib/db/proyectos";
import { nombresDeClientes } from "@/lib/db/clientes";
import { resumir, formatearMinutos, minutosDe, type FilaHoras } from "@/lib/horas/tramos";
import { hoyEnMadrid, limitesMesMadrid, mesDe } from "@/lib/dinero";
import { FormTramo } from "@/components/dinero/FormTramo";
import { BotonBorrarTramo } from "@/components/dinero/BotonBorrarTramo";
import { Distintivo } from "@/components/ui/Distintivo";

const FECHA_HORA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

function Desglose({ titulo, filas }: { titulo: string; filas: FilaHoras[] }) {
  return (
    <div className="cristal cristal-denso p-4">
      <h3 className="mb-2 text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>
        {titulo}
      </h3>
      {filas.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>Nada este mes.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {filas.map((f) => (
            <li key={f.id ?? "sin"} className="flex items-baseline justify-between gap-3">
              <span className="truncate">{f.nombre}</span>
              <span className="shrink-0 tabular-nums">{formatearMinutos(f.minutos)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function PaginaHoras() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Sin doble puerta: aquí entra cualquiera. Un colaborador ve sus horas y el
  // propietario las de todos, y eso lo decide RLS al leer, no esta pantalla.
  const esPropietario = perfil?.esPropietario ?? false;

  const rango = limitesMesMadrid(mesDe(hoyEnMadrid()));
  // `nombresDe*` y no `listar*`: los desplegables solo necesitan id y nombre,
  // y `listar*` arrastra contratos, cuotas y estados que aquí nadie lee.
  //
  // «Último fichaje» se pide aparte y sin rango: si saliera de los tramos del
  // mes, el día 1 diría «Nunca» aunque se fichara ayer.
  const [tramos, proyectos, clientes, ultimo] = await Promise.all([
    listarTramos(sb, rango),
    nombresDeProyectos(sb),
    nombresDeClientes(sb),
    ultimoInicio(sb),
  ]);
  // Un único instante para toda la pantalla: `resumir` lo usa para el total y
  // los desgloses, y la tabla de abajo lo reutiliza en `minutosDe` fila por
  // fila. Si cada uno leyera su propio `Date.now()`, un tramo abierto podría
  // sumar un minuto distinto en la fila que en el total.
  const ahora = Date.now();
  const r = resumir(tramos, ahora);
  const pctAnadido = r.totalMin === 0 ? 0 : Math.round((r.anadidosMin / r.totalMin) * 100);

  return (
    <section className="max-w-5xl space-y-4">
      <header>
        {/* Solo al propietario: `/dinero` hace notFound() a los demás, y un
            enlace a una puerta cerrada es peor que ninguno. */}
        {esPropietario && (
          <Link href="/dinero" className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
            <ChevronLeft size={15} aria-hidden="true" />
            Dinero
          </Link>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">Horas</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo fichado este mes. La regla es fichar antes de empezar; lo que se añade después cuenta, pero se ve.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="cristal cristal-denso p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Total del mes</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatearMinutos(r.totalMin)}</div>
        </div>
        <div className="cristal cristal-denso p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Añadido a posteriori</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{pctAnadido} %</div>
          {/* Más de un cuarto reconstruido: la regla no se está cumpliendo. */}
          {pctAnadido > 25 && <Distintivo estado="aviso" texto="Se está fichando tarde" />}
        </div>
        <div className="cristal cristal-denso p-4">
          <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Último fichaje</div>
          <div className="mt-1 text-lg font-semibold">
            {ultimo ? FECHA_HORA.format(new Date(ultimo)) : <Distintivo estado="desconocido" texto="Nunca" />}
          </div>
        </div>
      </div>

      {r.sospechosos.length > 0 && (
        <div className="cristal p-4" role="alert">
          <p className="font-medium">
            {r.sospechosos.length === 1 ? "Hay un fichaje abierto desde hace demasiado." : `Hay ${r.sospechosos.length} fichajes abiertos desde hace demasiado.`}
          </p>
          <ul className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            {r.sospechosos.map((t) => (
              <li key={t.id}>
                {t.usuarioNombre ?? "Alguien"} · desde {FECHA_HORA.format(new Date(t.inicio))}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={esPropietario ? "grid gap-3 lg:grid-cols-3" : "grid gap-3 lg:grid-cols-2"}>
        <Desglose titulo="Por cliente" filas={r.porCliente} />
        <Desglose titulo="Por proyecto" filas={r.porProyecto} />
        {esPropietario && <Desglose titulo="Por persona" filas={r.porPersona} />}
      </div>

      <h2 className="pt-2 text-lg font-semibold">Se me olvidó fichar</h2>
      <FormTramo
        proyectos={proyectos}
        clientes={clientes}
      />

      <h2 className="pt-2 text-lg font-semibold">Los tramos del mes</h2>
      {tramos.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Ningún tramo este mes.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>Ficha desde el marco, a la izquierda, antes de empezar.</p>
        </div>
      ) : (
        <div className="cristal cristal-denso overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Tramos fichados en el mes en curso</caption>
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider" style={{ borderColor: "var(--cristal-borde)", color: "var(--texto-tenue)" }}>
                {esPropietario && <th scope="col" className="px-4 py-2 font-medium">Quién</th>}
                <th scope="col" className="px-4 py-2 font-medium">Inicio</th>
                <th scope="col" className="px-4 py-2 font-medium">Duración</th>
                <th scope="col" className="px-4 py-2 font-medium">Para</th>
                <th scope="col" className="px-4 py-2 font-medium">Origen</th>
                <th scope="col" className="px-4 py-2 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {tramos.map((t) => {
                // La misma `minutosDe` que usa `resumir`: es lo que hace que
                // la suma de esta columna cuadre con el total de arriba,
                // tope de 16 h incluido tanto en cerrados como en abiertos.
                const minutos = minutosDe(t, ahora);
                return (
                  <tr key={t.id}>
                    {esPropietario && <td className="px-4 py-2.5">{t.usuarioNombre ?? "—"}</td>}
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{FECHA_HORA.format(new Date(t.inicio))}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {t.fin === null ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Distintivo estado="ok" texto="En curso" />
                          <span>{formatearMinutos(minutos)}</span>
                        </span>
                      ) : (
                        formatearMinutos(minutos)
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {[t.proyectoNombre, t.clienteNombre].filter(Boolean).join(" · ") || (
                        <span style={{ color: "var(--texto-tenue)" }}>Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {t.origen === "anadido" ? <Distintivo estado="aviso" texto="Añadido" /> : <span style={{ color: "var(--texto-tenue)" }}>Medido</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {/* Solo en las filas propias: RLS no dejaría borrar las
                          ajenas, y enseñar un botón que siempre falla es
                          prometer lo que no se puede. El propietario ve las
                          de todos, pero solo borra las suyas. */}
                      {perfil && t.usuarioId === perfil.id && <BotonBorrarTramo id={t.id} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
