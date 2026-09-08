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
    // These suites are integration tests against one shared local Postgres database, and
    // several of them assert on global counts (all questions, all analysis bands) or clean
    // up whole tables. Running files in parallel lets one suite's fixtures leak into
    // another's assertions, so files run one at a time.
    fileParallelism: false,
  },
});
