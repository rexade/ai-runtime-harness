# AI Runtime Harness

AI Runtime Harness is a dev-only system that lets AI agents observe and control interactive software through a stable, replayable debug surface.
It exists to give AI eyes and hands on a running application so it can iterate while the software is live.
Verification, proof, recording, and replay matter only insofar as they help the AI continue interacting reliably.

## Language

**Debug Surface**:
A browser-hosted runtime surface that exposes semantic runtime state and control to the harness and can also produce visual proof during development.
_Avoid_: app, browser app, page, target app

**AI Interaction Loop**:
The core workflow where the AI observes the running application, acts on it, and checks enough outcome to decide the next step.
_Avoid_: proof workflow, report generation, compliance loop

**Iteration Verification**:
The minimum verification needed for the AI to keep iterating, such as screen change, state change, new errors, or affordance success.
_Avoid_: full proof, compliance evidence, regression suite

**Semantic Visibility**:
Structured runtime state, actions, errors, and timing exposed so the AI can reason, act, and verify.
_Avoid_: pixels, screenshot, visual state

**Visual Proof**:
Browser-captured pixels that show a human what the debug surface looked like after or during a harness action.
_Avoid_: state, telemetry, semantic snapshot

**Degraded Mode**:
Fallback operation against a browser page with passive automation and observation but without explicit semantic registration.
_Avoid_: compatible, harness-compatible, full support

**Harness-Compatible**:
A debug surface with explicit semantic registration for state, actions, and recording so the harness can deliver its core product promise.
_Avoid_: browser-only, partial support, automation-only

**First-Class Debug Surface**:
A harness-compatible debug surface that also provides replay baselines, semantic checkpoints, visible proof cues, and durable proof artifacts.
_Avoid_: fully automated page, instrumented page

**App-Owned Registration**:
The explicit semantic contract declared by the app for what the harness may observe, mutate, and invoke.
_Avoid_: auto-detection, reflection, discovery

**Inferred Affordance**:
A store, action, or structure suggested by a framework adapter through discovery rather than confirmed by the app.
_Avoid_: registered capability, source of truth, contract

**Adapter-Assisted Mode**:
An operating mode where framework discovery suggests affordances, but the app must explicitly confirm them to make them first-class.
_Avoid_: first-class compatibility, automatic support

**Shipped Product**:
The software delivered to end users on its native platform, which may differ from the debug surface used during development.
_Avoid_: target, runtime, application

**Harness Session**:
A connected run of the harness against one debug surface under a single session identity.
_Avoid_: tab, browser session

**Visible AI Session**:
A human-visible presentation of the current harness session that makes connection state, selected surface, session id, and last received harness action obvious in the running app.
_Avoid_: proof artifact, report, hidden overlay

**Proving Lab**:
A small external repo whose purpose is to stress the harness across multiple interactive surface types without pretending to be a real product.
_Avoid_: polished demo app, product showcase, end-user application

**Legacy Dogfood Fixture**:
An older internal validation target kept only to preserve historical checks or narrow regressions after a cleaner proving lab exists.
_Avoid_: primary demo, canonical proof target, product companion app

**Surface Selection**:
The explicit choice of which debug surface within a running app becomes the current implicit target for explorer calls that omit `surfaceId`.
_Avoid_: active tab, global mode, guessed target

**Capability Manifest**:
The versioned semantic contract a first-class debug surface exposes at session start to declare what the harness can observe, invoke, mutate, reset, and replay.
_Avoid_: registration dump, tool list, inferred state

**Manifest Snapshot**:
The exact capability manifest captured with a recording artifact so replay can validate compatibility before acting.
_Avoid_: metadata blob, session note

**Baseline Reset**:
An app-owned operation that restores the debug surface to a declared starting line for deterministic replay.
_Avoid_: store patch, soft reset, best effort reset

**Interaction Affordance**:
A stable named capability exposed by the app that the harness can invoke as part of the semantic contract.
_Avoid_: selector step, click target, tool name

**Selector Step**:
A replay or recording step that depends on raw DOM selectors or browser tool names rather than a named interaction affordance.
_Avoid_: stable action, contract step

**Visible UI Path**:
The real user-visible interaction path through the interface, such as clicking, typing, selecting, or dragging in the rendered app.
_Avoid_: shortcut, patch, semantic action

**Semantic Shortcut**:
An affordance that reaches an outcome by directly changing semantic state instead of executing the visible user path.
_Avoid_: ui flow, user interaction, proof

**Execution Path**:
The declared route an affordance uses to produce its effect, such as visible UI, game input, semantic action, state mutation, or system control.
_Avoid_: hidden implementation, implicit behavior

**User-Flow Proof**:
Evidence that a recorded affordance actually exercised the visible user or gameplay path rather than a shortcut.
_Avoid_: state change, semantic success

