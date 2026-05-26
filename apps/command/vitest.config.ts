import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/helpers/setup.ts"],
    // Sequential file execution — task ID generator uses a sequential counter
    // that is not safe under concurrent inserts (single-user CLI design)
    fileParallelism: false,
  },
})
