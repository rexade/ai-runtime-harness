# Tidebound Harbor Godot — 3D Arena Milestone — Design

## Goal

Replace the validation grid currently shown in `scenes/harbor_3d_prototype.tscn` with a small, hand-authored harbor playable in the 3D scene. Movement, terrain, and a handful of props ship together. The 3D logical world + 2D iso cube sprite architecture from the existing prototype is preserved as-is; this milestone adds content (a harbor) and migrates the player onto the same sprite-layer pipeline.

The 2D scene (`harbor_game.gd`, ~5000 lines, full procedural world with streaming) is **not** ported. The harbor is hand-authored from scratch inside the 3D prototype.

## Scope

**In:**
- Hand-authored arena terrain: ~20×20 grid, grass island + sand shore + dock cells + open water.
- Seven props: 1 boat at the dock (`assets/boat-sail-a.png`), 1 buoy in the water (`assets/buoy-flag.png`), 2 buildings — Lookout Tower (`assets/stranded-buildings/Lookout Tower.png`) and Shed (`assets/stranded-buildings/Shed.png`), 2 palm trees (`assets/tree-palm-tall.png` and `assets/tree-palm-short.png`), 1 bonfire (procedurally drawn — no PNG, see Risks).
- Player movement enabled in `LAYOUT_ARENA` (currently gated behind `DEFAULT_VALIDATION_CASE == 0`).
- Player visual migrated out of `MeshInstance3D` into the unified 2D sprite layer.
- Projected sprite shadows for player and props, via a new `scripts/harbor_prop_shadow.gd` helper.
- Building-footprint collision via prop data.

**Out:**
- Gerstner waves, foam, ripples, wakes, shore wavelets, reefs, caustics, glints, sun-as-sprite-light, normal-mapped tiles, atlas toggle, lit-sprite normal maps, sky.
- World streaming (`harbor_world_streamer.gd`), procedural terrain (`harbor_terrain.gd` noise/biome), static-build queue, performance monitors.
- HUD command dispatch, frame-cap / FPS-proof, multi-row character animations beyond the existing walk/idle.
- Boat as a vehicle, NPCs, interact prompts, lore markers, dock rigging, save/load.
- Authoring `dock_cube.png` art (placeholder cube ships via the existing `_draw_missing_cube_placeholder` path).
- Camera follow / zoom controls.
- Swapping `scenes/main.tscn` to the prototype. The harbor is reached via `scenes/harbor_3d_prototype.tscn` only.

## Architecture

### Scene structure & data model

The 3D prototype stays the host: `scenes/harbor_3d_prototype.tscn`, root `Node3D` with `harbor_3d_prototype.gd`. No new scene file. The validation layout (`LAYOUT_SPRITE_VALIDATION`) is left untouched — it remains the controlled test scene for cube projection and sprite bounds.

Static arena data is lifted into a new file:

```
scripts/harbor_arena_layout.gd   (RefCounted, class_name HarborArenaLayout)
```

Two static functions return the data, plus a spawn constant:

```gdscript
class_name HarborArenaLayout
extends RefCounted

const SPAWN_POINT := Vector2(...)  # grass-island center, away from props

static func columns() -> Array[Dictionary]:
    # ~20x20 cells of {cell: Vector2i, kind: String, height: int}
    # kinds: grass, sand, stone, dock, water

static func props() -> Array[Dictionary]:
    # 7 entries — see Scope section for exact set + asset paths.
```

Prop dictionary shape:

```gdscript
{
    "kind": "boat" | "buoy" | "building_lookout" | "building_shed" |
            "palm_tree" | "bonfire",
    "cell": Vector2i,
    "footprint": [Vector2i.ZERO]      # optional; defaults to single-cell
                                       # buildings supply [Vector2i(0,0),
                                       # Vector2i(1,0), Vector2i(0,1),
                                       # Vector2i(1,1)] for 2x2.
    "height_world": 1.6,               # visual world-space height in meters
    "anchor_offset": Vector2.ZERO,     # screen-space nudge in pixels
    "sort_bias": 0.0,                  # float; small tiebreaker
    "asset": "res://assets/...png",
    "shadow": true,
    "blocks": true                     # default; buoy sets blocks=false
}
```

`harbor_3d_prototype.gd` adds `var _props: Array[Dictionary]` populated from `HarborArenaLayout.props()` when `_layout_mode == LAYOUT_ARENA`. The validation layout never reads `_props`.

Boundary rationale: `harbor_3d_prototype.gd` is already 882 lines doing rendering + input + player + HUD + layout. Pulling layout out splits along the most-likely-to-change axis (content vs. renderer).

### Rendering pipeline (unified 2D projected draw list)

Terrain, shadows, props, **and the player** all draw into the existing `_terrain_sprite_layer: Node2D`, sorted as a single list. The function currently called `_draw_terrain_sprite_cubes` is renamed `_draw_world_sprites`.

Item shapes:

