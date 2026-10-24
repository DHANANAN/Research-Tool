import { defineConfig } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export default defineConfig({
  css: { postcss: {} },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
  plugins: [
    {
      name: "version-offline-shell",
      apply: "build",
      closeBundle() {
        // Each build stages its own shell. A failed update must never overwrite
        // the previous service worker's complete and still-active shell cache.
        const path = fileURLToPath(new URL("./dist/sw.js", import.meta.url));
        const source = readFileSync(path, "utf8");
        writeFileSync(
          path,
          source.replaceAll("__RESEARCH_BUILD_ID__", randomUUID()),
        );
      },
    },
  ],
});
