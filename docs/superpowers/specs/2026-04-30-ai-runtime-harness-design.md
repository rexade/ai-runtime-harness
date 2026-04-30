# AI Runtime Harness — Design Spec
**Date:** 2026-04-30
**Status:** Approved

---

## What It Is

A dev-only MCP server that exposes browser apps, React apps, and JS games to AI agents through a controlled, observable, replayable interface.

**The problem it solves:** AI cannot build or test interactive software reliably because it has no runtime control. It can read code, but it cannot observe running state, step through frames, mutate conditions, or produce reproducible bug reports. Screenshots are not enough.

**What it is not:**
- Not a screenshot bot
- Not a Playwright clone
- Not an eval tool
- Not a general-purpose automation framework

**What it is:**
A semantic bridge between the AI agent and the running interactive system.

---

## Core API — Seven Verbs

Every runtime target (browser app, game, future: Unity/Godot) exposes the same conceptual surface:

| Verb | What it does |
|------|-------------|
| `observe` | Read current runtime state — DOM, component tree, entities, physics, console, network |
| `act` | Perform actions — click, type, press button, call semantic action |
| `mutate` | Change conditions — set gravity, teleport entity, force health value, mock API |
| `advance` | Step time — advance N frames, set timescale, pause/resume |
| `assert` | Verify state — assert entity exists, position within tolerance, no errors |
| `record` | Start/stop recording a deterministic session |
| `replay` | Replay a recorded session to reproduce a bug or regression |

The MCP server does not need to know whether the target is React, Phaser, or Three.js. It exposes these seven verbs. The runtime adapter underneath handles the specifics.

---

## Architecture

```
ai-runtime-harness/
├── packages/
│   ├── protocol/           # shared TypeScript schemas
│   ├── browser-runtime/    # DOM, React, stores, network, console
│   ├── game-runtime/       # entities, physics, scenes, input, recorder
│   │   └── adapters/
│   │       ├── phaser.ts
│   │       ├── pixi.ts
│   │       ├── three.ts
│   │       └── custom.ts
│   ├── vite-plugin/        # injects browser + game runtime in dev
│   └── mcp-server/         # WebSocket bridge + MCP tool definitions
├── examples/
│   ├── react-dashboard/    # React + Zustand app
│   └── phaser-platformer/  # Phaser 3 platformer
└── package.json            # pnpm workspace
```

**Tech stack:** TypeScript, pnpm monorepo, `@modelcontextprotocol/sdk`, Vite, Zod for schema validation.

---

## Package: protocol

Shared schemas used by all packages. No runtime dependencies.

```ts
type Observation = {
  runtime: 'browser' | 'game'
  time: number
  frame?: number
  scene?: SceneSnapshot
  dom?: DomSnapshot
  entities?: EntitySnapshot[]
  stores?: StoreSnapshot[]
  network?: NetworkEvent[]
  console?: ConsoleEvent[]
  errors?: RuntimeError[]
}

type Action =
  | BrowserAction      // click, type, navigate, scroll, hover
  | GameInputAction    // press, release, tap, move_axis
  | GameMutationAction // teleport, set_velocity, apply_force, spawn, destroy
  | RuntimeAction      // pause, resume, advance_frames, set_timescale, set_rng_seed
  | AssertionAction    // assert_expression, assert_position_near, assert_health

type ReplaySession = {
  id: string
  seed?: number
  scene?: string
  steps: ReplayStep[]
}

type ReplayStep = {
  frame: number
  action: Action
  snapshot?: Observation
}
```

---

## Package: browser-runtime

Runs **inside the browser page**. Injected by the Vite plugin. Connects to the MCP server WebSocket at `ws://localhost:7777`.

**Connection model:**
```
mcp-server starts WebSocket server on localhost:7777
browser-runtime connects to ws://localhost:7777 as a client
MCP tools send commands through mcp-server → browser-runtime executes them inside the page
browser-runtime returns observations/results back through the same connection
```

**Capabilities:**
- `dom.ts` — DOM tree serialization, element querying, event dispatch (click, type, scroll, hover)
- `react.ts` — hooks `__REACT_DEVTOOLS_GLOBAL_HOOK__`, reads React fiber tree (component names, props, state, context). Read-only — fiber internals are never written to.
- `stores.ts` — auto-detects Zustand stores (via `window.__zustand_stores` convention) and Redux (via DevTools extension protocol); reads full store state; dispatches actions through store's own API
- `network.ts` — wraps `fetch` and `XMLHttpRequest` to log all requests/responses; supports `mock_api(pattern, response)` to intercept and return fake data
- `console.ts` — wraps `console.log/warn/error` to capture output with timestamps
- `websocket-client.ts` — browser-side WebSocket client; connects to MCP server, receives commands, sends results

