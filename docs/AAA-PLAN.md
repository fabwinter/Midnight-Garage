# Midnight Garage → a game that stands on its own
### AAA-grade elevation plan: theme, visuals, animation, sound, gameplay

Companion to [SEQUENCING-PLAN.md](SEQUENCING-PLAN.md). That document got us
to a shippable, well-made clone. This one is about escaping the clone
category entirely. Same governing principle: a third of these ideas at 100%
quality beats all of them at 70%. The **Signature Three** section is the
actual commitment; everything else is a menu.

---

## 1. The pivot question first, because everything hangs on it

### The honest assessment of where we are

The mechanics (axis-locked pieces, free the hero through the gate) are
**theme-agnostic** — nothing in `solver.js`, `generate.js`, or the level
data knows about cars. The theme is a skin over `carSVG()` and a palette.
That's a liability *and* our biggest asset: we can re-theme the entire game
in one module.

The problem with cars:
- **Rush Hour is a trademarked ThinkFun property** and "unblock" is a
  graveyard of thousands of ad-riddled clones. Best case as a car game, we
  are "the tasteful one in a crowd of trash" — a defensive position.
- The axis-lock constraint is *arbitrary* for cars. Real cars steer. Every
  player who thinks about it feels the abstraction.
- Nothing about cars gives us new mechanics for free.

### Candidate pivots, scored

| | Mechanical fit | Audience size | Art bar (solo-achievable) | Distinctiveness | Keeps our noir equity |
|---|---|---|---|---|---|
| **Cars (status quo)** | weak (arbitrary constraint) | large but contested | ✅ done | ✗ clone category | ✅ |
| **Night freight rail yard** | ★ perfect — rails *are* axis-lock | medium-large (Mini Metro proved transit sells) | ✅ rectangles + lights + weather | ★ no premium competitor exists | ★ fully |
| **Cozy cats (stretchy loaf cats blocking a doorway)** | fine (cats are liquid) | ★ huge, viral | ✗ cute animation is unforgiving; janky cat = dead game | ★ | ✗ discards it |
| **Heist vault (crates, lasers, guards)** | fine | medium | ✅ | ○ heist puzzlers exist | ✅ |
| **Harbor tugs** | good (channels) | medium | ✅ | ○ | partial |
| **Abstract neon circuits** | good | small-medium, premium | ✅ | ○ (Zenge/Hook territory) | ✅ |

### Recommendation: pivot the fiction to a night freight rail yard

Working titles: **Midnight Yard** (keeps brand equity), *Last Train Out*
(more evocative — check availability for both).

Why rails win:

1. **The constraint becomes the fiction.** Train cars *can't* move sideways.
   The one physical setting where our core rule needs zero suspension of
   disbelief. This is the difference between a skin and a theme.
2. **Every planned mechanic gets a diegetic justification for free:**
   one-way lanes → **signals**. Ghost race → **the timetable**. Heist mode →
   **catch the Midnight Express before it departs**. Level editor → **the
   dispatcher's desk**. Cosmetics → **rolling stock livery**. Chapter
   environments → yards in rain / snow / dawn.
3. **New mechanics fall out of the theme** instead of being bolted on
   (couplings, turntables, tunnels — §5).
4. **It keeps everything we built.** The midnight-noir art direction, amber
   gate glow, chapter names (Night Shift, Harbor Freight, Gridlock — these
   are *already train words*), the entire engine, all 200 levels (a car of
   length 2 is a boxcar of length 2), the daily, the share card grid.
5. **Press pitch writes itself:** "Mini Metro's atmosphere meets Rush Hour's
   logic." There is no premium rail-shunting puzzle on the App Store today.

**The cat option is the higher-ceiling / higher-risk alternative** — bigger
casual audience, meme-share potential (haptics = purrs, the hero is a ginger
kitten who wants dinner). Park it as a possible *second product* on the same
engine, not an A/B — split focus killed better games than either theme.

**De-risk cheaply before committing (1 week):** the theme is one rendering
module. Build `trainSVG()` next to `carSVG()`, screenshot both in the same
five scenes, and run the store-page test (Facebook/TikTok mock ads, ~$200:
which gets more clicks on identical copy?). Data over taste, then burn the
boats.

---

## 2. The Signature Three (where AAA actually lives)

A solo dev cannot out-produce Ustwo. AAA-feel comes from being *world-class
at three things* and competent everywhere else. Commit to:

1. **Light and weather.** The most beautiful night rain on the App Store.
   The screenshot IS the marketing.
2. **Sound as physics.** Every gram of every piece audible. Adaptive score
   that resolves musically when the yard resolves logically.
3. **One novel mechanic family** (couplings, §5) that clone-makers can't
   copy without rewriting their solvers.

Everything in §3–§6 below serves one of these three or gets cut.

---

## 3. Visuals — from "clean" to "you can smell the rain"

Current state: flat SVG top-down, CSS transforms, one drop-shadow per piece.
Reads as tasteful web. Target: a **living diorama** you look *into*, not a
board you look *at*.

