import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside the React Server environment; tests run services directly.
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://applyflow:applyflow@localhost:5432/applyflow_test",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123",
      STORAGE_DRIVER: "local",
      STORAGE_DIR: path.resolve(__dirname, ".test-storage"),
    },
  },
});
