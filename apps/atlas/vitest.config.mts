import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // El tsconfig usa `jsx: "preserve"` porque lo transforma Next. Vitest necesita
  // el runtime automático de JSX para compilar los tests de componente; sin
  // esto fallan con «React is not defined». Solo afecta a los tests.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/tests/**/*.test.{ts,tsx}"],
    // Los tests de esquema y de datos comparten la misma base local. En
    // paralelo se pisan entre ficheros: uno ve las filas que otro está
    // creando. En secuencia son deterministas.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      exclude: [
        // Envoltorios de red, no lógica: no aportan cobertura significativa.
        "src/lib/supabase/**",
        // Los `acciones-*` son el límite HTTP y nada más: resuelven el cliente
        // de servidor, delegan en el núcleo y revalidan la caché. Lo que deciden
        // vive en el módulo que recibe `sb`, y ese sí se prueba contra la base.
        //
        // Sin esto la métrica mentía en las dos direcciones: `acciones-push` y
        // `apariencia` salían al 0 % solo porque un test de componente los
        // cargaba con `vi.mock`, y los otros cinco no aparecían siquiera.
        "src/lib/db/acciones-*.ts",
      ],
      reporter: ["text", "html"],
      thresholds: { lines: 80, functions: 80 },
    },
  },
});
