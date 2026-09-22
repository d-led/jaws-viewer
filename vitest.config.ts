import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Individual UI tests opt into a DOM with `// @vitest-environment happy-dom`.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
