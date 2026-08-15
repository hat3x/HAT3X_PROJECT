import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/tests/**/*.test.{ts,tsx}"],
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
