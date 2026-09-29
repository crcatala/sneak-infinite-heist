import { spawn } from "node:child_process";

console.warn(`
⚠️  WARNING: Starting the dev server on all network interfaces and allowing all hostnames.
   Anyone who can reach this server may access the app. Local dev enables cheats and uses
   a well-known invite key. Use only on a network you trust (for example, your private Tailscale).
`);

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Could not locate npm. Run this with `npm run dev:host`.");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [npmCli, "run", "dev", "--", "--host", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, SNEAK_DEV_ALLOW_ALL_HOSTS: "1" },
  },
);

child.on("error", (error) => {
  console.error("Failed to start the Vite dev server:", error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
