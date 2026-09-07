import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

config({ path: fileURLToPath(new URL("./.env.local", import.meta.url)) });

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "node",
  },
});
