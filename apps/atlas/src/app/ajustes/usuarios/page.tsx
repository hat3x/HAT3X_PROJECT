import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarUsuarios } from "@/lib/db/usuarios";
import { listarProyectos } from "@/lib/db/proyectos";
import { PermisosUsuario } from "@/components/ajustes/PermisosUsuario";

export default async function PaginaUsuarios() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta, igual que el llavero: RLS ya recortaría, pero un 404 es más
  // honesto que una pantalla a medias.
  if (!perfil?.esPropietario) notFound();

  const [usuarios, proyectos] = await Promise.all([
    listarUsuarios(sb),
    listarProyectos(sb),
  ]);
  const elegibles = proyectos.map((p) => ({ id: p.id, nombre: p.nombre }));

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
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios y permisos</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Los permisos son por proyecto. Los importes solo los ves tú, sea cual sea
          el permiso que repartas.
        </p>
      </header>

      {usuarios.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">No hay nadie más todavía.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Las cuentas se crean desde Supabase; aquí se reparte a qué llega cada una.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {usuarios.map((u) => (
            <li key={u.id} className="cristal cristal-denso p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{u.nombre ?? "(sin nombre)"}</span>
                {u.esPropietario && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      color: "var(--estado-ok)",
                      background:
                        "color-mix(in srgb, var(--estado-ok) 16%, transparent)",
                    }}
                  >
                    Propietario · acceso total
                  </span>
                )}
              </div>

              {/* Al propietario no se le reparten permisos: los tiene todos por
                  condición, no por asignación. */}
              {!u.esPropietario && (
                <PermisosUsuario
                  usuarioId={u.id}
                  permisos={u.permisos}
                  proyectos={elegibles}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