```gdscript
{ "layer": "terrain", "cell": Vector2i, "kind": String, "z": int }
{ "layer": "shadow",  "cell": Vector2i, "anchor_z": int, "prop": Dictionary }
{ "layer": "prop",    "cell": Vector2i, "anchor_z": int, "prop": Dictionary }
{ "layer": "actor",   "world_pos": Vector3, "sort_bias": float,
                      "actor": "player", "texture": Texture2D,
                      "region": Rect2, "card_size": Vector2 }
```

Layer order constant:

```gdscript
const LAYER_ORDER := {"terrain": 0, "shadow": 1, "prop": 2, "actor": 2}
```

Sort key:

```
# For terrain blocks:
primary   = cell.x + cell.y + z * 2
# For static props and prop shadows:
primary   = cell.x + cell.y + anchor_z * 2
# For the player actor:
primary   = world_pos.x + world_pos.z + world_pos.y * 2.0   # CONTINUOUS

secondary = LAYER_ORDER[item.layer]
tertiary  = sort_bias
```

`anchor_z` is the column height at the prop's anchor cell — the surface it stands on. The player uses continuous world-position to prevent visual popping when crossing cell boundaries.

`_height_at_player_pos()` and `_player_world_pos()` are added as the single conversion point so the player renderer, shadow renderer, and sort code do not invent their own player-world conversions.

Shadow math is ported from `scripts/projected_sprite_shadow.gd` (38 lines, 2D-only) into a new dedicated helper:

```
scripts/harbor_prop_shadow.gd
```

Cast direction is a constant `Vector2(1.0, 0.32)` matching the 2D scene. Tilt 45° flattens Y by `cos(45°)`. Modulate `Color(0.08, 0.12, 0.12, opacity * 0.52)`. The helper is **not** placed in `harbor_block_materials.gd` — cube face materials and projected prop shadows are different responsibilities.

### Player movement

The controller already exists. Three things change:

1. **Make the gate layout-conditional.** Today:

   ```gdscript
   if DEFAULT_VALIDATION_CASE == 0:
       _update_player(delta)
   ```

   Becomes:

   ```gdscript
   if _layout_mode == LAYOUT_ARENA:
       _update_player(delta)
   elif _layout_mode == LAYOUT_SPRITE_VALIDATION and _active_case == "free walk":
       _update_player(delta)
   ```

   Validation case-based teleport behavior is preserved unchanged. Free-walk validation (case 0) still works for cube-projection debugging.

2. **Remove the 3D player visual entirely.** `_player_card: MeshInstance3D` and `_player_shadow: MeshInstance3D` are removed from the scene. No hidden physics proxy node — `_player_pos / _player_velocity / _player_heading` are the gameplay-truth data. The 3D scene becomes the host for camera/lights/debug markers only.

3. **Building-footprint collision.** `_is_player_pos_walkable` extends to consult prop footprints:

   ```gdscript
   func _cell_blocked_by_prop(cell: Vector2i) -> bool:
       for p in _props:
           if not bool(p.get("blocks", true)): continue
           var anchor: Vector2i = p["cell"]
           var footprint: Array = p.get("footprint", [Vector2i.ZERO])
           for offset in footprint:
               if anchor + offset == cell: return true
       return false
   ```

   `blocks` defaults to `true`. Buoy is explicitly `blocks = false` (it lives in unwalkable water anyway; the explicit flag protects future swimming/boat modes from a phantom wall).

Heights are flat: grass = sand = dock = `1`, water = `0`. The player walks grass → sand → dock with no step. `PLAYER_MAX_STEP_HEIGHT := 1` stays as-is for any future stair-stepped dock.

Camera stays fixed orthographic (yaw 45°, elev 30°, ortho_size 31.5). The harbor fits in the viewport.

Boost (Shift) and `interact` (E) bindings stay. `interact` is a no-op for this milestone.

A gated debug log prints once per blocked-cell transition (not every frame):

```gdscript
print_debug("player_blocked_by_prop cell=%s kind=%s" % [cell, prop_kind])
```

## Definition of Done

Acceptance is screenshot-based via the godot-ai MCP (`mcp__godot-ai__editor_screenshot source=game`). Nine acceptance shots must pass:

1. **Arena overview** — `LAYOUT_ARENA` boots by default; HUD reads `Layout=arena View=sprite-cube art`. All six prop kinds visible. No missing-asset markers anywhere **except** the dock placeholder cube (intentional, documented).
2. **Player on grass island** — player sprite drawn through `_terrain_sprite_layer` (not a `MeshInstance3D`), shadow visible underneath, correct sort vs. terrain in both directions.
3. **Player walks grass → sand → dock** — no popping at seams.
4. **Player blocked by building footprint** — player stops at the footprint cell from at least two approach directions; log line confirms.
5. **Player walks behind a palm tree** — tree draws in front of player, player visible at edges.
6. **Sort key sanity during continuous movement** — sustained walk in a circle shows no z-fight or pop between cells (verifies continuous `world_pos` sort for actor).
7. **Player blocked at water/dock edge** — player presses past the last dock cell into water; stops cleanly, no jitter or slide.
8. **Prop footprints do not over-block** — neighbor cells adjacent to a building footprint remain walkable; player navigates around the building.
9. **No leftover 3D player visual** — confirm no active `_player_card` or `_player_shadow` `MeshInstance3D` remains in the scene tree. The player exists only as an `actor` item in the 2D draw list.

