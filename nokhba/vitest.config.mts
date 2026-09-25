import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // next-auth imports "next/server" without an extension, which Node's ESM resolver rejects.
      { find: /^next\/server$/, replacement: "next/server.js" },
      { find: "server-only", replacement: path.resolve(root, "tests/stubs/server-only.ts") },
      { find: "@", replacement: root },
    ],
  },
  test: {
    environment: "node",
    // Process next-auth through Vite so the "next/server" alias above applies to it as well.
    server: { deps: { inline: [/next-auth/, /@auth\/core/] } },
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
