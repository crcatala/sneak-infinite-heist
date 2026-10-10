import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// Short commit SHA of the build, with "-dirty" when the tree has uncommitted changes. Shown on the title screen.
function buildCommit(): string {
  try {
    const git = (args: string[]) =>
      execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const sha = git(["rev-parse", "--short", "HEAD"]);
    return git(["status", "--porcelain"]) ? `${sha}-dirty` : sha;
  } catch {
    // No git checkout (e.g. a source tarball); the title screen falls back to "unknown".
    return "unknown";
  }
}

export default defineConfig(({ mode }) => ({
  // Vitest runs pure logic in node; the Cloudflare plugin is only needed for dev/build.
  plugins: mode === "test" ? [] : [react(), cloudflare()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
    "import.meta.env.VITE_APP_COMMIT": JSON.stringify(buildCommit()),
  },
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
    // Durable Object tests run on in-memory stand-ins for the Workers runtime.
    alias: { "cloudflare:workers": fileURLToPath(new URL("./tests/worker/fakeRuntime.ts", import.meta.url)) },
  },
}));
