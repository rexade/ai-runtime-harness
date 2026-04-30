# Milestone 2: Visible Explorer

## What now works

- The harness can attach to a running app and discover explicit, surface-scoped debug surfaces.
- Surfaces own their own stores and affordances, so duplicate local names like `reset` are valid across surfaces.
- The browser opens headful by default, so the controlled session is visible while the AI is acting.
- The proving target shows a visible harness presence panel with connection state, session id, selected surface, and last action.
- The dashboard surface and platformer surface both validate through the first-class session handshake.
- `scripts/visible-session-smoke.mjs` proves the core loop end to end.

## Core interaction loop

```txt
connect
-> session.list_surfaces
-> session.select_surface
-> session.wait_until_ready
-> explorer.get_affordances
-> observe state/UI
-> act through browser input or semantic affordances
-> verify what changed
```

## Run the visible smoke

From the `ai-runtime-harness` repo root:

```powershell
node scripts/visible-session-smoke.mjs
```

## Expected visible result

- A headful browser window opens on the validation target app.
- The dashboard surface shows `AI HARNESS CONNECTED`, a session id, the selected `dashboard` surface, and the last action after `setFocusRegion`.
- The script then opens the platformer surface and the same visible banner updates to the selected `platformer` surface and the last action after `movePlayer`.
- Platformer movement is visible in the running app, not only in hidden state.

## Current limitations

- The original visible smoke is still tied to the legacy `demo_phone_application` fixture and serves as a historical milestone check rather than the preferred proving path.
- There is no generic attach CLI yet. Running against another project still requires project-specific setup or scripts.
- Presence visibility depends on the target app rendering a harness panel; the protocol can report session state, but not every app will show it yet.
- Surface selection is explicit, but onboarding a new app still requires manual semantic registration of surfaces, stores, and affordances.

## Current primary proving lab

- `../ai-harness-playground` is now the primary external validation target.
- It replaces `demo_phone_application` as the cleanest proof surface because it exists to stress the harness itself rather than to simulate a product roadmap.
- The historical `visible-session-smoke.mjs` remains useful, but the preferred ongoing proof loop should move toward the playground and, later, a first-class attach CLI.

## Next candidate milestones

- **Milestone 3: Project Attach Flow**
  Add a simple attach command such as `ai-harness attach http://localhost:5173` so another repo can expose eyes and hands without custom smoke scripts.
- **Milestone 4: Surface Onboarding Kit**
  Make app-owned surface registration easier and more standardized for apps, dashboards, and games.
- **Milestone 5: Degraded Attach Mode**
  Improve the browser-only fallback path for apps that do not yet expose first-class semantic surfaces.
