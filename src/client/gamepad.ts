// Gamepad support: polls the Gamepad API and turns the D-pad / left stick and face buttons into the
// same key events the menus and the game already understand. A = Enter, B = Escape, X = Space
// (roll / skip), Y = F (focus camera), Start = Escape (pause), shoulders = camera presets.

const REPEAT_MS = 180;

const BUTTON_KEYS: Record<number, string> = {
  0: "Enter", // A / cross
  1: "Escape", // B / circle
  2: " ", // X / square
  3: "f", // Y / triangle
  4: "1", // LB: overview
  5: "2", // RB: top-down
  9: "Escape", // Start: pause
  12: "ArrowUp",
  13: "ArrowDown",
  14: "ArrowLeft",
  15: "ArrowRight",
};

function press(key: string) {
  const init: KeyboardEventInit = { key, code: key === " " ? "Space" : key, bubbles: true, cancelable: true };
  const target = document.activeElement ?? window;
  const down = new KeyboardEvent("keydown", init);
  target.dispatchEvent(down);
  // Enter on a focused button should also click it, like a real key press.
  if (key === "Enter" && !down.defaultPrevented && document.activeElement instanceof HTMLButtonElement) document.activeElement.click();
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

export function startGamepad() {
  if (typeof navigator === "undefined" || !("getGamepads" in navigator)) return;
  let raf = 0;
  const held = new Map<string, number>();
  const loop = () => {
    const now = performance.now();
    const pads = navigator.getGamepads().filter((p): p is Gamepad => !!p);
    const active = new Set<string>();
    for (const pad of pads) {
      pad.buttons.forEach((b, i) => {
        if (b.pressed && BUTTON_KEYS[i]) active.add(BUTTON_KEYS[i]);
      });
      const [x = 0, y = 0] = pad.axes;
      if (y < -0.6) active.add("ArrowUp");
      if (y > 0.6) active.add("ArrowDown");
      if (x < -0.6) active.add("ArrowLeft");
      if (x > 0.6) active.add("ArrowRight");
    }
    for (const key of active) {
      const last = held.get(key);
      const arrow = key.startsWith("Arrow");
      if (last === undefined || (arrow && now - last > REPEAT_MS * (last < 0 ? 2 : 1))) {
        press(key);
        held.set(key, now);
      }
    }
    for (const key of [...held.keys()]) if (!active.has(key)) held.delete(key);
    raf = pads.length ? requestAnimationFrame(loop) : 0;
  };
  window.addEventListener("gamepadconnected", () => {
    if (!raf) raf = requestAnimationFrame(loop);
  });
}
