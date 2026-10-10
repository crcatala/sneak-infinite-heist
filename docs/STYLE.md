# Sneak! Infinite Heist: style guide

**The pitch:** a *moonlit caper in a toy museum*. It's Saturday-morning-cartoon mischief: a masked cat burglar
tiptoeing through a chunky plastic diorama while six oddball detectives sweep flashlights around. It should feel
cozy and sly rather than gritty, like a board game come to life after closing time.

Three words: **sneaky, chunky, glowing.**

---

## 1. Palette

Night is the canvas. Warm lamp gold is the one "look here" colour, and alarm coral is saved for danger and reveals.

| Token | Hex | Use |
|---|---|---|
| `--night-950` | `#07061A` | Deepest background, letterbox, vignettes |
| `--night-900` | `#0E0C24` | App background |
| `--night-800` | `#17143A` | Panels |
| `--night-700` | `#221E4E` | Raised panels, inputs |
| `--night-600` | `#322C6B` | Borders, hover fills |
| `--night-500` | `#4A4390` | Disabled fills, dividers on raised panels |
| `--moon-400` | `#8FB0FF` | Cool accents, detective team, links |
| `--moon-200` | `#C9D8FF` | Secondary text |
| `--moon-50` | `#F2F5FF` | Primary text on night |
| `--lamp-300` | `#FFD36B` | Highlight glints |
| `--lamp-400` | `#FFC14D` | **Primary accent**: focus, primary buttons, thief loot |
| `--lamp-600` | `#D98E0B` | Primary button lip or shadow |
| `--alarm-400` | `#FF6B81` | Danger text |
| `--alarm-500` | `#FF4D6D` | Alarms, "NABBED!", destructive buttons |
| `--alarm-700` | `#B81E3E` | Alarm lip or shadow |
| `--mint-400` | `#4FE0B0` | Ready, success, "clear" answers |
| `--paper-100` | `#F6EBD2` | Plotting-pad paper |
| `--paper-300` | `#E3D2AE` | Pad grid lines |
| `--pencil-800` | `#3A2E2A` | Pad ink |
| `--thief` | `#34343F` | Thief pawn charcoal |

**Teams:**

- The thief is charcoal and gold: the loot, and the thief's HUD accents.
- The detectives are badge blue, `--moon-400`.

**Detective colours:**

| Colour | Hex |
|---|---|
| red | `#E8484F` |
| yellow | `#F7C531` |
| green | `#3FB86A` |
| blue | `#3D7FE0` |
| purple | `#9A5CD6` |
| white | `#ECEAE4` |

**Gallery floors in 3D**, each marbled with a lighter vein:

| Gallery | Hex |
|---|---|
| Red | `#B8323C` |
| Purple | `#6E3FA8` |
| Blue | `#2F5FB8` |
| Gold | `#C88A22` |
| Green | `#2E8F5A` |
| White | `#E6E2D8` |
| Corridor | `#7D8194` (flagstone) |

**Contrast:**

- Body text is `--moon-50` on `--night-800` (≈15:1), and secondary text is `--moon-200` (≈10:1).
- Gold buttons carry `--night-950` text (≈12:1). Nothing interactive drops below 4.5:1.

**Colour is never alone.** Every room colour ships with its name and a pattern (§7).

## 2. Typography

All faces come from Google Fonts with `display=swap`:

| Role | Face | Notes |
|---|---|---|
| Logo, big numbers, room codes, dice | **Bungee** | Signage caps. Only in short bursts. |
| Headings, buttons, menu items | **Fredoka** 500–700 | Rounded and friendly. The "voice" of the UI. |
| Body, log, tooltips | **Nunito** 500–800 | Rounded humanist, very legible small. |
| Plotting pad annotations | **Caveat** 700 | Pencil handwriting, only on the pad. |

**Type scale** (rem, multiplied by the UI-scale setting through `--ui-scale` on `:root`):

