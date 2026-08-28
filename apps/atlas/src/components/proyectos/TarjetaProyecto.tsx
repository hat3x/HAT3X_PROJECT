import Link from "next/link";
import type { ProyectoResumen } from "@/lib/db/proyectos";
import { Portada } from "./Portada";
import { Distintivo, type EstadoVisual } from "@/components/ui/Distintivo";

const ESTADO: Record<string, { visual: EstadoVisual; texto: string }> = {
  produccion: { visual: "ok", texto: "En producción" },
  mantenimiento: { visual: "ok", texto: "Mantenimiento" },
  desarrollo: { visual: "desconocido", texto: "En desarrollo" },
  pausado: { visual: "aviso", texto: "Pausado" },
  retirado: { visual: "desconocido", texto: "Retirado" },
};

const TIPO: Record<string, string> = {
  voz: "Voz",
  chatbot: "Chatbot",
  "web-app": "Web / App",
  automatizacion: "Automatización",
  "producto-propio": "Producto propio",
  interno: "Interno",
};

export function TarjetaProyecto({ proyecto }: { proyecto: ProyectoResumen }) {
  const estado = ESTADO[proyecto.estado] ?? {
    visual: "desconocido" as const,
    texto: proyecto.estado,
  };
  // Hace visible el eje comercial desde el eje técnico: mirando Kairos ves
  // cuántos clientes lo tienen contratado.
  const clientes =
    proyecto.numClientes === 1 ? "1 cliente" : `${proyecto.numClientes} clientes`;

  return (
    <Link
      href={`/proyectos/${proyecto.slug}`}
      className="cristal block overflow-hidden transition-transform hover:scale-[1.01]"
    >
      <div className="relative h-28">
        <Portada
          portadaUrl={proyecto.portadaUrl}
          gradiente={proyecto.gradiente}
          nombre={proyecto.nombre}
        />
        <div className="absolute right-2 top-2">
          <Distintivo estado={estado.visual} texto={estado.texto} />
        </div>
      </div>
      <div className="p-3">
        <h3 className="truncate font-semibold tracking-tight">{proyecto.nombre}</h3>
        <p className="truncate text-sm" style={{ color: "var(--texto-tenue)" }}>
          {TIPO[proyecto.tipo] ?? proyecto.tipo} · {clientes}
        </p>
      </div>
    </Link>
  );
}
