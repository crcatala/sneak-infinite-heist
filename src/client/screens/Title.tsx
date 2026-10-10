// Boot ident → title ("press any key") → main menu, over the live 3D museum. Menu pages slide in
// while the camera reframes the scene. Play Online (host / join / my rooms), Play Solo, How to
// Play, Settings, Credits. First launch asks for a name, in the game's own voice.

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ROOM_CODE_LENGTH, ROOM_CODE_RE } from "../../shared/roomCode";
import type { InviteInfo, RoomRecord } from "../../shared/invites";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { KeyHints, MenuHeader, MenuList, useMenuKeys, type MenuItem } from "../components/Menu";
import { SettingsPanel } from "../components/SettingsPanel";
import { VolumeControl } from "../components/VolumeControl";
import { loadName, saveName } from "../identity";
import { createRoom, deleteRoom, fetchInvite, forgetInvite, InviteError, loadInvite, saveInvite } from "../invite";
import { roomExists } from "../net";
import { navigate } from "../router";
import { audioReady, setMusic, sfx, unlockAudio } from "../sfx";
import { useStore } from "../store";
import type { TitleFrame } from "../scene/TitleScene";

const TitleScene = lazy(() => import("../scene/TitleScene").then((m) => ({ default: m.TitleScene })));

type Page = "boot" | "press" | "name" | "main" | "online" | "join" | "invite" | "solo" | "settings" | "credits";

const SPLASH_KEY = "sneak:splash";
const VERSION = import.meta.env.VITE_APP_VERSION ?? "0.1.0";
const COMMIT = import.meta.env.VITE_APP_COMMIT ?? "unknown";

function firstPage(): Page {
  try {
    if (!localStorage.getItem(SPLASH_KEY)) return "boot";
  } catch {
    /* storage unavailable */
  }
  return audioReady() ? "main" : "press";
}

export function Title() {
  const [page, setPage] = useState<Page>(firstPage);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<{ online: boolean }>)
      .then((j) => setOnline(!!j.online))
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    if (audioReady()) setMusic("title");
  }, []);

  const go = useCallback((p: Page) => setPage(p), []);

  const frame: TitleFrame =
    page === "boot" || page === "press"
      ? "title"
      : page === "main"
        ? "menu"
        : page === "online" || page === "join" || page === "invite"
          ? "online"
          : page === "solo"
            ? "solo"
            : page === "settings"
              ? "settings"
              : page === "credits"
                ? "credits"
                : "name";

  return (
    <div className={`screen title-screen page-${page}`}>
      <div className="title-scene">
        <Suspense fallback={null}>{page !== "boot" && <TitleScene frame={frame} />}</Suspense>
      </div>
      <div className="title-vignette" aria-hidden />
      {page === "boot" && <Boot onDone={() => setPage("press")} />}
      {page !== "boot" && (
        <div className={`title-logo-wrap ${page === "press" ? "big" : "small"}`}>
          <Logo />
        </div>
      )}
      {page === "press" && <PressStart onStart={() => setPage(loadName() ? "main" : "name")} />}
      <div className="menu-stage" key={page}>
        {page === "name" && <NamePage onDone={() => go("main")} />}
        {page === "main" && <MainPage go={go} />}
        {page === "online" && <OnlinePage go={go} online={online} />}
        {page === "join" && <JoinPage onBack={() => go("online")} />}
        {page === "invite" && <InvitePage onBack={() => go("online")} />}
        {page === "solo" && <SoloPage onBack={() => go("main")} />}
        {page === "settings" && <SettingsPage onBack={() => go("main")} />}
        {page === "credits" && <CreditsPage onBack={() => go("main")} />}
      </div>
      {page !== "boot" && (
        <footer className="title-foot">
          <VolumeControl className="ghost" placement="up" align="start" />
          <span title={`Build ${COMMIT}`}>v{VERSION} · {COMMIT}</span>
          <span className="faint">An original caper · not affiliated with any board-game publisher</span>
        </footer>
      )}
    </div>
  );
}

