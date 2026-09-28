/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" : indispensable pour charger l'interface depuis un fichier local (Electron).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