**Registration (vite.config.ts):**
```ts
import { aiHarness } from '@ai-runtime-harness/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    aiHarness({
      stores: { app: useAppStore },   // Zustand stores to expose
      networkCapture: true,
      consoleCapture: true,
      unsafeEval: false               // inject_script disabled by default
    })
  ]
})
```

---

## Package: game-runtime

Runs **inside the game** (same JS process). Registered explicitly by the game developer.

**Capabilities:**
- `registry.ts` — central registry for entities, actions, state serializers
- `entities.ts` — reads registered entity arrays, serializes to EntitySnapshot
- `physics.ts` — reads physics world state (gravity, bodies, collisions last frame)
- `scenes.ts` — current scene name, load/unload
- `input.ts` — simulates keyboard/gamepad input, tracks input state
- `recorder.ts` — records frames (seed, inputs, mutations, snapshots) to ReplaySession JSON

**Registration (game startup code):**
```ts
import { registerGameHarness } from '@ai-runtime-harness/game-runtime'
import { phaserAdapter } from '@ai-runtime-harness/game-runtime/adapters/phaser'

registerGameHarness({
  name: 'my-platformer',
  engine: phaserAdapter(game),
  entities: {
    player: () => player,
    enemies: () => enemies.getChildren(),
    coins: () => coins.getChildren()
  },
  actions: {
    jump: () => player.jump(),
    damagePlayer: ({ amount }) => player.takeDamage(amount),
    spawnEnemy: ({ type, x, y }) => spawnEnemy(type, x, y),
    loadLevel: ({ name }) => loadLevel(name)
  },
  state: {
    player: () => ({
      x: player.x,
      y: player.y,
      velocity: { x: player.body.velocity.x, y: player.body.velocity.y },
      grounded: player.body.blocked.down,
      health: player.health,
      animation: player.anims.currentAnim?.key
    })
  }
})
```

The explicit registration model is a hard design constraint. The harness will not attempt to auto-discover entities from engine internals. This keeps behavior predictable and avoids brittle reflection hacks.

---

## Package: vite-plugin

Single Vite plugin. Injects browser-runtime in dev mode only. Does nothing in production builds.

```ts
// packages/vite-plugin/index.ts
export function aiHarness(options): Plugin {
  return {
    name: 'ai-runtime-harness',
    apply: 'serve',                    // dev only
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { src: '/@ai-harness/runtime.js' } }]
    },
    configureServer(server) {
      // serve bundled runtime script at /@ai-harness/runtime.js
    }
  }
}
```

---

## Package: mcp-server

Node.js process. **Owns the WebSocket server on `:7777`** — browser-runtime connects to it as a client. Exposes MCP tools to Claude Code via `claude_code_settings.json`.

**Browser tools:**
```
app.get_dom(selector?)            → DOM tree
app.get_react_tree(component?)    → component tree with state/props
app.get_store(name?)              → full store state
app.get_console(limit?)           → recent console output
app.get_network(limit?)           → recent requests/responses
app.get_errors()                  → current JS errors
app.click(selector)               → click element
app.type(selector, text)          → type into input
app.navigate(url)                 → change URL
app.scroll(selector, amount)      → scroll
app.hover(selector)               → hover
app.mock_api(pattern, response)      → intercept fetch/XHR
app.call_action(name, args)          → call a registered app-side debug action
app.set_store_state(name, patch)     → patch Zustand/Redux store state
app.dispatch_store_action(name, action) → dispatch action through store's own API
app.screenshot()                     → visual fallback
```

