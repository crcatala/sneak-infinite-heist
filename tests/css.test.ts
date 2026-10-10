/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../src/client/", import.meta.url);
const sheets = readdirSync(dir)
  .filter((f: string) => f.endsWith(".css"))
  .map((file: string) => ({ file, css: readFileSync(new URL(file, dir), "utf8") }));

// Keyframe names are global across every stylesheet. When two files define the same name, the one that
// loads last silently replaces the other: the HUD tooltip once picked up the cursor bubble's `tip-in`,
// which animates `transform`, and so flashed in the corner of the screen for a frame.
describe("stylesheets", () => {
  it("define each @keyframes name once", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const { file, css } of sheets) {
      for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
        const first = seen.get(name);
        if (first) clashes.push(`${name} (${first} and ${file})`);
        else seen.set(name, file);
      }
    }
    // Guard against reading nothing and passing for the wrong reason.
    expect(seen.size).toBeGreaterThan(10);
    expect(seen.has("hud-tip-in")).toBe(true);
    expect(clashes).toEqual([]);
  });
});
