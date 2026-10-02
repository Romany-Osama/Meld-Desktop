import { defineConfig } from "vitest/config";

// Frontend unit tests live next to the code in src/; scripts/tests use node:test (npm run test:scripts).
export default defineConfig({ test: { include: ["src/**/*.test.ts", "src/**/*.test.tsx"], environment: "node" } });
