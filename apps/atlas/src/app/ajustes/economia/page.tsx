import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { leerAjustes } from "@/lib/db/ajustes-economia";
import { FormEconomia } from "@/components/ajustes/FormEconomia";

export default async function PaginaEconomia() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya negaría la fila, pero un 404 es más honesto que un error.
  if (!perfil?.esPropietario) notFound();
  const actual = await leerAjustes(sb);

  return (
    <section className="max-w-3xl space-y-4">
      <header>
        <Link href="/ajustes" className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <ChevronLeft size={15} aria-hidden="true" />
          Ajustes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Economía</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo que cuesta una hora de trabajo, y quién emite las facturas. Viven aquí y no en el
          entorno porque son datos del negocio, y se cambian desde aquí.
        </p>
      </header>
      <FormEconomia actual={actual} />
    </section>
  );
}
