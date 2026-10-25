import { defineConfig } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export default defineConfig({
  build: { outDir: "../dist", emptyOutDir: true },
  css: { postcss: {} },
  optimizeDeps: { exclude: ["write-excel-file"] },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
  plugins: [
    {
      name: "literal-spreadsheet-strings",
      transform(code, id) {
        if (
          !id
            .replaceAll("\\", "/")
            .endsWith(
              "/write-excel-file/modules/xlsx/initializeSharedStrings.js",
            )
        )
          return null;
        // v4.1.1 indexes shared strings with a plain object. User text such as
        // "constructor" or "__proto__" must not resolve an inherited property.
        // Keep the verified dependency intact and fix its dictionary at compile time.
        const original = "var sharedStringIdByString = {};";
        if (!code.includes(original))
          throw new Error(
            "Review the spreadsheet string-dictionary compatibility patch after updating write-excel-file.",
          );
        return {
          code: code.replace(
            original,
            "var sharedStringIdByString = Object.create(null);",
          ),
          map: null,
        };
      },
    },
    {
      name: "version-offline-shell",
      apply: "build",
      closeBundle() {
        // Each build stages its own shell. A failed update must never overwrite
        // the previous service worker's complete and still-active shell cache.
        const path = fileURLToPath(new URL("../dist/sw.js", import.meta.url));
        const source = readFileSync(path, "utf8");
        writeFileSync(
          path,
          source.replaceAll("__RESEARCH_BUILD_ID__", randomUUID()),
        );
      },
    },
  ],
});
