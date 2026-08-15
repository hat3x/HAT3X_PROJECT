import Link from "next/link";
import type { ClienteResumen } from "@/lib/db/clientes";
import { Distintivo, type EstadoVisual } from "@/components/ui/Distintivo";

const ESTADO: Record<string, { visual: EstadoVisual; texto: string }> = {
  activo: { visual: "ok", texto: "Activo" },
  potencial: { visual: "desconocido", texto: "Potencial" },
  pausado: { visual: "aviso", texto: "Pausado" },
  cerrado: { visual: "desconocido", texto: "Cerrado" },
};

const EUROS = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function TarjetaCliente({
  cliente,
  verImportes,
}: {
  cliente: ClienteResumen;
  verImportes: boolean;
}) {
  const estado = ESTADO[cliente.estado] ?? {
    visual: "desconocido" as const,
    texto: cliente.estado,
  };
  const proyectos =
    cliente.numProyectos === 1 ? "1 proyecto" : `${cliente.numProyectos} proyectos`;

  return (
    <Link
      href={`/clientes/${cliente.slug}`}
      className="cristal block p-4 transition-transform hover:scale-[1.01]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold tracking-tight">{cliente.nombre}</h3>
          <p className="truncate text-sm" style={{ color: "var(--texto-tenue)" }}>
            {cliente.sector ? `${cliente.sector} · ` : ""}
            {proyectos}
          </p>
        </div>
        <Distintivo estado={estado.visual} texto={estado.texto} />
      </div>
      {/* Doble condición a propósito: sin permiso NO se pinta cifra alguna, y
          cuotaTotal null significa «no puedes verla», no «cero euros». */}
      {verImportes && cliente.cuotaTotal !== null && (
        <p className="mt-3 text-lg font-semibold tabular-nums">
          {EUROS.format(cliente.cuotaTotal)}
          <span
            className="ml-1 text-xs font-normal"
            style={{ color: "var(--texto-tenue)" }}
          >
            /mes
          </span>
        </p>
      )}
    </Link>
  );
}
