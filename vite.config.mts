/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Version affichée sur l'écran de connexion : lue dans package.json, jamais écrite en dur.
const version = JSON.parse(readFileSync("./package.json", "utf-8")).version as string;

// base "./" : indispensable pour charger l'interface depuis un fichier local (Electron).
export default defineConfig({
  base: "./",
  define: { __VERSION_APP__: JSON.stringify(version) },
  plugins: [react()],
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.cjs"],
  },
});