| Token | Size | Face | Use |
|---|---|---|---|
| `--t-hero` | 4.5 (clamp 2.6–5.5) | Bungee | Banners: CHASE!, NABBED!, ESCAPED! |
| `--t-h1` | 2.25 | Fredoka 700 | Menu page titles |
| `--t-h2` | 1.5 | Fredoka 600 | Panel titles |
| `--t-menu` | 1.75 | Fredoka 600 | Main-menu items |
| `--t-body` | 1 | Nunito 600 | Default |
| `--t-small` | 0.85 | Nunito 600 | Captions, log |
| `--t-micro` | 0.72 | Nunito 800, +0.08em tracking | Uppercase chips and labels |

## 3. Shapes and components: "toy-box" UI

Everything looks like a chunky plastic game piece: rounded, with a lit top edge and a solid drop "lip" underneath.

- **Panel:**
  - `--night-800` fill, 18px radius, a 2px inner border of `--night-600`, and a 1px top highlight
    (`inset 0 1px 0 rgba(255,255,255,.08)`).
  - Shadow `0 10px 0 -2px rgba(0,0,0,.35), 0 18px 40px rgba(0,0,0,.45)`.
  - Panels over the 3D scene get `backdrop-filter: blur(10px)` and 88% opacity.
- **Button:**
  - A pill (999px radius), Fredoka 600, min height 44px (touch).
  - A solid lip `box-shadow: 0 5px 0 <lip>`. Pressing moves it down 3px and shrinks the lip.
  - Variants:

    | Variant | Fill | Text | Lip |
    |---|---|---|---|
    | primary | lamp | night | `--lamp-600` |
    | secondary | `--night-600` | moon | `--night-950` |
    | danger | alarm | white | `--alarm-700` |
    | ghost | transparent | moon, underlined on hover | none |

  - Disabled: `--night-500` fill and 55% text.
- **Menu item** (title menu, pause menu):
  - A full-width row, Fredoka 600 at `--t-menu`.
  - When focused, a gold **flashlight beam** sweeps in from the left: a gradient wedge from `--lamp-400` at 35% to
    transparent. The text turns gold, and a little magnifier cursor bobs at the left edge.
  - Unfocused items sit at 70% opacity.
- **Chip:** Nunito 800 uppercase micro, 999px radius, tinted fill (15% of the colour) with a 1px border (40%).
- **Card** (setup counters, detective action cards):
  - A panel with a 6px coloured top band.
  - Hovering lifts it 3px, and pressing pushes it down.
- **Inputs:**
  - `--night-700` fill, 14px radius, and a 2px border that turns gold on focus.
  - Never a bare browser field: inputs always sit inside a styled "dialogue" panel with a prompt line above
    ("What should the museum call you?").
- **Focus ring:** `0 0 0 3px var(--night-900), 0 0 0 6px var(--lamp-400)` on every interactive element. It's
  never removed.
- **Icons:** drawn in code as SVG on a 24px grid with a 2px stroke, round caps and joins, `currentColor`.
  - The set: eye, scan-camera ("S"), motion ("M"), lock and open-lock, scissors, bolt (power), frame,
    footprints, magnifier, flashlight, crown, bot, wifi-off, gear, volume, question and exit.
  - The case-notes set, one glyph per kind of event (each badge is tinted from CSS by its `data-kind`): moon,
    sunrise, siren, handcuffs, escape, burst, bolt-off, bulb, block, zzz, shuffle and steal.

## 4. Motion: "sneak and pop"

Things **sneak** in with a soft ease-out, sometimes with a small anticipation dip, and **pop** with an overshoot
when something is revealed.

| Token | Value | Use |
|---|---|---|
| `--e-sneak` | `cubic-bezier(.2,.8,.2,1)` | Default ease-out for entrances and camera moves |
| `--e-pop` | `cubic-bezier(.34,1.56,.64,1)` | Overshoot for reveals, banners, pieces landing |
| `--e-tiptoe` | `steps(4)` or a bounce | Hidden-footstep dots, ticking timers |
| `--d-micro` | 120ms | Hover and press |
| `--d-ui` | 220ms | Panels, toasts |
| `--d-page` | 420ms | Menu page transitions and camera reframes |
| `--d-cine` | 900–1400ms | Cinematics: reveal, capture, escape. Always skippable (click, Space, Esc). |