**Success Contract**:
A lightweight machine-checkable set of expected postconditions that determines whether an affordance actually worked rather than merely ran.
_Avoid_: full verification system, description, step log

**Unverified Result**:
An affordance execution that ran without a declared success contract or without passing its declared checks.
_Avoid_: proven success, verified behavior

**Scenario Assertion**:
An optional investigation-specific check layered on top of an affordance success contract to prove a particular case rather than general affordance correctness.
_Avoid_: manifest contract, reusable capability, generic success check

**Recording Artifact**:
A saved sequence of tool steps, semantic checkpoints, deltas, and the manifest snapshot captured during a harness session.
_Avoid_: replay file, log, transcript

**Fail-Fast Replay**:
Replay behavior that validates the manifest snapshot before execution and stops immediately on contract incompatibility.
_Avoid_: best effort, partial replay, lenient replay

**Best-Effort Replay**:
An explicitly requested degraded replay mode that proceeds despite manifest mismatch and marks its proof as non-deterministic.
_Avoid_: normal replay, reliable replay

**Deterministic Replay**:
Replay that starts from a validated manifest and baseline reset, then replays actions against a verified starting checkpoint.
_Avoid_: approximate replay, patched replay

**Replay Stability Guarantee**:
The declared expectation that an interaction affordance remains valid across UI refactors as long as its semantic intent and schema do not change.
_Avoid_: selector compatibility, incidental stability

## Relationships

- A **Shipped Product** may expose one or more **Debug Surfaces** for development and testing
- The primary purpose of a **Debug Surface** is to support the **AI Interaction Loop**
- **Iteration Verification** exists to keep the **AI Interaction Loop** moving rather than to maximize evidence capture
- A **Debug Surface** provides **Semantic Visibility** for AI control and may produce **Visual Proof** for human trust
- A **Debug Surface** operating in **Degraded Mode** is useful fallback coverage but does not satisfy first-class harness compatibility
- A **Harness-Compatible** surface requires explicit semantic registration rather than passive browser automation alone
- A **First-Class Debug Surface** includes all **Harness-Compatible** capabilities plus replay baselines, semantic checkpoints, and proof artifacts
- **App-Owned Registration** is the source of truth for first-class compatibility
- An **Inferred Affordance** may speed up setup, but it does not become first-class until the app confirms it through **App-Owned Registration**
- **Adapter-Assisted Mode** may expose inferred affordances, but recordings and replays should rely on app-owned registered affordances
- A **Harness Session** is attached to exactly one **Debug Surface** at a time
- A **Visible AI Session** makes the active **Harness Session** legible to a human watching the same running app
- A **Proving Lab** is the preferred external validation target for the harness because it isolates harness behavior from product noise
- A **Legacy Dogfood Fixture** may remain for regression coverage, but it should not define the main product story once a cleaner **Proving Lab** exists
- A running app may expose multiple **Debug Surfaces**, but only one **Surface Selection** is implicit at a time
- Action and store registries are surface-scoped roots; duplicate local names across surfaces are valid
- A **First-Class Debug Surface** exposes a **Capability Manifest** at session start
- The canonical first-class session handshake is `connect -> session.list_surfaces -> session.select_surface -> session.wait_until_ready -> session.get_manifest -> explorer.get_affordances -> act -> observe -> iterate`
- A **First-Class Debug Surface** exposes a **Baseline Reset** capability as part of that manifest
- A **First-Class Debug Surface** exposes stable **Interaction Affordances** as part of the manifest
- A **Recording Artifact** is captured from exactly one **Harness Session** and preserves semantic checkpoints, visual proof, and a **Manifest Snapshot** for replay against a compatible **Debug Surface**
- **Fail-Fast Replay** validates the **Manifest Snapshot** before acting and is the default replay mode
- **Best-Effort Replay** is a degraded override that must be explicitly requested
- **Deterministic Replay** requires a **Baseline Reset**; restoring mutable stores alone is degraded fallback rather than first-class replay
- **Selector Steps** are allowed in exploration and degraded replay, but first-class replay depends on named **Interaction Affordances**
- An **Interaction Affordance** carries a **Replay Stability Guarantee**; raw selectors do not
- **Visual Proof**, **Recording Artifacts**, and replay are secondary layers on top of the **AI Interaction Loop**, not the product center
- A `ui.*` **Interaction Affordance** must execute a **Visible UI Path**
- A `player.*` **Interaction Affordance** must execute the real gameplay input path
- A **Semantic Shortcut** must live in an honest non-UI namespace such as `debug.*`, `mutation.*`, or `state.*`
- Every first-class **Interaction Affordance** declares its **Execution Path** and whether it provides **User-Flow Proof**
- A first-class **Interaction Affordance** may declare a lightweight **Success Contract** so the harness can verify that the app responded correctly
- Executing an affordance without a passing **Success Contract** is an **Unverified Result**, not proven success
- A **Scenario Assertion** layers on top of a **Success Contract** to prove that a specific investigation, seed, character, route, or condition was satisfied

