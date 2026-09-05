import { redirect } from "next/navigation";

/**
 * /planes ya NO es una sección propia: Planes vive como pestaña dentro de la
 * ficha del paciente (/customers/[id]?tab=planes), con el paciente ya elegido.
 *
 * Esta ruta se conserva solo como REDIRECT para no romper enlaces/marcadores
 * antiguos:
 *   ?paciente=<id> → /customers/<id>?tab=planes  (paciente ya elegido)
 *   sin paciente   → /customers                  (la lista es el selector)
 *
 * La carpeta permanece porque los server actions de planes viven en `./actions`
 * y los usa medio módulo dental (hooks `use-treatment`, `use-insurers`, …). El
 * gate de sector (odontología) sigue en `./layout.tsx` (defensa en profundidad).
 */
export default async function PlanesPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}): Promise<never> {
  const { paciente } = await searchParams;
  if (paciente !== undefined && paciente.length > 0) {
    redirect(`/customers/${paciente}?tab=planes`);
  }
  redirect("/customers");
}