### 3.1 Renderer upgrade (the enabler — do first)
- Move board rendering from DOM/SVG to a **WebGL canvas layer under DOM
  input** (Pixi.js, or hand-rolled — our scene is ~20 quads). DOM keeps
  hit-testing, capture, accessibility tree; WebGL owns pixels.
- Budget: 120Hz on iPhone 13 and up, 60Hz floor on iPhone SE. Frame budget
  enforced in CI via the existing Playwright harness + `requestAnimationFrame`
  timing assertions.
- Reduced-motion mode must remain a first-class *parallel* presentation, not
  a broken one — static puddles, no rain streaks, instant transitions.

### 3.2 Lighting model (Signature #1)
- 2D normal-mapped sprites lit by point lights: every signal lamp, headlight
  and the **amber gate** casts a real light pool with falloff onto wet
  asphalt/ballast.
- The hero's headlight cone sweeps as it slides — the light itself becomes a
  gameplay read (it points at the exit).
- Solve-proximity lighting: as the path to the gate clears, the gate glow
  *physically brightens and widens* (we already compute distance-to-freedom
  in the solver's heuristic — feed it to the renderer). The board literally
  tells you you're close. Nobody in the category does this.

### 3.3 Weather & atmosphere per chapter (palette swap → world swap)
- **Night Shift:** clear night, sodium lamps, moths in the light cones.
- **Neon District:** rain — streaks in light shafts, drops rippling puddles,
  piece reflections smeared in wet ground, occasional distant lightning that
  relights the whole scene for two frames.
- **Harbor Freight:** rolling fog banks that pieces displace as they move;
  foghorn ambience.
- **Gridlock:** pre-dawn snow, accumulating on static pieces (a piece
  untouched for 60s gains a snow cap that slides off when moved — a subtle
  "you haven't tried this one" hint).
- Film-look pass: soft vignette, faint grain, 2% chromatic bloom on
  emissives. One shared LUT per chapter.

### 3.4 A living world (details that make it AAA)
- Idle life on a budget — max 1 ambient event per 20s: a distant train
  crossing the far background, a yard cat trotting along the frame edge, a
  worker's window lighting up, steam wisp from a grate.
- Pieces are *machines*: marker lights blink at different phases, diesel
  heat-shimmer above idling locos, wipers tick on the hero in rain chapter.
- The frame is a diorama shelf: shallow parallax (3 layers) responding to
  device gyro at ±4px. Subtle. Off in reduced-motion.

---

## 4. Animation & game feel — every interaction choreographed

We have weight easing, flick inertia, dust. The AAA delta is **anticipation,
follow-through, and consequence** on every touch:

- **Grab:** piece lifts 2px, shadow spreads, suspension compresses on the
  grabbed end (squash 2%). Couplings clink taut.
- **Slide:** bogies/wheels actually rotate at surface speed; skid shimmer
  when flicked; rain streaks deflect around a moving piece.
- **Stop:** squash-and-settle (1 overshoot, 1 settle — already close),
  cargo shifts 1px with 60ms lag (secondary motion), dust/spray puff
  (exists — retune per surface: ballast crunch vs wet asphalt hiss).
- **Blocked shove:** the *blocking* piece rocks 1px and its lights flicker —
  the board explains the rule instead of a buzzer punishing you.
- **Win choreography (the 15-second store preview):** last move lands →
  beat of silence → signals flip green in a wave toward the gate → gate
  floods the lane in amber → hero pulls out with genuine acceleration audio
  → camera pushes in 8%, letterboxes, slight slow-mo → stars punch in with
  the existing pop. Full sequence ≤2.6s, skippable by tap, honors
  auto-advance.
- **UI motion system:** one spring curve family (mass/stiffness tokens) used
  by every sheet, chip, star and toast. Number tickers roll, never blink.
  Nothing fades without also moving ≥4px.

---

## 5. Gameplay — escaping the clone by *depth*, not just skin

Rule from the original plan stands: pure logic, no timers, no fail states.
Each mechanic below extends `solver.js`'s state space (it's shared code, so
the generator, verifier, hints, daily, and difficulty model inherit every
mechanic automatically — this is our structural moat).

Introduce **one mechanic per chapter**, tutorialized by level design:

1. **Signals (one-way lanes)** — already planned v1.5. A tile a piece may
   cross only one direction. Solver: constrain move generation. Trivial.
2. **Couplings — the marquee mechanic.** Adjacent in-line cars can be
   coupled/uncoupled by tapping the knuckle between them. Coupled sets move
   as one piece (heavier feel, deeper thud). Uncoupling costs a move.
   Suddenly the puzzle isn't only *where* things go but *what the things
   are*. Solver: pieces gain a coupled-set id; state space grows but stays
   BFS-able at 6×6. **No slide-puzzle clone has this.** This is the press
   feature and the "hard to copy" one.
3. **Turntable tile** — a 1×1 rotator: a length-2 piece stopped on it can
   rotate 90°. Opens the h/v wall between piece populations. Solver: add
   orientation to piece state.
