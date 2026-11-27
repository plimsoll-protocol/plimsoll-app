import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@plimsoll/sdk": root("../../packages/sdk/src/index.ts"),
      "@": root("."),
      "next/navigation": root("test/__mocks__/next-navigation.ts"),
    },
  },
  test: { include: ["test/**/*.test.ts"] },
});
