import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  // El tsconfig usa `jsx: "preserve"` (lo transforma Next). Para que los tests de
  // componentes puedan importar módulos `.tsx`, el transformador de vitest (oxc, en
  // rolldown-vite) usa el runtime automático de React (igual que Next: los
  // componentes no importan React). Solo afecta a `.tsx`/`.jsx`; los tests que
  // importan solo `.ts` no cambian.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/hooks/**"],
      exclude: ["src/lib/supabase/**"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
