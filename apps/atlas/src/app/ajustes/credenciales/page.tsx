import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarCredenciales } from "@/lib/db/credenciales";
import { listarProyectos } from "@/lib/db/proyectos";
import { FormCredencial } from "@/components/ajustes/FormCredencial";
import { FilaCredencial } from "@/components/ajustes/FilaCredencial";

export default async function PaginaCredenciales() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya devolvería lista vacía, pero un 404 es más honesto que
  // una pantalla vacía que parece rota.
  if (!perfil?.esPropietario) notFound();

  const [credenciales, proyectos] = await Promise.all([
    listarCredenciales(sb),
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
        <h1 className="text-2xl font-semibold tracking-tight">Llavero</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Las claves entran una vez y no se vuelven a mostrar. Si pierdes una, se
          rota: no se recupera.
        </p>
      </header>

      <div
        className="cristal flex items-start gap-3 p-3 text-sm"
        style={{ color: "var(--texto-tenue)" }}
      >
        <ShieldAlert size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p>
          Los secretos se cifran con AES-256-GCM antes de tocar la base de datos.
          La clave maestra vive en <code>ATLAS_MASTER_KEY</code>, fuera de aquí:
          robar el llavero exige comprometer los dos sitios. Cada vez que Atlas
          abre una clave para usarla, queda registrado.
        </p>
      </div>

      <FormCredencial proyectos={elegibles} />

      <div className="cristal cristal-denso overflow-hidden">
        {credenciales.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--texto-tenue)" }}>
            El llavero está vacío.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {credenciales.map((c) => (
              <FilaCredencial key={c.id} credencial={c} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
