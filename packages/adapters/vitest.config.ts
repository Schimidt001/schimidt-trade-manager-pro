import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@schimidt-brain/contracts": path.resolve(
        __dirname,
        "../contracts/dist/index.js"
      ),
    },
  },
});
