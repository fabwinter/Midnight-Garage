# Midnight Garage → a game that stands on its own
### AAA-grade elevation plan — v2, post theme review

Companion to [SEQUENCING-PLAN.md](SEQUENCING-PLAN.md). Governing principle
unchanged: a third of these ideas at 100% quality beats all of them at 70%.

**v2 changes (theme review, 2026-07):** the rail-yard pivot is dropped —
crossing tracks read visually busy and physically wrong, and train games
are their own saturated niche. **We stay with cars in a night city.**
Adopted from the rail exploration: the night/light/weather art direction
(unanimous keep), the **decoupling mechanic** re-fictioned as hitches
(rigs, trailers, caravans, tow trucks), and two new ideas from review:
**triggers/interlocks** (boom gates, bay sensors) and **cross-traffic
lanes** (tram line, canal + drawbridge) as chapter set-dressing mechanics.
Rail mockup kept at `mockups/rail-scene.html` for reference; the current
visual target is `mockups/city-scene.html`.

---

## 1. Setting: the city at 3 a.m.

Not a parking lot — a **street grid in the dead of night**. The fiction:
you're the night-shift valet/dispatcher untangling the city's stuck
corners. Streets give us everything the rail yard promised without the
crossing-tracks problem:

- Lanes are painted, not built — a grid of asphalt with bay markings and
  lane arrows is visually *calm* (our current board already is).
- The light vocabulary is native: **street lamps, traffic lights, boom
  gates, roadwork beacons, headlights, brake lights, neon spill.**
- Axis-lock is a soft abstraction ("stuck in their lane" reads fine in
  gridlock fiction) and nobody questions it after level 1.
- Cars have the broadest casual reach — the review's market call.

Brand stays **Midnight Garage** (the garage returns as the collection/home
screen in R5).

---

## 2. The Signature Three (unchanged in spirit, re-fictioned)

1. **Light and weather** — the most beautiful night rain on the App Store;
   every lamp, signal and headlight casts real light on wet asphalt.
2. **Sound as physics** — weight you can hear; an adaptive score that
   resolves musically when the street unblocks.
3. **One novel mechanic family** — **hitches + interlocks** (§5): things
   clone solvers can't follow.

---

## 3. Visuals — from "clean" to "you can smell the rain"

(Unchanged from v1 except set-dressing — full detail preserved.)

### 3.1 Renderer upgrade (the enabler — do first)
- WebGL canvas under DOM input (Pixi.js or hand-rolled; ~20 quads). DOM
  keeps hit-testing and the accessibility tree; WebGL owns pixels.
- 120Hz on iPhone 13+, 60Hz floor on SE. Frame budget asserted in the
  existing Playwright harness.
- Reduced-motion is a parallel presentation, never a broken one.

### 3.2 Lighting model (Signature #1)
- Normal-mapped sprites + point lights: street lamps (cool pools), traffic
  signals (red/green spill), roadwork beacons (amber strobe, slow),
  headlight cones that sweep as pieces slide, brake-light flare on stop.
- **The hero's headlights point at whatever blocks it** — lighting as a
  gameplay read.
- Solve-proximity: as the exit path clears, the gate glow widens and the
  hero's cone reaches further (solver's distance-to-freedom feeds the
  renderer). The board tells you you're close.

### 3.3 Weather & atmosphere per chapter
- **Night Shift:** clear, sodium lamps, moths in the beams.
- **Neon District:** rain — streaks in light shafts, puddle ripples,
  smeared neon reflections, occasional distant lightning.
- **Harbor Docks:** rolling fog the cars displace; foghorns; the canal
  chapter (§5.4) lives here.
- **Gridlock (pre-dawn):** snow accumulating on unmoved cars (a quiet
  "you haven't tried this one" hint), tire tracks through slush.
- Film pass: vignette, faint grain, 2% bloom on emissives, one LUT per
  chapter.

### 3.4 A living city (ambient life, max 1 event per 20s)
- A cat crossing the far crosswalk, a window lighting up, steam from a
  manhole, a distant siren doppler (audio only), wipers ticking on the
  hero in rain.
- Diorama parallax: 3 layers, ±4px gyro. Off in reduced-motion.

---

## 4. Animation & feel — every touch choreographed

- **Grab:** 2px lift, shadow spread, suspension squash on the grabbed end;
  hitched trailers take up slack with a clink.
- **Slide:** wheels roll at surface speed, spray kicks from tires in rain;
  flick inertia (shipped) gains per-surface friction.
- **Stop:** squash-and-settle; cargo/trailer lags 60ms (secondary motion);
  brake lights flare; dust/spray puff per surface.
- **Blocked shove:** the *blocking* car rocks and its alarm chirps once,
  lights blinking — the board explains the rule, no buzzer.
- **Win choreography (the store preview):** last move lands → beat of
  silence → traffic lights down the exit lane flip green in a wave → boom
  gate rises → hero pulls out with real acceleration audio → 8% camera
  push, letterbox, micro slow-mo → stars. ≤2.6s, tap-skippable, honors
  auto-advance and reduced-motion.
- One spring-curve family for all UI; number tickers roll; nothing fades
  without moving.

---

## 5. Gameplay — depth that clones can't follow

Rules of the house: pure logic, no timers, no fail states, ≤4 mechanic
families total, one introduced per chapter, each extending the **shared
solver** so the generator, verifier, hints, daily, difficulty model and
future editor inherit it automatically.

### 5.1 Hitches (from review: keep decoupling) — the marquee
- **Rigs** ship coupled (cab + trailer as one heavy piece). Tap the glowing
  hitch to drop the trailer; re-align and tap to re-hitch. Uncoupling costs
  a move.
