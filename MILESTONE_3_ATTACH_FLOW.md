# Milestone 3: Attach Flow

## What now works

- The harness exposes a real `ai-harness attach <url>` CLI entry.
- The attach flow opens the target app through the browser-driver in headful mode by default.
- The attach flow arms the target URL with `ai-harness=1` and waits for a harness runtime if one is present.
- If a runtime is present, the CLI lists surfaces, optionally selects a requested surface, and prints manifest and affordance summaries.
- If no runtime is present, the CLI falls back to degraded browser-only mode instead of failing uselessly.
- Degraded mode now has browser-driver DOM, accessibility, screenshot, click, type, and press support.

## Command examples

```powershell
ai-harness attach http://localhost:5173
ai-harness attach http://localhost:5173 --surface game
ai-harness attach http://localhost:5173 --surface game --json --headless
```

## Current behavior

- `--surface <id>` selects a specific surface and prints its affordances.
- `--headless` makes attach usable in smoke tests and automation.
- `--screenshot` captures a screenshot after attach.
- `--json` prints machine-readable output for scripts.
- `--timeout <ms>` controls how long attach waits for a runtime or ready surface.

## Validation target

- `../ai-harness-playground` is the primary attach-flow proving lab.
- The attach smoke validates:
  - runtime attach against the playground root
  - explicit surface selection with `--surface game`
  - degraded browser-only attach against a plain local page

Run it from the harness repo root:

```powershell
node scripts/attach-flow-smoke.mjs
```

## Known limitation

- `ai-harness attach` currently acts as a structured attach/inspect command, not a persistent interactive AI session manager.
- The next product step is turning this into an easier always-on handoff path for AI control after attach, rather than stopping at summary output.
