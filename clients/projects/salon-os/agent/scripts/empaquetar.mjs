import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

/**
 * Empaqueta el agente en algo que se pueda instalar en la clínica.
 *
 * ── POR QUÉ HACE FALTA ESTO ─────────────────────────────────────────────────
 * El agente vive en el monorepo y se ejecuta con `npm run dev`. Eso sirve para
 * desarrollar y no sirve para nada más: el ordenador de un gabinete no tiene el
 * repositorio, ni Node, ni nadie que sepa compilar. Y sobre todo, un programa
 * que alguien tiene que acordarse de abrir cada mañana no es una instalación,
 * es una tarea pendiente diaria que un día se olvida.
 *
 * Esto deja una carpeta con TODO dentro: el agente en un solo fichero, y los
 * dos scripts que lo instalan y lo quitan.
 *
 * ── POR QUÉ UN BUNDLE Y NO LOS .js SUELTOS ──────────────────────────────────
 * El agente importa `@/lib/imaging/*`, que es código compartido con la
 * aplicación, y `zod`. Copiar los `.js` compilados obligaría a arrastrar
 * `node_modules` y la mitad de `src/` del repo. Con un bundle, lo que se
 * entrega es un fichero.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const raizAgente = resolve(aqui, "..");
const salida = join(raizAgente, "dist-instalador");

rmSync(salida, { recursive: true, force: true });
mkdirSync(salida, { recursive: true });

await build({
  entryPoints: [join(raizAgente, "src", "index.ts")],
  bundle: true,
  platform: "node",
  // Node 20 es el mínimo declarado en package.json; apuntar más alto dejaría
  // fuera ordenadores que están perfectamente bien.
  target: "node20",
  format: "cjs",
  outfile: join(salida, "agente.cjs"),
  // El alias del monorepo: esbuild no lee el tsconfig de la app.
  alias: { "@": resolve(raizAgente, "..", "src") },
  legalComments: "none",
  // `import.meta` no existe en CommonJS y esbuild avisa de ello. Aquí es
  // deliberado: tanto `config.ts` como `index.ts` preguntan primero por
  // `__dirname` / `require.main` y solo caen en la rama ESM cuando corren en
  // desarrollo, donde no pasa por aquí. Se silencia porque un aviso que sale
  // en cada build y que no hay que arreglar acaba invitando a "arreglarlo"
  // quitando justo la comprobación que hace que el paquete funcione.
  logOverride: { "empty-import-meta": "silent" },
  banner: {
    js: "// Kairos — agente de captura de imagen. Generado; no editar a mano.",
  },
});

// Los dos scripts van dentro del paquete: quien lo recibe no tiene que buscar
// nada en ningún otro sitio.
for (const fichero of ["instalar.ps1", "desinstalar.ps1", "INSTALAR.bat", "LEEME.txt"]) {
  const origen = join(raizAgente, "instalador", fichero);
  if (!existsSync(origen)) {
    throw new Error(`Falta ${fichero} en agent/instalador/`);
  }
  cpSync(origen, join(salida, fichero));
}

writeFileSync(
  join(salida, "version.txt"),
  `${JSON.parse(
    (await import("node:fs")).readFileSync(join(raizAgente, "package.json"), "utf8"),
  ).version}\n`,
  "utf8",
);

// eslint-disable-next-line no-console
console.log(`Paquete listo en ${salida}`);
