import { defineConfig, type Plugin } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { readFileSync } from "fs";

/**
 * Vite plugin to handle `import x from "./file.md" with { type: "text" }`.
 * Bun supports import attributes natively; Vite needs this shim.
 */
function importTextAttributes(): Plugin {
  return {
    name: "import-text-attributes",
    load(id) {
      if (id.endsWith(".md")) {
        const content = readFileSync(id, "utf-8");
        return `export default ${JSON.stringify(content)};`;
      }
    },
  };
}

export default defineConfig({
  plugins: [tsconfigPaths(), importTextAttributes()],
  test: {
    globals: false,
  },
});
