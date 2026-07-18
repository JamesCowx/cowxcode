import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
        docs: "docs.html",
        download: "download.html",
        "404": "404.html",
      },
    },
  },
});