**Rules:**

1. Only one cinematic at a time. Events queue up, and "fast-forward" (hold Space) plays them at 4×.
2. Hidden information never animates. No footsteps, no dust and no sound for a hidden thief on anyone else's
   screen.
3. Reduced motion (the OS setting or ours) turns movement into cross-fades, keeps camera cuts instant and disables
   screen shake and idle bobbing.
4. Idle life is subtle: pawns breathe with a 2% scale over 3s, lamps flicker a little, and the logo shimmers every
   8s.

## 5. 3D scene language

- **Diorama:** the museum sits on a rounded cobblestone plinth, like the physical 3D board, floating in soft
  night-blue fog.
- **Geometry:** low-poly, flat-shaded and bevelled. Walls are chunky warm-grey stone (`#8C8A99`) with a lighter
  cap (`#B4B2C2`). They're low (0.55 cell) so the board stays readable.
- **Lighting:**
  - A hemisphere light (moon-blue sky `#6F86D6`, ground `#1A1633`) and a cool directional "moon" from the
    north-west with soft, low-resolution shadows.
  - Warm point or spot lights over each painting (`#FFC56B`) and emissive lamp posts on the plaza.
  - Emergency lighting is a red wash (`#FF3355` at low intensity), with every camera LED dark.
  - Chase mode shifts to an alarm pulse on the rim light.
- **Pieces:**

  | Piece | Look |
  |---|---|
  | Detectives | Chunky pawns (base, body, ball head) with character hats: captain's cap, goggles, deerstalker, bobby helmet, guard cap with flashlight, round specs |
  | Thief | A charcoal pawn with a gold-rimmed domino mask and a sack that grows with each painting |
  | Cameras | Red plus-shaped units with a white number disc and a green (working) or grey (off) LED |
  | Paintings | Framed canvases on walnut gallery stands, procedurally painted. Nine original scenes (`ARTWORKS`), never copies or parodies of real artworks. |
  | Padlocks | White on plinths. Flipped they show silver "O" or red "L". |
  | Movement die | Black with white pips |
  | Action die | White with Eye, S-camera and M faces |

- **Overlays:**
  - Reachable cells get a dashed outline in the mover's colour, a shade darker (the thief's are gold; a detective's are their pawn colour). The selected destination fills the tile, and a detective's step count shows only on hover or the selected destination. The route to the focused destination is a row of dots in the same colour. Sightlines are cool cyan beams, the danger overlay is coral corner brackets (heavier on a legal move that ends in view), and the
    possible-location heat overlay is violet.
  - Every overlay also carries a pattern or number so it doesn't rely on colour.

## 6. Voice and copy

- Short, playful and clear. Instructions come first and jokes second.
- Prompts use the second person: "Pick a window to sneak in through." or "Roll the dice."
- Waiting states always name who and why: "Waiting for Dot Marigold to move…"
- Banners are ALL CAPS Bungee: **CHASE!**, **NABBED!**, **ESCAPED!**, **LIGHTS OUT!**
- Detectives are called by character name, and players by their own name in the lobby.

## 7. Accessibility

- **Room colours:** every room has a name and a pattern, used on the motion answer, the pad and the colour-blind
  mode floor decals:

  | Room | Pattern |
  |---|---|
  | Red | diagonal stripes |
  | Purple | dots |
  | Blue | waves |
  | Gold | chevrons |
  | Green | crosses |
  | White | plain |
  | Grey | grid |

- **Input:** everything works from the keyboard. Arrows or WASD move the menu focus, Enter selects and Esc goes
  back. In game, the number keys pick actions and the arrows move a board cursor.
- **Size and motion:** the UI scale runs from 80 to 140%. Hit targets are at least 44px, and `prefers-reduced-motion`
  is honoured.

## 8. Audio feel

- **The sound:** a "tiptoe pizzicato" palette of plucky strings, woodblock ticks, muted brass stabs and soft
  swishes. Effects are short generated clips in `public/audio/sfx` (trimmed and level-matched: ticks and
  footsteps sit quietest, stings and fanfares loudest). The original WebAudio synth versions in `sfx.ts` play as a
  fallback if a clip fails to load. The music is a set of original tracks in `public/audio/music` (see Music below).