/** A tiny studio ident, first load only, under 2 seconds, skippable. */
function Boot({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    try {
      localStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* ignore */
    }
    const t = setTimeout(onDone, 1900);
    const skip = (e: Event) => {
      // Consume the key so it can't also activate whatever gets focus next.
      e.preventDefault();
      onDone();
    };
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [onDone]);
  return (
    <div className="boot" role="presentation">
      <div className="boot-lamp" />
      <p className="boot-studio">
        MOONLIT <span>TOYBOX</span>
      </p>
      <p className="boot-presents">presents</p>
    </div>
  );
}

function PressStart({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const start = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === "`" || e.key === "~" || e.metaKey || e.ctrlKey || e.altKey)) return;
      // Consume the key so it can't also activate the menu item that receives focus next.
      e.preventDefault();
      unlockAudio();
      // Let the audio context start before the sting.
      setTimeout(() => {
        sfx.titleSting();
        setMusic("title");
      }, 30);
      onStart();
    };
    window.addEventListener("keydown", start);
    window.addEventListener("pointerdown", start);
    return () => {
      window.removeEventListener("keydown", start);
      window.removeEventListener("pointerdown", start);
    };
  }, [onStart]);
  const touch = matchMedia("(pointer: coarse)").matches;
  return (
    <div className="press-start">
      <p>{touch ? "Tap to start" : "Press any key"}</p>
    </div>
  );
}

