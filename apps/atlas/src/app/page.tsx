import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { cargarResumen } from "@/lib/db/resumen";
import { Conmutador } from "@/components/resumen/Conmutador";
import { SalaDeControl } from "@/components/resumen/SalaDeControl";
import { VistaLista } from "@/components/resumen/VistaLista";
import { VistaOficina } from "@/components/resumen/VistaOficina";

export default async function Inicio() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);

  // El gating se decide AQUÍ, en servidor, y viaja como prop: un componente
  // cliente no puede resolver `esPropietario` por su cuenta.
  const verImportes = perfil?.esPropietario ?? false;
  const vista = perfil?.vista ?? "control";

  const { filas, contadores } = await cargarResumen(sb, verImportes);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resumen</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Lo roto sube arriba. Si no hay nada arriba, no hay nada roto.
          </p>
        </div>
        <Conmutador actual={vista} />
      </header>

      {vista === "lista" ? (
        <VistaLista filas={filas} verImportes={verImportes} />
      ) : vista === "oficina" ? (
        <VistaOficina filas={filas} />
      ) : (
        <SalaDeControl filas={filas} contadores={contadores} verImportes={verImportes} />
      )}
    </section>
  );
}
