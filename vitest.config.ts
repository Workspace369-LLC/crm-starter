import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "server-only": path.resolve("test/server-only-stub.ts"), "@": path.resolve(".") } },
  test: { include: ["test/**/*.test.ts"] },
});