function NamePage({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(loadName());
  const submit = () => {
    const n = name.trim().slice(0, 24);
    if (!n) {
      sfx.error();
      return;
    }
    saveName(n);
    sfx.menuSelect();
    onDone();
  };
  return (
    <div className="menu-card panel glass dialogue">
      <p className="dialogue-speaker">
        <Icon name="flashlight" /> The night guard squints at you…
      </p>
      <h1 className="dialogue-line">What should the museum call you?</h1>
      <input
        className="input big-input"
        autoFocus
        maxLength={24}
        value={name}
        placeholder="e.g. Moonbeam"
        aria-label="Your name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="row">
        <span className="faint small">Friends will see this in rooms. You can change it in Settings.</span>
        <span className="spacer" />
        <button className="btn primary" onClick={submit} disabled={!name.trim()}>
          That's me <Icon name="check" />
        </button>
      </div>
    </div>
  );
}

function MainPage({ go }: { go: (p: Page) => void }) {
  const items: MenuItem[] = [
    { id: "online", label: "Play Online", icon: "users", hint: "Host · Join · My rooms", onSelect: () => go("online") },
    { id: "solo", label: "Play Solo", icon: "bot", hint: "You vs bots", onSelect: () => go("solo") },
    { id: "how", label: "How to Play", icon: "question", onSelect: () => navigate("/how-to-play") },
    { id: "settings", label: "Settings", icon: "gear", onSelect: () => go("settings") },
    { id: "credits", label: "Credits", icon: "sparkle", onSelect: () => go("credits") },
  ];
  return (
    <div className="menu-card main-menu">
      <p className="menu-greeting">
        Evening, <b>{loadName() || "stranger"}</b>. The museum is closed…
      </p>
      <MenuList items={items} />
      <KeyHints back={false} />
    </div>
  );
}

function OnlinePage({ go, online }: { go: (p: Page) => void; online: boolean | null }) {
  const toast = useStore((s) => s.toast);
  const [key, setKey] = useState(loadInvite);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    async (k: string) => {
      try {
        setInfo(await fetchInvite(k));
      } catch (e) {
        if (e instanceof InviteError && e.status === 401) {
          forgetInvite();
          setKey(null);
          setInfo(null);
        }
        toast(e instanceof Error ? e.message : "Could not load your invite.", "error");
      }
    },
    [toast],
  );

  useEffect(() => {
    if (key && online) void refresh(key);
  }, [key, refresh, online]);

  const q = info?.quota;
  const blocker = !q ? null : q.rooms >= q.maxRooms ? `All ${q.maxRooms} room slots are used: delete one below.` : q.nextSlotAt !== null ? `Daily limit reached (${q.perWindow} rooms per 24h).` : null;

  const host = async () => {
    if (!key) return go("invite");
    setBusy(true);
    try {
      navigate(`/r/${await createRoom(key)}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create a room.", "error");
      void refresh(key);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (room: RoomRecord) => {
    if (!key || !confirm(`Delete room ${room.code}? It's gone for good.`)) return;
    try {
      await deleteRoom(key, room.code);
      toast(`Deleted room ${room.code}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not delete the room.", "error");
    }
    void refresh(key);
  };

  const offline = online === false;
  const items: MenuItem[] = [
    {
      id: "host",
      label: busy ? "Opening the museum…" : "Host a game",
      icon: "crown",
      disabled: offline || busy || !!blocker,
      hint: offline ? "Online is off" : key ? (blocker ?? `Invite: ${info?.label ?? "…"}`) : "Needs an invite code",
      onSelect: () => void host(),
    },
    { id: "join", label: "Join with a code", icon: "link", disabled: offline, onSelect: () => go("join") },
    key
      ? {
          id: "forget",
          label: "Forget my invite",
          icon: "x",
          onSelect: () => {
            forgetInvite();
            setKey(null);
            setInfo(null);
          },
        }
      : { id: "invite", label: "I have an invite code", icon: "badge", disabled: offline, onSelect: () => go("invite") },
    { id: "back", label: "Back", icon: "back", onSelect: () => go("main") },
  ];

  return (
    <div className="menu-card online-menu">
      <MenuHeader title="Play Online" sub="Up to 4 friends. Share a link, pick who's the thief." onBack={() => go("main")} />
      {offline && <p className="chip alarm">Online rooms are turned off right now. Solo still works!</p>}
      <MenuList items={items} onBack={() => go("main")} />
      {info && info.rooms.length > 0 && (
        <div className="my-rooms panel glass">
          <div className="label">My rooms</div>
          <ul>
            {info.rooms.map((r) => (
              <li key={r.code} className="my-room">
                <button className="my-room-main" onClick={() => navigate(`/r/${r.code}`)}>
                  <b className="code-text">{r.code}</b>
                  <span className="muted small">{r.detail}</span>
                  <span className="faint small">
                    {r.players.length ? r.players.join(", ") : "Nobody yet"}
                    {r.bots > 0 && ` + ${r.bots} bot${r.bots === 1 ? "" : "s"}`} · {timeAgo(r.lastActiveAt)}
                  </span>
                </button>
                <button className="btn small icon ghost" aria-label={`Delete room ${r.code}`} onClick={() => void remove(r)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
          {q && (
            <p className="faint small">
              {q.createdInWindow}/{q.perWindow} rooms today · {q.rooms}/{q.maxRooms} saved
            </p>
          )}
        </div>
      )}
      <KeyHints />
    </div>
  );
}

function JoinPage({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useStore((s) => s.toast);
  const join = async () => {
    const c = code.trim().toUpperCase();
    if (!ROOM_CODE_RE.test(c)) {
      sfx.error();
      return toast(`Room codes are ${ROOM_CODE_LENGTH} letters and numbers.`, "error");
    }
    setBusy(true);
    try {
      if (await roomExists(c)) {
        sfx.menuSelect();
        navigate(`/r/${c}`);
      } else {
        sfx.error();
        toast(`There's no room ${c}. Check the code?`, "error");
      }
    } finally {
      setBusy(false);
    }
  };
  useMenuKeys({ count: 1, focus: 0, setFocus: () => {}, onSelect: () => void join(), onBack });
  return (
    <div className="menu-card panel glass dialogue">
      <MenuHeader title="Join a heist" sub="Type the code your friend shared (or just open their link)." onBack={onBack} />
      <input
        className="input code big-input"
        autoFocus
        value={code}
        maxLength={ROOM_CODE_LENGTH}
        placeholder="CODE"
        aria-label="Room code"
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void join();
          }
        }}
      />
      <button className="btn primary big" disabled={busy || code.length < ROOM_CODE_LENGTH} onClick={() => void join()}>
        {busy ? "Checking…" : "Sneak in"} <Icon name="play" />
      </button>
    </div>
  );
}

