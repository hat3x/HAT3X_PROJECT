/**
 * Convierte un nombre en el identificador que Atlas usa en las URL.
 *
 * Lo que devuelve tiene que pasar el patrón que valida `acciones-clientes.ts`
 * (`^[a-z0-9]+(-[a-z0-9]+)*$`), o el formulario propondría un identificador que
 * el servidor rechaza. Hay un test que lo comprueba con nombres reales.
 *
 *   "Clínica Dental Biodental" → "clinica-dental-biodental"
 *   "MTDI & Co."               → "mtdi-co"
 */
export function aSlug(nombre: string): string {
  return (
    nombre
      // Descompone cada letra acentuada en letra + marca...
      .normalize("NFD")
      // ...y borra las marcas: «í» queda «i» sin tabla de equivalencias.
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}
