import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The normalizer tests are pure (no DOM) — plain node environment.
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
