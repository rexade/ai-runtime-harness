# Milestone 5: Agent Usage Loop

## Goal

Prove that the packaged harness works as an AI-facing workflow, not only as a packaging or attach smoke.

The target loop is:

```txt
install package
-> attach to app
-> discover surfaces
-> select one
-> inspect affordances
-> observe state
-> act
-> observe what changed
```

## Exact commands

Start the external proving lab:

```bash
cd ../ai-harness-playground
npm run dev
```

Install the packaged harness into a fresh external repo:

```bash
npm install /absolute/path/to/ai-runtime-harness-0.1.0.tgz
```

Human/bootstrap attach:

```bash
npx --no-install ai-runtime-harness attach http://localhost:4173 --surface dashboard
```

Agent control server:

```bash
node ./node_modules/ai-runtime-harness/dist/mcp-server.js
```

Validation command from this repo:

```bash
node scripts/agent-usage-loop-smoke.mjs
```

## Expected output

Bootstrap attach should report:

- harness runtime detected
- surfaces: `dashboard`, `form`, `game`, `network`
- selected surface summary
- surface affordances

The packaged agent-loop smoke should report a JSON summary like:

```json
{
  "packagedAttach": {
    "mode": "harness-runtime",
    "selectedSurfaceId": "dashboard",
    "surfaces": ["dashboard", "form", "game", "network"]
  },
  "agentLoop": {
    "selectedSurfaceId": "dashboard",
    "affordances": ["setRegion", "toggleMode", "advancePulse", "reset"],
    "changed": ["region: \"sahara\" -> \"lagoon\""]
  },
  "degraded": {
    "mode": "degraded-browser-only",
    "domRoot": "body"
  }
}
```

## Example AI workflow

Use the packaged MCP server and call tools in this order:

1. `browser.open`
   Use `http://localhost:4173/?ai-harness=1&surface=dashboard`
2. `session.wait_until_ready`
   Wait for `surfaceId: "dashboard"`
3. `session.list_surfaces`
   Confirm the available surfaces
4. `session.select_surface`
   Select `dashboard`
5. `explorer.get_affordances`
   Read available actions for that surface
6. `explorer.observe`
   Read current stores, DOM, session, and errors
7. `explorer.call_action`
   Example: `setRegion { region: "lagoon" }`
8. `explorer.observe`
   Compare the resulting store and session state

That is the real agent loop: attach, inspect, act, inspect again.

## What the AI can see

- attach summary from `ai-harness attach`
- surface list and selected surface identity
- manifest affordances and store metadata
- current store state through `explorer.observe` or `explorer.get_store`
- DOM/runtime state through `explorer.observe`
- session state including last action
- screenshots if it asks for them

## What the AI can do

- open or attach a browser session
- select a surface
- call registered affordances
- click, press, type, and screenshot
- read state before and after an action
- fall back to browser-only mode when no runtime exists

## Degraded browser-only behavior

If no harness runtime is present:

- `session.status` reports disconnected runtime state
- `ai-harness attach` reports `degraded-browser-only`
- the agent can still use:
  - `browser.get_dom`
  - `browser.get_accessibility_tree`
  - `browser.click`
  - `browser.type`
  - `browser.press`
  - `browser.screenshot`

This is weaker than a first-class surface, but it still gives the AI usable eyes and hands.

## Current limitations

- `ai-harness attach` is still a bootstrap summary command, not a persistent interactive session manager.
- The continuing AI control path uses the packaged MCP server at `node_modules/ai-runtime-harness/dist/mcp-server.js`.
- Local `pnpm pack` still uses a staged package directory on Windows.

Those are acceptable for this milestone. The important proof is that an external install can attach, expose tools, inspect state, act, and recover to degraded mode without repo-local source hacks.
