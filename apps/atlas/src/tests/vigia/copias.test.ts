import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

//
// La Edge Function no puede importar de `src/lib`: Deno no resuelve el alias
// `@/` de Next, y el despliegue solo sube `supabase/functions`. Por eso hay dos
// copias de la lógica de decisión.
//
// Una copia que hay que sincronizar a mano acaba divergiendo SIEMPRE, y aquí
// divergir significa que la pantalla y el motor de vigilancia decidan cosas
// distintas sobre el mismo servicio. Este test lo convierte en un fallo ruidoso
// en vez de en un bicho silencioso.
//

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const CABECERA_2 = "// Si cambias el original, vuelve a copiarlo.";
const CABECERA_3 = "// El test copias.test.ts falla si divergen.";

function leer(ruta: string): string {
  return readFileSync(resolve(RAIZ, ruta), "utf8").replace(/\r\n/g, "\n");
}

describe.each([
  ["vigia", "incidencias", "maquina", "maquina"],
  ["vigia", "incidencias", "evaluar", "evaluar"],
  ["avisar", "alertas", "agrupar", "agrupar"],
  ["avisar", "alertas", "firma", "firma"],
  ["avisar", "alertas", "pendientes", "pendientes"],
  // El original vive en `cobro/pendientes.ts`, pero en la carpeta de la Edge
  // Function ya hay un `pendientes.ts` — el de incidencias. Se copia con
  // nombre distinto, `cobro.ts`, para no pisarlo.
  ["avisar", "cobro", "pendientes", "cobro"],
  // El original vive en `horas/abiertos.ts`, con el mismo nombre en la Edge
  // Function porque ahí no hay ya un `abiertos.ts` con el que choque.
  ["avisar", "horas", "abiertos", "fichajes"],
])("copia de %s/%s.ts para Deno", (funcion, carpeta, nombreOriginal, nombreCopia) => {
  const original = leer(`src/lib/${carpeta}/${nombreOriginal}.ts`);
  const copia = leer(`supabase/functions/${funcion}/${nombreCopia}.ts`);

  it("lleva la cabecera que avisa de que es una copia", () => {
    const lineas = copia.split("\n").slice(0, 3);
    expect(lineas[0]).toBe(
      `// COPIA de src/lib/${carpeta}/${nombreOriginal}.ts — NO editar aquí.`
    );
    expect(lineas[1]).toBe(CABECERA_2);
    expect(lineas[2]).toBe(CABECERA_3);
  });

  it("es idéntica al original quitando esa cabecera", () => {
    const sinCabecera = copia.split("\n").slice(3).join("\n");
    expect(sinCabecera).toBe(original);
  });

  // Si alguien mete un import de Node en el original, la función deja de
  // arrancar en Deno. Mejor enterarse aquí que en producción.
  it("no importa nada: tiene que correr igual en Deno que en Node", () => {
    expect(original).not.toMatch(/^\s*import\s/m);
    expect(copia).not.toMatch(/^\s*import\s/m);
  });
});
