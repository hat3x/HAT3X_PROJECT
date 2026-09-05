import { redirect } from "next/navigation";

/**
 * /expediente ya NO es una sección propia: el Expediente clínico vive como
 * pestaña dentro de la ficha del paciente (/customers/[id]?tab=expediente), con
 * el paciente ya elegido.
 *
 * Esta ruta se conserva solo como REDIRECT para no romper enlaces/marcadores
 * antiguos:
 *   ?paciente=<id> → /customers/<id>?tab=expediente  (paciente ya elegido)
 *   sin paciente   → /customers                       (la lista es el selector)
 *
 * La carpeta permanece porque los server actions del expediente viven en
 * `./actions` y `./prescription-actions` y los usan varios hooks del módulo
 * dental (`use-consents`, `use-patient-images`, `use-prescriptions`). El gate de
 * sector (odontología) sigue en `./layout.tsx` (defensa en profundidad).
 */
export default async function ExpedientePage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}): Promise<never> {
  const { paciente } = await searchParams;
  if (paciente !== undefined && paciente.length > 0) {
    redirect(`/customers/${paciente}?tab=expediente`);
  }
  redirect("/customers");
}
