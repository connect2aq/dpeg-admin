import { defineConfig } from "vitest/config";
import path from "path";

// Pure-logic unit tests only (no Next.js runtime, no React rendering) — just enough
// config to resolve this project's "@/*" path alias the same way tsconfig.json does.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
});