- **Menus:**
  - Move is a woodblock tick.
  - Select is two plucks going up (a fifth).
  - Back is two plucks going down.
  - The title sting is "da-da-da-DUM!" plus a cymbal swish.
- **Game:**
  - Dice rattle.
  - The thief's own tiptoe steps reuse the footstep clip, softer and lower. Nothing plays for a hidden thief.
  - Detective footsteps are soft taps per step. The hidden thief is never heard.
  - A camera click, the alarm (a two-tone siren), the snip (a scissor chirp) and the lock clunk.
  - Power down is a falling whine plus a thump, and power up is the reverse.
  - Capture is a muted-trombone "wah-wah" stinger, escape is a rising brass-and-glockenspiel fanfare, and dawn
    is a sunrise chord with a smug clarinet. All three are music-bus stingers, not effects.
- **Music:** one track per mood, streamed and crossfaded (`src/client/music.ts`):

  | Track | Plays | Feel |
  |---|---|---|
  | `title` | title and menus | jazzy swing-lite, ~96 BPM |
  | `lobby` | lobby and setup | light and bouncy, ~100 BPM |
  | `calm` | the thief is hidden | hushed pizzicato tiptoe, ~88 BPM, built to loop for a long time |
  | `lights-out` | the power is cut | slower and eerie but toy-like, ~72 BPM |
  | `chase` | the thief is revealed | frantic cartoon pursuit, ~150 BPM |
  | `results` | round-over screen | relaxed victory lap, ~80 BPM |

  - The chase wins over lights-out, which wins over calm. Only public state picks the track: a detective hears
    lights-out when they discover the cut, never earlier.
  - Tracks end in a fade-out, so a loop crossfades the tail into the start (2.5 s). Switching tracks takes 1.4 s,
    and the chase 0.4 s so it lands with its banner.
  - Tracks are level-matched offline (`scripts/normalize-music.mjs`): loops sit at -17 to -20 LUFS, stingers at
    -17, with a -1.5 dBFS peak ceiling.
- **Volumes:** master, music and SFX, all persisted. The speaker button (title screen, lobby, in-game turn bar)
  opens a quick mixer with the three sliders and a mute switch, and the Settings page has the same sliders.

## 9. The lobby and the character art

- **One screen, no scroll.** The lobby is a console-style character select. Its type scale and spacing come from the
  screen height (`--u` in `lobby.css`, container query units), so it holds from 1280×720 to ultrawide. Short
  landscape phones fall back to scrolling instead of squeezing, and phones in portrait stack the crew and the
  footer.
- **Layout.** The crew (portrait avatars with a ready tick, host crown and thief badge) runs along the top with a
  **House rules** button at the right. The detective carousel fills the middle: the focused detective large and lit
  in their own colour, neighbours smaller and dimmer on a ring, taken ones greyed with the owner's name. The name,
  blurb and the **Choose** button sit underneath, and thief selection and **I'm ready** run along the bottom.
- **House rules live in a sheet** (three columns: Museum, Heist, Detectives & table) so the long descriptions have
  room without ever pushing the lobby past the screen. Non-hosts can open it read-only.
- **Character art.** Full-body, transparent, 2:3 portraits in a *retro storybook* style: mid-century gouache with
  paper grain, a limited warm palette, simplified shapes and no outlines. Each detective keeps their pawn colour
  (red, yellow, green, blue, purple, white) and their hat. The thief is a deliberately faceless silhouette (slouch
  hat, turned-up collar, loot sack) so the role works for any player. Prompts and provenance are in
  [docs/ART.md](ART.md).
- **First-time hints** are hand-drawn arrows with pencil-written notes in the Caveat face: the first points at
  **Choose** ("Cycle left and right, then choose your detective!"), the second at the ready button ("Don't forget to
  ready up!"). They draw themselves in, bob toward their target, and hold still under reduced motion. Each step is
  remembered per browser once done.