Per task, the verification ritual is:

```
1. implement
2. mcp__godot-ai__project_run
3. mcp__godot-ai__editor_screenshot source=game
4. compare to acceptance shot
5. mcp__godot-ai__project_manage op=stop  (write-side MCP rejects while playing)
6. mcp__godot-ai__logs_read  (warnings, prop-blocked transitions)
```

## Files Affected

**New:**
- `scripts/harbor_arena_layout.gd` — class `HarborArenaLayout`. Static `columns()`, `props()`, and `SPAWN_POINT`.
- `scripts/harbor_prop_shadow.gd` — projected-sprite-shadow helper. Math ported from `scripts/projected_sprite_shadow.gd`.

**Modified:**
- `scripts/harbor_3d_prototype.gd` — populate `_props` from `HarborArenaLayout` in arena mode; rename `_draw_terrain_sprite_cubes` to `_draw_world_sprites` and add prop/shadow/actor items to the sort; remove `_player_card` / `_player_shadow` 3D nodes; remove `_face_camera_horizontally`; drop the `DEFAULT_VALIDATION_CASE == 0` gate around `_update_player`; extend `_is_player_pos_walkable` with `_cell_blocked_by_prop`; add `_player_world_pos()` and `_height_at_player_pos()` helpers.

**Unchanged:**
- `scenes/harbor_3d_prototype.tscn` — no edit.
- `scenes/main.tscn` — no edit; still runs `harbor_game.gd`.
- `scripts/harbor_block_materials.gd` — no edit.
- `scripts/projected_sprite_shadow.gd` — original 2D-scene helper stays; the new file is a separate port.
- All other `scripts/harbor_*.gd` — untouched.

## Risks

- **Sort math at h=1 surfaces.** Props on a height-1 cell sort with `anchor_z = 1` → primary depth `cell.x + cell.y + 2`. A terrain block at `(cell, z=1)` has the same primary. The compound `LAYER_ORDER` (`terrain=0 < shadow=1 < prop=2`) makes draws strictly after the matching-depth terrain block, but cells at `(cell.x+1, cell.y, z=0)` have primary `cell.x + cell.y + 1` — which is **less** than the prop. That's correct (the +x neighbor's z=0 block is behind the prop). Verified by acceptance shot 5 (player behind palm) and shot 6 (continuous-movement sort sanity).
- **Player-pos sort using continuous floats vs. props using integer cells.** Within the same primary depth bucket, the LAYER_ORDER tiebreak keeps actor=prop=2; if both an actor and a prop land in the exact same depth bucket the draw order is undefined. Mitigation: give the player a small `sort_bias` (e.g. `+0.01`) when on a prop's anchor cell, or keep them apart by walking around props. In practice, footprint collision prevents the actor from standing on a building's anchor cell, and on the palm/bonfire/boat anchor cells the visual order is intentional (palm draws in front of an adjacent player → no overlap on the same cell unless the prop is `blocks=false`).
- **Footprint math mistakes.** A 2×2 building with the wrong offset list silently over-blocks. Mitigation: acceptance shot 8 explicitly walks around each multi-cell prop. The default footprint `[Vector2i.ZERO]` keeps single-cell props correct by default.
- **Dock placeholder cube cosmetics.** The `_draw_missing_cube_placeholder` is an intentionally-obvious flat-color cube. If the placeholder reads as a bug rather than a placeholder, replace it with a quick hand-drawn neutral wooden cube before the milestone closes. Tracked as the only acceptable missing-asset case in shot 1.
- **Bonfire art.** No bonfire PNG exists in `assets/` (the 2D scene builds bonfire visuals procedurally in `harbor_game.gd:_add_bonfire_nodes`). Implementation path: extend `harbor_prop_shadow.gd` (or a sibling) with a small `draw_bonfire(canvas, anchor)` that lays down a stone ring + log triangles + flame polygon using `draw_polygon` / `draw_circle`. This is ~30 lines of stylized 2D drawing, not an asset port. If procedural bonfire art proves too fiddly, fall back to dropping the bonfire and shipping six props instead of seven — flagged here so it's a known shortcut, not a surprise.
- **Player frame extraction.** `_player_frame_texture()` currently builds a region-rect off the spritesheet for the 3D quad. The 2D-layer path uses `draw_texture_rect_region`, so the same region math applies — no new spritesheet code. If the 3D pipeline did any frame caching that the new draw path doesn't share, expect a small per-frame allocation cost that's negligible for one player.

## Follow-ups (not in this milestone, worth tracking)

- Author `dock_cube.png`.
- Consider authoring `wall_cube.png` / `roof_cube.png` if a future milestone wants block-built buildings instead of billboard sprites.
- Swap `scenes/main.tscn` to point at `harbor_3d_prototype.tscn` when the arena is the new primary view.
- Add boat as a boardable vehicle.
- Camera follow / zoom for arenas larger than the viewport.
- Promote the arena's static data into an editor-inspectable resource if hand-authoring becomes painful.
