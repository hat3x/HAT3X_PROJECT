import { SectorGate } from "@/components/guards/sector-gate";

/**
 * Layout del grupo de rutas /periodontograma.
 *
 * Gate de sector en SERVIDOR (defensa en profundidad): solo el sector
 * "odontologia" puede acceder a estas rutas. Un usuario de otro sector que
 * fuerce la URL directamente es redirigido a /dashboard antes de que el
 * árbol de la página se renderice.
 *
 * Idéntico al layout de /odontograma (misma capa, mismo gate): el nav omite
 * el enlace para sectores distintos de odontología (primera capa); este
 * layout rechaza en servidor antes del primer render (segunda capa).
 */
export default function PeriodontogramaLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <SectorGate required="odontologia">{children}</SectorGate>;
}
