// How to Play: the rules in the game's own voice, with illustrated steps, controls and settings.
// Reachable from the title menu, the pause menu, and /how-to-play.

import { useEffect, useState } from "react";
import { CHARACTERS, THIEF } from "../../shared/characters";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { navigate } from "../router";
import { sfx } from "../sfx";

const CHAPTERS = [
  { id: "goal", title: "The caper", icon: "mask" },
  { id: "setup", title: "Setting the trap", icon: "frame" },
  { id: "thief", title: "The thief's turn", icon: "footprints" },
  { id: "detectives", title: "The detectives' turn", icon: "badge" },
  { id: "gadgets", title: "Cameras, motion & power", icon: "camera" },
  { id: "endgame", title: "Chase, escape & capture", icon: "flag" },
  { id: "controls", title: "Controls", icon: "gear" },
  { id: "settings", title: "House rules", icon: "layers" },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["id"];

export function HowToPlay() {
  const [chapter, setChapter] = useState<ChapterId>("goal");
  const i = CHAPTERS.findIndex((c) => c.id === chapter);
  const go = (d: number) => {
    const next = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, i + d))];
    if (next.id !== chapter) {
      setChapter(next.id);
      sfx.menuMove();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "d") go(1);
      if (e.key === "ArrowLeft" || e.key === "a") go(-1);
      if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const back = () => {
    sfx.menuBack();
    if (history.length > 1) history.back();
    else navigate("/");
  };

  return (
    <div className="screen howto">
      <header className="howto-top">
        <button className="lobby-logo" onClick={() => navigate("/")} aria-label="Title screen">
          <Logo compact />
        </button>
        <h1>How to play</h1>
        <button className="btn small" onClick={back}>
          <Icon name="back" size={18} /> Back
        </button>
      </header>
      <div className="howto-body">
        <nav className="howto-nav" aria-label="Chapters">
          {CHAPTERS.map((c, n) => (
            <button key={c.id} className={`howto-tab${c.id === chapter ? " on" : ""}`} aria-current={c.id === chapter} onClick={() => (setChapter(c.id), sfx.menuMove())}>
              <span className="howto-num">{n + 1}</span>
              <Icon name={c.icon} size={18} />
              <span>{c.title}</span>
            </button>
          ))}
        </nav>
        <article className="howto-page panel glass" key={chapter}>
          <Chapter id={chapter} />
          <div className="row howto-pager">
            <button className="btn small" disabled={i === 0} onClick={() => go(-1)}>
              ← Previous
            </button>
            <span className="spacer" />
            <span className="faint small">
              {i + 1} / {CHAPTERS.length}
            </span>
            <span className="spacer" />
            {i < CHAPTERS.length - 1 ? (
              <button className="btn small primary" onClick={() => go(1)}>
                Next →
              </button>
            ) : (
              <button className="btn small primary" onClick={() => navigate("/solo?role=thief&n=3")}>
                Try it solo <Icon name="play" size={16} />
              </button>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}

function Chapter({ id }: { id: ChapterId }) {
  switch (id) {
    case "goal":
      return (
        <>
          <h2>One thief. A team of detectives. One very dark museum.</h2>
          <p>
            One player is <b className="gold">{THIEF.name}</b>, a masked thief whose position is <b>secret</b>. Everyone else is a detective, and the detectives play as a team. The museum has 11 exits (7 windows, 4 doors), each with a padlock: 6 are open and 5 are locked, and nobody knows which.
          </p>
          <div className="howto-cards">
            <Card icon="mask" title="The thief wins…" text="…by stealing at least 3 paintings and escaping through an open lock." />
            <Card icon="badge" title="The detectives win…" text="…by ending a move on the thief's space, hidden or not." />
          </div>
          <p className="muted">
            Turns go <b>thief, detective, thief, detective…</b> The thief moves after every detective turn, so with three detectives the thief moves three times as often as any one of them. With 2 players, one player is the thief and the other runs <b>two detectives</b> with separate turns.
          </p>
          <div className="howto-crew">
            {CHARACTERS.map((c) => (
              <span key={c.id} className="howto-char" style={{ ["--c" as string]: c.hex }}>
                <span className="char-swatch" />
                {c.name}
              </span>
            ))}
          </div>
        </>
      );
    case "setup":
      return (
        <>
          <h2>The detectives set the trap, and the thief watches.</h2>
          <ol className="howto-steps">
            <li>
              <b>Locks</b> are shuffled face down onto the 11 plinths (or placed by the detectives, if the host picked that variant).
            </li>
            <li>
              <b>9 paintings</b> go in the galleries: at least one in each of the six main rooms (Red, Purple, Blue, Gold, Green and the White Atrium). The small grey storeroom is allowed too. Never in corridors, the Power Room, or directly in front of a window or doorway.
            </li>
            <li>
              <b>6 cameras</b>, numbered in the order they're placed, go anywhere without a painting (except the power switch). They see in all four directions.
            </li>
            <li>
              <b>Detectives</b> take their posts on any space without a painting or another detective.
            </li>
          </ol>
          <p className="muted">Setup is collaborative and live: every detective can place and move pieces. Illegal spaces explain themselves, and Auto-place fills in the rest. The thief sees everything placed: remember it!</p>
        </>
      );
    case "thief":
      return (
        <>
          <h2>Sneak, steal, sabotage.</h2>
          <ol className="howto-steps">
            <li>
              <b>First turn:</b> click any padlock plinth to sneak in there. Entering is free: you start on the space just inside.
            </li>
            <li>
              <b>Move 1, 2 or 3 spaces</b> orthogonally through doorways. Never visit a space twice in a turn (so you must end somewhere new), and never end on a detective. You can pass through detectives, paintings and cameras.
            </li>
            <li>
              <b>End on a painting and you steal it</b> (no choice!). While hidden, it stays on the wall until the start of your next turn, then vanishes for everyone to see. That's your one-turn head start, and nobody can end a move on a painting, so a fresh theft protects you.
            </li>
            <li>
              <b>End on a camera</b> to secretly disable it, or <b>on the power switch (P)</b> to secretly cut the power.
            </li>
            <li>
              <b>End next to a lock</b> holding enough paintings (3 by default) and you may try it. The flip is public, so everyone learns where you are. Open: you escape! Locked: that exit's closed for good, and you stay hidden.
            </li>
          </ol>
          <p className="muted">
            Your turn is one move: pick a destination, tick the options on the confirm card, and confirm. Your <b>plotting pad</b> tracks your secret trail, and the <b>danger overlay</b> (D) shows every space a detective or working camera can see right now.
          </p>
        </>
      );
    case "detectives":
      return (
        <>
          <h2>Roll, move, look. In either order.</h2>
          <ol className="howto-steps">
            <li>
              <b>Roll both dice.</b> The black die (1–6) is how far you may move. The white die gives your action: <Icon name="eye" size={16} /> Eye (4 faces), <Icon name="scan" size={16} /> Scan (1 face) or <Icon name="motion" size={16} /> Motion (1 face).
            </li>
            <li>
              <b>Move up to that many spaces</b>, backtracking allowed, passing through anything. You can't end on a painting or another detective. Rolled a 1? You must move (unless the house rule says otherwise). <b>End on the thief to capture them</b>, even if you didn't know they were there. Passing through does nothing.
            </li>
            <li>
              <b>Use your action</b> before or after moving, or skip it:
              <ul>
                <li>
                  <b>Eye → My eyes:</b> can you see the thief in a straight line (walls block, doorways don't)? Yes means they're <b>revealed</b> and the chase is on.
                </li>
                <li>
                  <b>Eye → Camera #:</b> asks one camera. A dead camera is removed; a working one answers yes or no (without revealing the thief).
                </li>
                <li>
                  <b>Scan:</b> removes every dead camera, then lists all working cameras that see the thief.
                </li>
                <li>
                  <b>Motion:</b> the thief tells you the floor colour they're on, unless they snip the wires (twice per round).
                </li>
              </ul>
            </li>
          </ol>
          <p className="muted">Every answer (even "no") shrinks where the thief can be. Use suspect marks (Shift + right-click a space) or the possible-location overlay if the host allows it.</p>
        </>
      );
    case "gadgets":
      return (
        <>
          <h2>Cameras, motion detectors and the power switch.</h2>
          <div className="howto-cards">
            <Card icon="camera" title="Cameras" text="See along all four directions until a wall, including their own space. A camera the thief disabled keeps sitting there until someone checks it." />
            <Card icon="motion" title="Motion detectors" text="Report the floor colour under the thief: red, purple, blue, gold, green, white or grey. The thief may snip them instead, twice per round, and everyone sees the snip." />
            <Card icon="bolt" title="Power" text="If the thief cut the power, the next camera, scan or motion attempt only reveals that the lights are out (and spends the action). Eyes always work." />
            <Card icon="flashlight" title="Restoring power" text="A detective ending on the switch turns the power back on. If nobody had found the cut yet, it's restored silently. Cameras the thief disabled stay dead." />
          </div>
        </>
      );
    case "endgame":
      return (
        <>
          <h2>The chase is on.</h2>
          <p>
            Once a detective's own eyes spot the thief, the <b className="alarm-text">thief is revealed</b>: their pawn stays on the board and every move is public. Paintings vanish the instant they land on one. The thief still moves 1–3 and still passes through detectives.
          </p>
          <div className="howto-cards">
            <Card icon="unlock" title="Escape" text="Try an open lock with enough paintings. The thief doesn't have to be revealed to escape." />
            <Card icon="badge" title="Capture" text="Any detective ending a move on the thief's space makes the arrest." />
            <Card icon="timer" title="Dawn (optional)" text="If the host set a turn limit, the museum opens at dawn and the detectives win." />
          </div>
          <p className="muted">
            In a <b>full match</b>, everyone takes a turn as the thief. An escaped thief scores their paintings; a caught thief scores zero. The biggest haul wins. After every round, scrub through the thief's secret path in the replay.
          </p>
        </>
      );
    case "controls":
      return (
        <>
          <h2>Controls</h2>
          <div className="howto-keys">
            <Key k="Click / tap" v="Pick a space, plinth, piece or option" />
            <Key k="Right-click / long-press" v="Point out a spot with a pin (detectives; everyone sees it) · remove a piece (setup)" />
            <Key k="Shift + right-click" v="Suspect mark (detectives). On touch, use the Pin / Mark switch." />
            <Key k="Drag · pinch · two fingers" v="Rotate · zoom · pan the camera" />
            <Key k="1 · 2 / T · F" v="Overview · top-down · focus on my pawn" />
            <Key k="Arrows + Enter" v="Move the board cursor and select" />
            <Key k="Space / Enter" v="Roll · confirm · skip a cinematic (hold Space to fast-forward)" />
            <Key k="E · Shift+1–6 · S · M · X" v="Eyes · camera # · Scan · Motion · skip action" />
            <Key k="A · S (motion prompt)" v="Answer · snip" />
            <Key k="D · H · P · L" v="Danger overlay · heat overlay · plotting pad · log" />
            <Key k="Esc" v="Undo selection · pause menu" />
            <Key k="`" v="Debug console" />
          </div>
        </>
      );
    case "settings":
      return (
        <>
          <h2>House rules (set by the host)</h2>
          <ul className="howto-list">
            <li>
              <b>Game length:</b> a single round (default) or a full match.
            </li>
            <li>
              <b>Paintings to escape:</b> how many the thief needs before trying a lock (default 3).
            </li>
            <li>
              <b>Locks:</b> shuffled face down (default), or placed by the detectives, who then know which are open.
            </li>
            <li>
              <b>Stay put on a 1:</b> the original designers disagreed on this one. Off by default.
            </li>
            <li>
              <b>Turn timer:</b> off, 60, 90 or 120 seconds. Out of time? A bot finishes the turn. The clock pauses while that player is disconnected.
            </li>
            <li>
              <b>Detective aids:</b> off, team suspect marks (default), or marks plus the automatic possible-location overlay.
            </li>
            <li>
              <b>Museum opens at dawn:</b> an optional limit on thief turns.
            </li>
          </ul>
          <p className="muted">The action die is always 4 Eye / 1 Scan / 1 Motion.</p>
        </>
      );
  }
}

function Card({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="howto-card">
      <Icon name={icon} size={26} />
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function Key({ k, v }: { k: string; v: string }) {
  return (
    <div className="howto-key">
      <kbd>{k}</kbd>
      <span>{v}</span>
    </div>
  );
}
