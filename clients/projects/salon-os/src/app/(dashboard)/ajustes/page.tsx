import { redirect } from "next/navigation";

/**
 * `/ajustes` no tiene contenido propio: redirige a la primera sección.
 * El guard de acceso vive en el layout de ajustes.
 */
export default function AjustesIndexPage(): never {
  redirect("/ajustes/sedes");
}