function InvitePage({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useStore((s) => s.toast);
  const submit = async () => {
    const k = draft.trim();
    if (!k) return;
    setBusy(true);
    try {
      await fetchInvite(k);
      saveInvite(k);
      sfx.menuSelect();
      toast("Invite saved: you can host online games now.", "good");
      onBack();
    } catch (e) {
      sfx.error();
      toast(e instanceof Error ? e.message : "That invite code isn't valid.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="menu-card panel glass dialogue">
      <MenuHeader title="Invite code" sub="Hosting online rooms is invite-only. Joining only needs a link." onBack={onBack} />
      <input className="input big-input" autoFocus value={draft} placeholder="your-invite-key" aria-label="Invite code" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void submit();
        }
        if (e.key === "Escape") onBack();
      }} />
      <button className="btn primary" disabled={busy || !draft.trim()} onClick={() => void submit()}>
        Save invite
      </button>
    </div>
  );
}

function SoloPage({ onBack }: { onBack: () => void }) {
  const [thiefBots, setThiefBots] = useState(3);
  const [mates, setMates] = useState(0);
  const start = (role: "thief" | "detectives") => navigate(`/solo?role=${role}&n=${role === "thief" ? thiefBots : mates}`);
  const items: MenuItem[] = [
    { id: "thief", label: "Be the Thief", icon: "mask", hint: `vs ${thiefBots} bot detective${thiefBots === 1 ? "" : "s"}`, onSelect: () => start("thief") },
    {
      id: "size",
      label: (
        <>
          Detectives chasing you: <b className="gold">{thiefBots}</b>
        </>
      ),
      icon: "users",
      onAdjust: (d) => setThiefBots((n) => Math.min(3, Math.max(1, n + d))),
    },
    { id: "det", label: "Be the Detectives", icon: "badge", hint: mates === 0 ? "you control 2 pawns vs a bot thief" : `you + ${mates} bot partner${mates === 1 ? "" : "s"}`, onSelect: () => start("detectives") },
    {
      id: "mates",
      label: (
        <>
          Bot partners: <b className="gold">{mates}</b>
        </>
      ),
      icon: "bot",
      onAdjust: (d) => setMates((n) => Math.min(2, Math.max(0, n + d))),
    },
    { id: "back", label: "Back", icon: "back", onSelect: onBack },
  ];
  return (
    <div className="menu-card solo-menu">
      <MenuHeader title="Play Solo" sub="Everything runs in your browser. No sign-up." onBack={onBack} />
      <MenuList items={items} onBack={onBack} />
      <KeyHints adjust />
    </div>
  );
}

function SettingsPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="menu-card panel glass settings-card">
      <MenuHeader title="Settings" sub="Saved on this device." onBack={onBack} />
      <SettingsPanel onBack={onBack} />
      <KeyHints adjust />
    </div>
  );
}

function CreditsPage({ onBack }: { onBack: () => void }) {
  useMenuKeys({ count: 1, focus: 0, setFocus: () => {}, onSelect: onBack, onBack });
  return (
    <div className="menu-card panel glass credits">
      <MenuHeader title="Credits" onBack={onBack} />
      <p>
        <b>Sneak! Infinite Heist</b> is a fan-made digital take on a classic 1991 hidden-movement museum-heist board game: one secret
        thief, a team of detectives, and a lot of deduction.
      </p>
      <p className="muted">
        Game design, code, 3D models, paintings, music and sound effects are all generated in code for this project. Characters,
        names and art are original. Fonts: Bungee, Fredoka, Nunito and Caveat (SIL Open Font License) via Google Fonts.
      </p>
      <p className="muted">Built with React, Three.js, React Three Fiber and Cloudflare Workers + Durable Objects.</p>
      <p className="faint small">Not affiliated with, endorsed by or connected to any board-game publisher.</p>
      <button className="btn primary" autoFocus onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function timeAgo(at: number): string {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