4. **Tunnels** — paired portals on the same axis: exit one edge, emerge from
   the other. Cheap to solve, mind-bending to play.

Plus structure around the mechanics:

- **Set-piece levels:** every chapter ends with a hand-authored 2-stage
  "boss yard" (solve the board, gate opens onto a second board — one
  continuous camera pan). Generated levels are the cardio; authored levels
  are the memories.
- **Express Mode** (the rebranded Heist): the Midnight Express departs in N
  moves — its countdown advances per *your* move. Turn-based pressure, zero
  real-time. Own leaderboard.
- **Zen siding:** endless generated boards at chosen difficulty, no stars,
  rain on, music soft. The retention sleeper.
- **Between-chapter vignettes:** one wordless screen each — the night-shift
  dispatcher's window, coffee going cold, dawn arriving. Five images total.
  Gives the game a soul and reviewers a paragraph. No text walls, honoring
  0.6.

**Meta layer (v1.5's garage, upgraded):** the home screen is *your yard* —
every livery, loco and lamp you've earned parked in a living diorama that
uses the same renderer. Cosmetics-only, one-time-IAP friendly.

---

## 6. Sound — from bleeps to a mix (Signature #2)

Current: oscillator SFX, drone ambience. Replace with a real sound design
pass (commission ~$2–4k, or curated CC/BOOM library + heavy editing):

- **Weight as audio:** rolling low-end scales with piece length ×
  velocity; couplings clank on grab/release; a 3-length loco stopping =
  brake hiss + triple buffer-clunk cascade (matches the haptic triple).
- **Surface layers per chapter:** ballast crunch / wet hiss / fog-muffled
  everything (LPF on the whole SFX bus in Harbor) / snow-damped with
  close-mic detail.
- **Adaptive score, resolve-on-win:** 3 intensity stems keyed to
  solver-computed distance-to-freedom (the hook exists in `audio.js`'s
  design already). The music literally *cannot resolve* until the puzzle
  does; the win stinger lands on the downbeat by quantizing the win
  choreography start to the bar. Nobody will consciously notice. Everyone
  will feel it.
- **Ambience beds:** one 2-min loop per chapter (night insects + distant
  interstate / rain on tin roof + neon buzz / gulls + foghorn / snow
  silence + power-line hum). Ducked −6dB during the win sequence.
- **Mix discipline:** master bus with gentle compressor, SFX/music/ambience
  sub-buses behind the three existing sliders, silent-switch + user-music
  mixing respected (0.4 carries over).

---

## 7. What we do NOT do (updated cut list)

| Cut | Why |
|---|---|
| 3D / SceneKit / full engine rewrite | 2.5D lighting delivers 90% of the wow at 10% of the cost |
| Both themes shipped as a toggle | Split identity, doubled art surface; pick one after the ad test |
| Story mode with dialogue | Five wordless vignettes, that's it |
| Real-time anything (moving guards, live trains) | Breaks the no-pressure covenant of the genre |
| Procedural music | 3 authored stems beat infinite mediocre MIDI |
| More than 4 mechanic families | Rush Hour lasted 30 years on one; we're adding four |
| Character mascots / voice | The yard is the character |

---

## 8. Sequencing (same shippable-update discipline)

| Release | Focus | Marketable beat | Effort |
|---|---|---|---|
| **R0 — Decide** | `trainSVG()` skin spike, 5 scene mockups, $200 ad test cars-vs-rails(-vs-cats), name/trademark check | — | 1 wk |
| **R1 — The Yard** | Renderer swap (WebGL under DOM), lighting model, rebrand to the winning theme, win choreography v1 | "It's beautiful" (new store shots) | 3–4 wk |
| **R2 — Rain** | Weather system (rain chapter first), sound design pass 1 (weight/surfaces), film-look, living-world idle events | The rain trailer | 3 wk |
| **R3 — Couplings** | Coupling mechanic + solver/generator extension + 50-level chapter + boss yard | "Not a clone" — the press cycle | 4 wk |
| **R4 — The Score** | Adaptive music, resolve-on-win, ambience beds, Express Mode | "Puzzle game that mixes itself" | 3 wk |
| **R5 — The Living Yard** | Meta yard home screen, cosmetics, turntables + tunnels chapter, vignettes | Collection + new twist | 4–5 wk |

Existing v1.1 (data-driven tuning) and v2.0 (editor + community) slot in
unchanged — the editor inherits every new mechanic through the shared
solver, which becomes an even bigger moat.

**Total to "unmistakably its own game": ~4 months of focused solo work.**

---

## 9. Success criteria (so we know it worked)

- A screenshot posted with no caption gets "what game is this?" replies.
- App Store feature consideration is plausible on visuals alone (features
  are pitched with 5 screens + 15s preview — R1+R2 build exactly those).
- The word "clone" appears in zero of the first 20 reviews.
- Day-7 retention ≥ 12% (genre good), daily-puzzle share CTR ≥ 4%.
- One mechanic (couplings) that a competitor would need a solver rewrite to
  copy.
