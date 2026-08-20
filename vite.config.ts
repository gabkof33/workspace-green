import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    // Sem source map em produção. Com ele, o F12 remonta o TypeScript
    // original inteiro — nomes, comentários e arquivos — a partir do bundle
    // minificado. O dev server continua com mapa próprio, não afetado aqui.
    sourcemap: false,
  },
  esbuild: {
    legalComments: "none",
  },
});
