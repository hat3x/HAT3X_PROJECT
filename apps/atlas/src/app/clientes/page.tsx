import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { listarClientes } from "@/lib/db/clientes";
import { TarjetaCliente } from "@/components/clientes/TarjetaCliente";

export default async function PaginaClientes() {
  const sb = await clienteServidor();
  // El gating se calcula AQUÍ, en servidor, y viaja como prop. Un componente
  // cliente no puede resolver `esPropietario` por su cuenta.
  const [perfil, clientes] = await Promise.all([obtenerPerfil(sb), listarClientes(sb)]);
  const verImportes = perfil?.esPropietario ?? false;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <span className="text-sm" style={{ color: "var(--texto-tenue)" }}>
          {clientes.length === 1 ? "1 cliente" : `${clientes.length} clientes`}
        </span>
      </header>

      {clientes.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Todavía no hay ningún cliente.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Trae los que ya tienes con el script de migración.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clientes.map((c) => (
            <TarjetaCliente key={c.id} cliente={c} verImportes={verImportes} />
          ))}
        </div>
      )}
    </section>
  );
}