- **Tow truck** — the special piece: it can hitch to *any* car it lines up
  behind, then drag it. Diegetic, instantly understood, and mechanically
  the "couple to anything" upgrade.
- Solver: pieces carry a coupled-set id; sets move as one. State space
  grows but stays BFS-able on 6×6.

### 5.2 Interlocks (from review: triggers) — the sleeper hit
- **Bay sensors and boom gates:** a marked bay, when occupied by *any*
  vehicle, raises a boom gate elsewhere (or lowers one — both polarities).
  "Car A must park at X before car B can pass Y."
- **Why this one is a gift:** gate state is a *pure function of piece
  positions* — no extra state dimension in the solver. BFS state stays
  "positions only"; only the legal-move function changes. Near-zero solver
  cost, huge design space, and the difficulty model rates it for free.
- Readability is the real work: a glowing conduit runs in the asphalt from
  pad to gate (amber = will open, red = will close); the gate previews its
  swing when you touch the linked pad.
- Emergency variant later: an ambulance that must exit before anything
  else on its street may move (same pure-function trick).

### 5.3 Cross-traffic: the tram line (from review, scoped tight)
- One fixed diagonal-free **tram lane** crossing the board on rails set
  into asphalt (streetcar fiction — no rail-yard problem: ONE line, cars
  cross it at marked crossings). The tram is a piece like any other but
  long, heavy, and confined to its line; its crossings interact with boom
  gates (§5.2).
- Mechanically this is "a piece with its own lane" + interlocks — a
  *variant*, not a new family.

### 5.4 The canal (Harbor Docks chapter identity)
- One water lane with a **drawbridge**: cars cross the canal only where
  the bridge is down; a barge (slow, huge, satisfying) needs it *up*.
  Bridge state = an interlock driven by a wheel-pad or the barge position.
  Again a variant of §5.2/§5.3, not a fifth family.

**Honest family count: hitches, interlocks, cross-lanes (tram/canal are
the same family in two costumes), plus the base game. Four. Cap reached —
anything else waits for a sequel.**

### 5.5 Structure
- Boss streets: each chapter ends with a hand-authored 2-stage set piece
  (solve the block, camera pans, the street continues).
- **Rush Hour mode → "Gridlock Rescue"** (was Heist): clear the exit in N
  moves while a street sweeper advances one row per *your* move.
- Zen drive: endless generated boards, no stars, rain on, music soft.
- Between-chapter vignettes: five wordless screens of the night shift.
- The Garage (R5): home screen = your collection in a living diorama.

---

## 6. Sound — from bleeps to a mix (Signature #2)

- Weight as audio: rolling mass scales with length × velocity; trailer
  clink on slack/taut; heavy rigs get air-brake psshh; tram bell; barge
  horn. Alarm chirp for blocked shoves.
- Surfaces per chapter: dry asphalt / rain hiss + wet tires / fog-muffled
  bus (LPF) / snow-damped close-mic.
- Adaptive score: 3 intensity stems keyed to solver distance-to-freedom;
  win stinger quantized to the bar so the resolution lands musically.
- Ambience beds per chapter; ducked −6dB during win choreography.
- Bus mix (SFX/music/ambience) behind existing sliders; silent-switch and
  user-music mixing respected.
- Budget: commission or license (~$2–4k) after R2 proves the visual bar.

---

## 7. Not doing (updated)

| Cut | Why |
|---|---|
| Rail-yard theme | Review: visually busy crossings, unreal scenario, saturated niche |
| 3D / engine rewrite | 2.5D lighting is 90% of the wow at 10% of the cost |
| Multiple transport systems per board | ONE cross-lane per board max; it's seasoning, not the dish |
| Story dialogue | Five wordless vignettes only |
| Real-time anything | Sweeper/tram move per-player-move, never per-second |
| >4 mechanic families | Hitches, interlocks, cross-lanes, base. Done. |
| Procedural music | 3 authored stems |

---

## 8. Sequencing (shippable updates, one beat each)

| Release | Focus | Marketable beat | Effort |
|---|---|---|---|
| **R1 — The City** | Renderer swap, lighting model, city set-dressing, win choreography v1 | "It's beautiful" (new store shots) | 3–4 wk |
| **R2 — Rain** | Weather system, film pass, living-city events, sound pass 1 | The rain trailer | 3 wk |
| **R3 — Hitched** | Hitches + tow truck, solver/generator extension, 50-level chapter, boss street | "Not a clone" — press cycle | 4 wk |
| **R4 — The Score** | Adaptive music, ambience beds, Gridlock Rescue mode | "The puzzle game that mixes itself" | 3 wk |
| **R5 — Interlocks** | Boom gates + bay sensors chapter, tram line, vignettes | "The city fights back" | 4 wk |
| **R6 — The Garage** | Collection home screen, cosmetics, canal/drawbridge chapter | Collection + Harbor identity | 4–5 wk |

v1.1 (live-data tuning) and v2.0 (editor + community) slot in unchanged;
the editor inherits hitches and interlocks through the shared solver.

**Total to "unmistakably its own game": ~4–5 months solo.**

---

## 9. Success criteria

- A captionless screenshot gets "what game is this?" replies.
- Feature-pitch-ready: 5 screens + 15s preview straight out of R1+R2.
- "Clone" appears in zero of the first 20 reviews.
- D7 retention ≥ 12%; daily share CTR ≥ 4%.
- Two mechanics (hitches, interlocks) that require solver rewrites to copy.
