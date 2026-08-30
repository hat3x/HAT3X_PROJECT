import { notFound } from "next/navigation";
import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { obtenerCliente, serviciosDeCliente } from "@/lib/db/clientes";
import { estadoDeServicios } from "@/lib/db/servicios-estado";
import { margenDe } from "@/lib/db/rentabilidad";
import { formatearUptime } from "@/lib/uptime/calcular";
import { mesDe, hoyEnMadrid } from "@/lib/dinero";
import { Distintivo } from "@/components/ui/Distintivo";
import { ResumenMargen } from "@/components/dinero/ResumenMargen";
import type { EstadoCheck } from "@/lib/incidencias/maquina";
import type { EstadoVisual } from "@/components/ui/Distintivo";

// Las mismas palabras y los mismos colores que la ficha de proyecto: el mismo
// servicio no puede llamarse de dos formas distintas según por dónde entres.
const TEXTO_ESTADO: Record<EstadoCheck, string> = {
  ok: "Bien",
  degradado: "Lento",
  caido: "Caído",
  desconocido: "Sin datos",
};

const COLOR_ESTADO: Record<EstadoCheck, EstadoVisual> = {
  ok: "ok",
  degradado: "aviso",
  caido: "caido",
  desconocido: "desconocido",
};

const EUROS = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

/**
 * `alta` es un `date` sin hora en ISO AAAA-MM-DD. La `Z` es imprescindible:
 * sin ella JavaScript lo interpreta en zona local y en Europe/Madrid mostraría
 * «30 abr» donde el dato dice 2026-05-01.
 */
function formatearFecha(iso: string): string {
  return FECHA.format(new Date(`${iso}T00:00:00Z`));
}

export default async function FichaCliente({
  params,
}: {
  params: { slug: string };
}) {
  const sb = await clienteServidor();
  const [perfil, cliente] = await Promise.all([
    obtenerPerfil(sb),
    obtenerCliente(sb, params.slug),
  ]);
  if (!cliente) notFound();
  const verImportes = perfil?.esPropietario ?? false;
  // No se llama a `margenDe` si no es propietario: se ahorra la consulta, y
  // RLS la lanzaría igual si se intentase.
  const mes = mesDe(hoyEnMadrid());
  const margen = verImportes ? await margenDe(sb, { clienteId: cliente.id }, mes) : null;

  // Lo suyo, y cómo está ahora mismo. Es la pregunta que trae a alguien a esta
  // pantalla: «¿le está pasando algo a este cliente?».
  const suyos = await serviciosDeCliente(sb, cliente.id);
  const estados = await estadoDeServicios(
    sb,
    suyos.map((s) => s.id)
  );
  const servicios = suyos.map((s) => ({
    ...s,
    ...(estados.get(s.id) ?? {
      estado: "desconocido" as EstadoCheck,
      uptime30d: null,
      ultimoError: null,
    }),
  }));
  const caidos = servicios.filter((s) => s.estado === "caido").length;

  return (
    <article className="space-y-4">
      <header className="cristal overflow-hidden">
        <div
          className="h-24"
          style={{
            background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-2))",
          }}
        />
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{cliente.nombre}</h1>
            <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
              {[cliente.sector, cliente.direccion].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {verImportes && cliente.cuotaTotal !== null && (
              <span className="text-lg font-semibold tabular-nums">
                {EUROS.format(cliente.cuotaTotal)}/mes
              </span>
            )}
            <Distintivo
              estado={cliente.estado === "activo" ? "ok" : "desconocido"}
              texto={cliente.estado === "activo" ? "Activo" : cliente.estado}
            />
          </div>
        </div>
      </header>

      <section className="cristal p-4">
        <h2
          className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}
        >
          Cómo está ahora mismo
          {caidos > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal"
              style={{ background: "var(--estado-caido)", color: "#fff" }}
            >
              {caidos} {caidos === 1 ? "servicio caído" : "servicios caídos"}
            </span>
          )}
        </h2>
        {servicios.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
            No hay ningún servicio suyo dado de alta. Sin servicios no hay nada
            que vigilar, y esta ficha no puede decirte si algo le está fallando.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {servicios.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Distintivo
                  estado={COLOR_ESTADO[s.estado]}
                  texto={TEXTO_ESTADO[s.estado]}
                />
                <span className="font-medium">{s.nombre}</span>
                <span style={{ color: "var(--texto-tenue)" }}>{s.tipo}</span>
                {s.uptime30d !== null && (
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: "var(--texto-tenue)" }}
                    title="Uptime de los últimos 30 días"
                  >
                    {formatearUptime(s.uptime30d)}
                  </span>
                )}
                {s.ultimoError && (
                  <span
                    className="truncate text-xs"
                    style={{ color: "var(--estado-caido)" }}
                  >
                    {s.ultimoError}
                  </span>
                )}
                <Link
                  href={`/proyectos/${s.proyectoSlug}`}
                  className="cristal-denso ml-auto rounded-full px-2 py-0.5 text-[11px] hover:underline"
                >
                  {s.proyectoNombre}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cristal p-4">
        <h2
          className="mb-3 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}
        >
          Qué tiene contratado
        </h2>
        {cliente.contratos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
            Sin contratos todavía.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {cliente.contratos.map((ct) => (
              <li key={ct.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-medium">Alta {formatearFecha(ct.alta)}</span>
                {ct.addons.map((a) => (
                  <span
                    key={a}
                    className="cristal-denso rounded-full px-2 py-0.5 text-[11px]"
                  >
                    {a}
                  </span>
                ))}
                <span className="ml-auto tabular-nums font-semibold">
                  {ct.cuotaMensual !== null ? EUROS.format(ct.cuotaMensual) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {margen && (
        <ResumenMargen fila={margen} mes={mes} costeHoraCentimos={margen.costeHoraCentimos} />
      )}

      <section className="cristal p-4">
        <h2
          className="mb-3 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--texto-tenue)" }}
        >
          Contactos
        </h2>
        {cliente.contactos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
            Sin contactos.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {cliente.contactos.map((k) => (
              <li key={k.id} className="flex items-center gap-2">
                <span className="font-medium">{k.nombre}</span>
                <span style={{ color: "var(--texto-tenue)" }}>{k.rol}</span>
                {k.esPrincipal && (
                  <span className="cristal-denso rounded-full px-2 py-0.5 text-[11px]">
                    principal
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
