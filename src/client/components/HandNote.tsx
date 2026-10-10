// A hand-drawn style arrow with a pencil-written note, used for first-time hints. It sits inside a
// `position: relative` wrapper around the thing it points at and never takes pointer events.

/** Where the note sits relative to its target: `right` points left at it, `above` points down at it. */
export type HandNotePlacement = "right" | "above";

export function HandNote({ text, placement }: { text: string; placement: HandNotePlacement }) {
  const arrow =
    placement === "right" ? (
      <svg className="hand-arrow" viewBox="0 0 120 70" aria-hidden="true">
        <path className="shaft" pathLength={1} d="M112 14 C92 6 66 12 46 28 S20 50 11 50" />
        <path className="head" d="M10 50 C14 46 17 43 21 40 M10 50 C14 53 18 57 22 60" />
      </svg>
    ) : (
      <svg className="hand-arrow" viewBox="0 0 70 120" aria-hidden="true">
        <path className="shaft" pathLength={1} d="M58 6 C70 30 50 58 36 80 S30 100 31 108" />
        <path className="head" d="M31 108 C27 103 24 99 19 95 M31 108 C35 103 39 100 43 96" />
      </svg>
    );
  return (
    <span className={`hand-note ${placement}`} role="note">
      {placement === "above" && <span className="hand-text">{text}</span>}
      {arrow}
      {placement === "right" && <span className="hand-text">{text}</span>}
    </span>
  );
}
