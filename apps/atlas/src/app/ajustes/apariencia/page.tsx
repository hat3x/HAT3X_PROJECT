import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { SelectorApariencia } from "@/components/ajustes/SelectorApariencia";

export default async function PaginaApariencia() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil) redirect("/login");

  return (
    <section className="max-w-3xl space-y-4">
      <header>
        <Link
          href="/ajustes"
          className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Ajustes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Apariencia</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Tu elección solo te afecta a ti. Los colores de estado —verde, ámbar,
          rojo— no cambian con la paleta: son significado, no decoración.
        </p>
      </header>
      <SelectorApariencia temaActual={perfil.tema} paletaActual={perfil.paleta} />
    </section>
  );
}