**Game tools:**
```
game.get_scene()                  → scene name + frame + time
game.get_entities(filter?)        → all registered entity snapshots
game.get_entity(id)               → single entity
game.get_player()                 → shorthand for player entity
game.get_physics()                → gravity, collisions last frame
game.get_input()                  → current input state
game.press(button)                → hold button
game.release(button)              → release button
game.tap(button, frames)          → press + advance + release
game.advance_frame()              → step 1 frame
game.advance_frames(n)            → step N frames (key debugging tool)
game.pause()                      → freeze simulation
game.resume()                     → unfreeze
game.set_timescale(value)         → slow motion / fast forward
game.set_rng_seed(seed)           → deterministic randomness
game.call_action(name, args)      → call registered semantic action
game.teleport_entity(id, pos)     → set entity position
game.set_velocity(id, velocity)   → set entity velocity
game.apply_force(id, force)       → apply physics force
game.spawn_entity(type, props)    → create entity
game.destroy_entity(id)           → remove entity
game.record_start(name)                        → start recording
game.record_stop()                             → stop + save replay
game.replay(id)                                → replay a saved session
game.screenshot()                              → visual fallback
```

**Safe structured assertions (default):**
```
game.assert_entity_exists(id)                  → entity is present in scene
game.assert_position_near(id, pos, tolerance)  → position within tolerance
game.assert_health(id, value)                  → entity health equals value
game.assert_no_errors()                        → no JS errors since last check
game.assert_scene(name)                        → current scene matches
```

**Opt-in / marked dangerous:**
```
game.assert_expression(expression)    → JS expression evaluated against game state
runtime.eval(code)                    → arbitrary JS in page context
runtime.patch_module(name, patch)     → hot-patch a module
```

Unsafe tools require explicit opt-in in vite plugin config (`unsafeEval: true`). They are never enabled by default.

**Design principle:** Read internals. Mutate through stable surfaces.
- Reading React fiber tree: fine.
- Writing React fiber tree directly: not in v1.
- Mutating game state through registered actions/entities: fine.
- Dispatching through store's own API: fine.

---

## Recording / Replay

Non-negotiable. Without replay, AI-generated bug reports are noise.

The recorder captures:
- Initial RNG seed
- Initial scene
- Frame number for every step
- All inputs
- All mutations
- State snapshots at key frames
- Assertions
- Console output
- Network calls

Output format:
```json
{
  "id": "jump_collision_bug",
  "seed": 12345,
  "scene": "level_2",
  "steps": [
    { "frame": 0, "action": { "type": "teleport_entity", "id": "player", "x": 100, "y": 200 } },
    { "frame": 1, "action": { "type": "press", "button": "jump" } },
    { "frame": 12, "action": { "type": "release", "button": "jump" } },
    { "frame": 60, "action": { "type": "assert", "expression": "player.grounded === true" } }
  ]
}
```

Replays are saved to `.ai-harness/replays/` in the project root and committed to git as regression tests.

---

## The AI Game Dev Loop

The workflow this harness enables:

```
1. Developer describes bug:
   "The jump clips through platforms sometimes."

2. Claude observes:
   game.get_player() → velocity, grounded, animation
   game.get_physics() → gravity, recent collisions
   game.record_start("jump_clip_investigation")

3. Claude reproduces:
   game.set_rng_seed(123)
   game.set_scene("test_platform")
   game.call_action("teleport", { x: 100, y: 200 })
   game.tap("jump", 12)
   game.advance_frames(60)

4. Claude inspects:
   game.get_entity("player") → position, velocity, grounded
   game.get_physics() → collisions last frame

5. Claude identifies cause, edits code.

6. Claude reruns same replay → asserts bug is fixed.

7. Claude saves replay as regression test.
```

---

## V1 Scope

**In:**
- `@ai-runtime-harness/protocol`
- `@ai-runtime-harness/browser-runtime` (DOM, React, Zustand, Redux, network, console)
- `@ai-runtime-harness/game-runtime` + adapters (Phaser, PixiJS, Three.js, custom)
- `@ai-runtime-harness/vite-plugin`
- `@ai-runtime-harness/mcp-server`
- Examples: `react-dashboard`, `phaser-platformer`
- Recording / replay

**Out (future versions):**
- Unity, Godot, Unreal adapters
- Visual diffing / screenshot comparison
- AI reward / fitness functions
- Cloud replay storage
- Multi-agent scenarios
- Electron / native desktop

---

## Success Criteria

After v1:
- Claude can navigate a React app, read component state, interact with forms, and report errors without screenshots
- Claude can load a Phaser game, observe entity state, step frames, reproduce a bug, produce a replay file, fix the bug, and verify the fix with the same replay
- A developer can add the harness to a new project in under 5 minutes
- Zero impact on production builds (harness never ships to users)
