// The game's icon set: 24px grid, 2px round strokes, currentColor (docs/STYLE.md §3).

const PATHS: Record<string, string> = {
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  scan: "M3 8h12v8H3z M15 11l5-3v8l-5-3 M7 11.5c0-1 .8-1.5 1.8-1.5s1.7.5 1.7 1.2c0 1.6-3.5 1-3.5 2.6 0 .7.8 1.2 1.8 1.2s1.7-.5 1.7-1.3",
  motion: "M4 19V6l4 7 4-7v13 M16 8c2 1 2 7 0 8 M19 5c3.5 2 3.5 12 0 14",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3 M12 14.5v2",
  unlock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2 M12 14.5v2",
  scissors: "M6 6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M6 13a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M8.2 10 20 4 M8.2 14 20 20",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  frame: "M4 4h16v16H4z M7 17l4-5 3 3 2-2 2 4 M9 9.5a1.5 1.5 0 1 0 0-.01",
  footprints: "M8 3c1.5 0 2 2 2 4s-.5 4-2 4-2-2-2-4 .5-4 2-4z M7 13h2.5v3a1.25 1.25 0 0 1-2.5 0z M16 7c1.5 0 2 2 2 4s-.5 4-2 4-2-2-2-4 .5-4 2-4z M15 17h2.5v2.5a1.25 1.25 0 0 1-2.5 0z",
  magnifier: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M15 15l6 6",
  flashlight: "M4 8h7l3-3h4v14h-4l-3-3H4z M20 9l2-1 M20 15l2 1 M20 12h2",
  crown: "M3 18h18 M4 18 3 7l5 4 4-6 4 6 5-4-1 11",
  bot: "M5 9h14v10H5z M12 5v4 M9 13h.01 M15 13h.01 M9 16h6 M12 3.5a1 1 0 1 0 0 .01",
  offline: "M3 3l18 18 M8.5 16.5a5 5 0 0 1 7 0 M5 12.5a10 10 0 0 1 4.5-2.6 M19 12.5a10 10 0 0 0-3-2 M12 20h.01",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  volume: "M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M19 6a8 8 0 0 1 0 12",
  mute: "M4 9h4l5-4v14l-5-4H4z M16 9l5 6 M21 9l-5 6",
  question: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5 M12 17h.01",
  exit: "M14 4h5v16h-5 M10 8l-4 4 4 4 M6 12h10",
  x: "M6 6l12 12 M18 6 6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  plus: "M12 5v14 M5 12h14",
  copy: "M8 8h11v12H8z M5 16V4h11",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  dice: "M4 4h16v16H4z M8.5 8.5h.01 M15.5 15.5h.01 M12 12h.01 M15.5 8.5h.01 M8.5 15.5h.01",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10V4.5a1.5 1.5 0 0 1 3 0V11 M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 14a1.5 1.5 0 0 1 2.4-1.8L8 14",
  play: "M7 4l13 8-13 8z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21a7 7 0 0 1 14 0 M17 3a4 4 0 0 1 0 8 M22 21a7 7 0 0 0-4-6.3",
  mask: "M2 10c3-3 17-3 20 0 0 3-2 6-5 6-2.5 0-3.5-2-5-2s-2.5 2-5 2c-3 0-5-3-5-6z M7 10.5h2.5 M14.5 10.5H17",
  badge: "M12 2l3 4 5 1-3 4 1 5-6-2-6 2 1-5-3-4 5-1z",
  back: "M15 5l-7 7 7 7",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  timer: "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 10v4l2 2 M9 2h6",
  pad: "M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5",
  camera: "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0 M9 4h6v5H9z M9 15h6v5H9z M4 9h5v6H4z M15 9h5v6h-5z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  layers: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
  skip: "M5 5l8 7-8 7z M15 5v14",
  flag: "M5 21V4 M5 4h12l-2 4 2 4H5",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className, title }: { name: IconName | string; size?: number; className?: string; title?: string }) {
  const d = PATHS[name] ?? PATHS.question;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}
