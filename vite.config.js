import { defineConfig } from "vite";

// Su GitHub Pages il sito sta sotto /nome-repo/, non sulla radice del dominio.
// È l'inciampo classico del primo deploy: senza questo, in produzione
// non carica niente e la console si riempie di 404.
// In locale (`npm run dev`) la base resta "/".
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "vela";

export default defineConfig(({ command }) => ({
  base: command === "build" ? `/${repo}/` : "/",
  build: {
    target: "es2022",
    outDir: "dist",
    assetsInlineLimit: 0
  }
}));