## Example dialogue

> **Dev:** "This Android game ships on mobile, so can the harness still drive it?"
> **Domain expert:** "Yes, if the game exposes a **Debug Surface** in the browser. The AI uses its **Semantic Visibility**, and the developer relies on **Visual Proof** to trust what happened."

> **Dev:** "The page opens in Chromium and the agent can click buttons. Is that harness-compatible?"
> **Domain expert:** "No. That is **Degraded Mode** unless the page explicitly registers semantic state and actions with the harness."

> **Dev:** "The adapter discovered a Redux store automatically. Is that first-class now?"
> **Domain expert:** "No. That is an **Inferred Affordance** until the app promotes it through **App-Owned Registration**."

> **Dev:** "Yesterday's recording calls `player.jump`, but today's surface renamed it. Should replay try anyway?"
> **Domain expert:** "Not by default. **Fail-Fast Replay** validates the **Manifest Snapshot** first and stops on contract mismatch. **Best-Effort Replay** is an explicit degraded override."

> **Dev:** "Can't replay just patch the stores back and continue?"
> **Domain expert:** "Not for first-class reliability. **Deterministic Replay** starts from a **Baseline Reset**. Store patching is only degraded fallback."

> **Dev:** "The DOM changed, but the user flow is still the same. Should replay still survive?"
> **Domain expert:** "Yes, if replay calls a stable **Interaction Affordance** like `ui.start_match`. A raw **Selector Step** would be degraded and brittle."

> **Dev:** "Can `ui.submit_login` just patch auth state if the end result is the same?"
> **Domain expert:** "No. A `ui.*` affordance must follow a **Visible UI Path**. Direct state changes are **Semantic Shortcuts** and must be named under `debug.*`, `mutation.*`, or `state.*`."

> **Dev:** "The button was clicked. Doesn't that prove the login flow worked?"
> **Domain expert:** "No. That only proves the input ran. A **Success Contract** proves the app responded correctly. Without that, the run is an **Unverified Result**."

> **Dev:** "Do we put `selectedCharacter = wizard` into `ui.start_match`?"
> **Domain expert:** "No. That belongs in a **Scenario Assertion** attached to the specific proof or recording, not in the reusable affordance contract."

> **Dev:** "Should proof artifacts drive the roadmap?"
> **Domain expert:** "No. The roadmap should optimize the **AI Interaction Loop** first, then **Iteration Verification**, with proof and replay layered on later when they help that loop."

## Flagged ambiguities

- "application" was used to mean both the **Shipped Product** and the **Debug Surface** - resolved: the harness integrates with the **Debug Surface**, not the shipping platform directly.
- "see" was used to mean both **Semantic Visibility** and **Visual Proof** - resolved: semantic visibility is primary for AI control, visual proof is secondary but required for human trust.
- "supported" was used to mean both passive browser automation and full harness integration - resolved: passive automation is **Degraded Mode**; first-class compatibility depends on explicit semantic registration.
- "discovered" was used as if it were equivalent to "registered" - resolved: adapters can suggest affordances, but **App-Owned Registration** decides what is first-class.
- "registered names" was used as if it were enough for replay compatibility - resolved: replay validates a versioned **Capability Manifest**, not ad-hoc names alone.
- "reset" was used as if store restoration were sufficient - resolved: first-class replay requires an app-owned **Baseline Reset**.
- "action" was used to mean both stable semantic capability and raw browser step - resolved: first-class replay uses **Interaction Affordances**; selector-driven steps are degraded fallback.
- "`ui.*`" was used as if it could include hidden state shortcuts - resolved: `ui.*` proves the visible path, while shortcuts must be labeled honestly by namespace and **Execution Path**.
- "action succeeded" was used as if input execution were enough - resolved: first-class affordances use a **Success Contract**; otherwise the outcome is **Unverified**.
- "proof of this case" was used as if it belonged in the manifest - resolved: reusable proof lives in the **Success Contract**; case-specific proof lives in **Scenario Assertions**.
- "proof" was drifting toward the product center - resolved: the core product is the **AI Interaction Loop**; proof and replay are secondary capabilities.

## Repo roles

- `ai-runtime-harness` is the product repo.
- `ai-harness-playground` is the primary external **Proving Lab** and the cleanest validation target for multi-surface eyes-and-hands behavior.
- `demo_phone_application` is a **Legacy Dogfood Fixture**. It may remain useful for historical or narrow regression checks, but it is no longer the main proving target.

## Current proving target

- The preferred external validation target is `../ai-harness-playground`.
- It is intentionally small and includes four surface types: dashboard, form, canvas game, and network chaos.
- The harness should be judged primarily by whether it can attach to that repo, discover surfaces, act, observe, and verify outcomes cleanly.
- The next major product step after that proving lab is a first-class attach flow such as `ai-harness attach <url>`.
