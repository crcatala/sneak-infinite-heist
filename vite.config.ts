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
  // `dev:host` deliberately disables host checking for LAN/Tailscale access. The dev server
  // runs with DEV_CHEATS and a public dev invite key, so only use it on a trusted network.
  server: {
    port: 3000,
    allowedHosts: process.env.SNEAK_DEV_ALLOW_ALL_HOSTS === "1" ? true : undefined,
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
