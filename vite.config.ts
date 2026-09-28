import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineConfig(({ mode }) => ({
  // Vitest runs pure logic in node; the Cloudflare plugin is only needed for dev/build.
  plugins: mode === "test" ? [] : [react(), cloudflare()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  // Localhost only by default (the dev server runs with DEV_CHEATS and a public dev invite key).
  // `npm run dev:host` opts in to LAN access; see README → Quick start.
  server: {
    port: 3000,
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
}));
