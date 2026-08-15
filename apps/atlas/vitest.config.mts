import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
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
      // Envoltorios de red, no lógica: no aportan cobertura significativa.
      exclude: ["src/lib/supabase/**"],
      reporter: ["text", "html"],
      thresholds: { lines: 80, functions: 80 },
    },
  },
});
