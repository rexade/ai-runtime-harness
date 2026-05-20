# Tidebound Harbor Godot — 3D Arena Milestone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `scenes/harbor_3d_prototype.tscn` into a small hand-authored harbor — terrain + 7 props + freely-walking player, all rendering through one unified 2D sprite layer.

**Architecture:** Lift arena content into `scripts/harbor_arena_layout.gd`. Add a small `scripts/harbor_prop_shadow.gd` helper for projected-sprite shadow math. Refactor `harbor_3d_prototype.gd` to render terrain + shadows + props + player into a single sorted draw list on the existing `_terrain_sprite_layer: Node2D`. Player visual moves out of `MeshInstance3D`; movement/collision stays as data on the script.

**Tech Stack:** Godot 4.6.1, GDScript, godot-ai MCP (verification via screenshots), McpTestSuite (unit tests for pure logic).

**Spec:** `docs/superpowers/specs/2026-05-20-tidebound-harbor-godot-3d-arena-design.md`

**Working directory:** `examples/tidebound-harbor-godot/` (everything below is relative to this dir unless noted).

---

## File Plan

**New files:**
- `scripts/harbor_arena_layout.gd` — `class_name HarborArenaLayout`. Static `columns()`, `props()`, `SPAWN_POINT`, and arena extents.
- `scripts/harbor_prop_shadow.gd` — projected-sprite shadow draw helper. One public static function plus the bonfire helper.
- `tests/test_harbor_arena_layout.gd` — McpTestSuite unit tests for layout data shape and shadow math.

**Modified file:**
- `scripts/harbor_3d_prototype.gd` — extract arena data, add prop pipeline, migrate player to 2D layer, layout-conditional update gate, footprint collision.

**Untouched:**
- `scenes/harbor_3d_prototype.tscn`, `scenes/main.tscn`, `scripts/harbor_block_materials.gd`, `scripts/projected_sprite_shadow.gd` (original 2D helper), and every other `scripts/harbor_*.gd`.

---

## Verification Conventions

Every visual task ends with the **MCP screenshot ritual**:

```
mcp__godot-ai__project_run
mcp__godot-ai__editor_screenshot source=game max_resolution=960
# inspect image
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Stop the game **before** any further write-side MCP edits (write-side rejects while `play_state=playing`). For pure-logic tasks, run unit tests via `mcp__godot-ai__test_run` instead.

For commits, the working directory is `examples/tidebound-harbor-godot/`. Run `git` from the repo root with relative paths.

---

## Phase 1 — Extract arena data (no behavior change)

### Task 1: Create `harbor_arena_layout.gd` with terrain columns + extents

**Files:**
- Create: `scripts/harbor_arena_layout.gd`

- [ ] **Step 1: Write the new layout class**

```gdscript
class_name HarborArenaLayout
extends RefCounted

## Hand-authored arena content for harbor_3d_prototype.gd's LAYOUT_ARENA mode.
## Coordinates: grid cells with +x east, +y south. Heights: 0=water, 1=walkable surface.

const SPAWN_POINT := Vector2(-2.0, 0.0)
const PLAYER_CLAMP_MIN := Vector2(-9.5, -9.5)
const PLAYER_CLAMP_MAX := Vector2(9.5, 9.5)


static func columns() -> Array[Dictionary]:
    var result: Array[Dictionary] = []
    for y in range(-10, 11):
        for x in range(-10, 11):
            var entry := _classify_cell(Vector2i(x, y))
            result.append({
                "cell": Vector2i(x, y),
                "kind": entry["kind"],
                "height": entry["height"],
                "debug_color": entry["debug_color"],
            })
    return result


static func props() -> Array[Dictionary]:
    return []  # filled in Task 5


static func _classify_cell(cell: Vector2i) -> Dictionary:
    var x := cell.x
    var y := cell.y
    # Stone outcrop on the northwest of the island.
    if x <= -5 and y <= -3 and x >= -7 and y >= -5:
        return {"kind": "stone", "height": 1, "debug_color": Color("#b3b6c1")}
    # Dock cells reaching east into the water.
    if y >= -1 and y <= 1 and x >= 4 and x <= 6:
        return {"kind": "dock", "height": 1, "debug_color": Color("#c8a473")}
    # Grass island core.
    if x >= -4 and x <= 3 and y >= -3 and y <= 3:
        return {"kind": "grass", "height": 1, "debug_color": Color("#8fe34f")}
    # Sand shore ring around the island.
    if x >= -5 and x <= 4 and y >= -4 and y <= 4:
        return {"kind": "sand", "height": 1, "debug_color": Color("#e7d39a")}
    # Open water everywhere else.
    return {"kind": "water", "height": 0, "debug_color": Color("#3a7da3")}
```

- [ ] **Step 2: Sanity-check by reading the file you just wrote**

Read the file. Verify:
- `class_name HarborArenaLayout` appears
- `columns()` returns 21*21 = 441 entries (verified visually by inspection — actual count check is Task 2's test)
- `props()` returns empty (filled later)

- [ ] **Step 3: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_arena_layout.gd
git commit -m "feat(tidebound-godot): add HarborArenaLayout with terrain columns"
```

---

### Task 2: Write a unit test for the layout data shape

**Files:**
- Create: `tests/test_harbor_arena_layout.gd`

- [ ] **Step 1: Write the failing test**

```gdscript
@tool
extends McpTestSuite

const HarborArenaLayoutScript := preload("res://scripts/harbor_arena_layout.gd")


func suite_name() -> String:
    return "harbor_arena_layout"


func test_columns_cover_full_21x21_grid() -> void:
    var cells := HarborArenaLayoutScript.columns()
    assert_eq(cells.size(), 441, "arena should be a 21x21 grid (-10..10 in both axes)")
    var seen := {}
    for c in cells:
        var key := "%d,%d" % [c["cell"].x, c["cell"].y]
        assert_false(seen.has(key), "duplicate cell %s" % key)
        seen[key] = true


func test_water_cells_have_height_zero() -> void:
    for c in HarborArenaLayoutScript.columns():
        if c["kind"] == "water":
            assert_eq(c["height"], 0, "water cell %s must be height 0" % c["cell"])


func test_walkable_kinds_are_height_one() -> void:
    var walkable := ["grass", "sand", "stone", "dock"]
    for c in HarborArenaLayoutScript.columns():
        if walkable.has(c["kind"]):
            assert_eq(c["height"], 1, "%s cell %s must be height 1" % [c["kind"], c["cell"]])


func test_dock_cells_present() -> void:
    var dock_count := 0
    for c in HarborArenaLayoutScript.columns():
        if c["kind"] == "dock":
            dock_count += 1
    assert_true(dock_count >= 3, "expected at least 3 dock cells, got %d" % dock_count)


func test_spawn_point_lands_on_grass() -> void:
    var spawn := HarborArenaLayoutScript.SPAWN_POINT
    var spawn_cell := Vector2i(roundi(spawn.x), roundi(spawn.y))
    var found := false
    for c in HarborArenaLayoutScript.columns():
        if c["cell"] == spawn_cell:
            assert_eq(c["kind"], "grass", "spawn cell must be grass, got %s" % c["kind"])
            found = true
            break
    assert_true(found, "spawn cell %s not present in columns" % spawn_cell)
```

- [ ] **Step 2: Run the tests via MCP**

```
mcp__godot-ai__test_run filter="harbor_arena_layout"
```

Expected: all five tests PASS (we wrote the file in Task 1; this is a verification test, not red→green).

- [ ] **Step 3: Commit**

```
git add examples/tidebound-harbor-godot/tests/test_harbor_arena_layout.gd
git commit -m "test(tidebound-godot): cover HarborArenaLayout data shape"
```

---

### Task 3: Wire `harbor_3d_prototype.gd` to read from HarborArenaLayout in arena mode

**Files:**
- Modify: `scripts/harbor_3d_prototype.gd` — top of file (preload), `_make_validation_layout_columns()`, `_player_pos` clamps in `_update_player`

- [ ] **Step 1: Preload the new layout script**

Find this line near the top of `harbor_3d_prototype.gd`:

```gdscript
const HarborBlockMaterialsScript := preload("res://scripts/harbor_block_materials.gd")
```

Add directly after it:

```gdscript
const HarborArenaLayoutScript := preload("res://scripts/harbor_arena_layout.gd")
```

- [ ] **Step 2: Replace the inline arena layout with the new source**

Find `_make_validation_layout_columns()` (around line 596). Replace its arena branch — the function currently returns the validation case columns when `_layout_mode == LAYOUT_SPRITE_VALIDATION` and otherwise builds the arena inline. Change the arena branch to call into HarborArenaLayout:

```gdscript
func _make_validation_layout_columns() -> Array[Dictionary]:
    if _layout_mode == LAYOUT_SPRITE_VALIDATION:
        return _make_sprite_validation_layout_columns()
    return HarborArenaLayoutScript.columns()
```

Delete the old in-function arena construction (the `for y in range(-4, 5): ...` loop through `_set_column_height(...)` calls at the end). It's been moved into `harbor_arena_layout.gd`.

- [ ] **Step 3: Expand player position clamps to match the new arena extents**

Find `_update_player` (around line 438). Replace the two clamp lines:

```gdscript
target_pos.x = clampf(target_pos.x, -7.5, 7.5)
target_pos.y = clampf(target_pos.y, -5.5, 4.5)
```

With:

```gdscript
target_pos.x = clampf(target_pos.x, HarborArenaLayoutScript.PLAYER_CLAMP_MIN.x, HarborArenaLayoutScript.PLAYER_CLAMP_MAX.x)
target_pos.y = clampf(target_pos.y, HarborArenaLayoutScript.PLAYER_CLAMP_MIN.y, HarborArenaLayoutScript.PLAYER_CLAMP_MAX.y)
```

- [ ] **Step 4: Run and screenshot**

```
mcp__godot-ai__project_run
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected: HUD reads `Layout=validation` because `_layout_mode` defaults to `LAYOUT_ARENA` (sic — the existing constant `LAYOUT_ARENA := "arena"` corresponds to the arena layout, and `LAYOUT_SPRITE_VALIDATION := "sprite validation"` is the validation grid we screenshotted earlier). To verify the *arena* layout, press F3 (the existing toggle) before screenshotting, or temporarily change `var _layout_mode := LAYOUT_SPRITE_VALIDATION` to `:= LAYOUT_ARENA` and re-run.

If the arena shows a larger grass island, sand ring, stone NW corner, and a dock peninsula east, with water around the edges, this is correct. No props yet.

Verify logs are clean (no errors about missing columns or null refs).

- [ ] **Step 5: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_3d_prototype.gd
git commit -m "refactor(tidebound-godot): source arena columns from HarborArenaLayout"
```

---

## Phase 2 — Prop shadow helper

### Task 4: Create `harbor_prop_shadow.gd` and unit-test the shadow math

**Files:**
- Create: `scripts/harbor_prop_shadow.gd`
- Modify: `tests/test_harbor_arena_layout.gd` (add shadow-math tests)

- [ ] **Step 1: Write the shadow helper**

```gdscript
class_name HarborPropShadow
extends RefCounted

## Projected-sprite shadow draw helper. Ported from
## scripts/projected_sprite_shadow.gd (2D scene) but draws into an
## arbitrary CanvasItem without a child Sprite2D node.

const X_AXIS_TILT_DEGREES := 45.0
const SHADOW_OPACITY_SCALE := 0.52
const DEFAULT_CAST_DIR := Vector2(1.0, 0.32)
const SHADOW_TINT := Color(0.08, 0.12, 0.12, 1.0)


## Draw a projected, tilted shadow of `texture` onto `canvas` at `anchor`.
## `cast_dir` is screen-space; defaults to DEFAULT_CAST_DIR if zero-length.
## `cast_distance` is pixels of offset along cast_dir.
## `display_scale` multiplies the texture size (use SPRITE_ART_DISPLAY_ZOOM).
## `opacity` is pre-multiplier on SHADOW_OPACITY_SCALE.
static func draw_shadow(
    canvas: CanvasItem,
    texture: Texture2D,
    anchor: Vector2,
    visual_root_offset: Vector2,
    display_scale: float,
    cast_dir: Vector2,
    cast_distance: float,
    opacity: float
) -> void:
    if texture == null:
        return
    var effective_dir := cast_dir
    if effective_dir.length_squared() <= 0.0001:
        effective_dir = DEFAULT_CAST_DIR
    effective_dir = effective_dir.normalized()
    var projected_y_scale := cos(deg_to_rad(X_AXIS_TILT_DEGREES))
    var rotation_angle := (-effective_dir).angle() - Vector2.DOWN.angle()
    var projected_root_offset := Vector2(
        visual_root_offset.x * 1.08,
        visual_root_offset.y * projected_y_scale
    ).rotated(rotation_angle)
    var center := anchor - projected_root_offset + effective_dir * cast_distance
    var card_size := texture.get_size() * display_scale
    var draw_size := Vector2(card_size.x * 1.08, maxf(card_size.y * projected_y_scale, 0.04))
    var modulate_color := Color(SHADOW_TINT.r, SHADOW_TINT.g, SHADOW_TINT.b, clampf(opacity * SHADOW_OPACITY_SCALE, 0.0, 1.0))
    var transform := Transform2D(rotation_angle, Vector2.ONE, 0.0, center - draw_size * 0.5)
    canvas.draw_set_transform_matrix(transform)
    canvas.draw_texture_rect(texture, Rect2(Vector2.ZERO, draw_size), false, modulate_color)
    canvas.draw_set_transform_matrix(Transform2D.IDENTITY)


## Compute the projected anchor offset for a horizontal cast direction.
## Used by tests and by callers that need to know the rotated center.
static func projected_center(
    anchor: Vector2,
    visual_root_offset: Vector2,
    cast_dir: Vector2,
    cast_distance: float
) -> Vector2:
    var effective_dir := cast_dir
    if effective_dir.length_squared() <= 0.0001:
        effective_dir = DEFAULT_CAST_DIR
    effective_dir = effective_dir.normalized()
    var projected_y_scale := cos(deg_to_rad(X_AXIS_TILT_DEGREES))
    var rotation_angle := (-effective_dir).angle() - Vector2.DOWN.angle()
    var projected_root_offset := Vector2(
        visual_root_offset.x * 1.08,
        visual_root_offset.y * projected_y_scale
    ).rotated(rotation_angle)
    return anchor - projected_root_offset + effective_dir * cast_distance
```

- [ ] **Step 2: Add shadow-math tests to `test_harbor_arena_layout.gd`**

Append these three tests to `tests/test_harbor_arena_layout.gd` (also add the preload near the top):

Near the top, add:

```gdscript
const HarborPropShadowScript := preload("res://scripts/harbor_prop_shadow.gd")
```

Append after the existing tests:

```gdscript
func test_shadow_zero_cast_dir_falls_back_to_default() -> void:
    var anchor := Vector2(100.0, 100.0)
    var with_zero := HarborPropShadowScript.projected_center(anchor, Vector2.ZERO, Vector2.ZERO, 10.0)
    var with_default := HarborPropShadowScript.projected_center(anchor, Vector2.ZERO, HarborPropShadowScript.DEFAULT_CAST_DIR, 10.0)
    assert_eq(with_zero, with_default, "zero cast_dir must fall back to DEFAULT_CAST_DIR")


func test_shadow_cast_distance_displaces_center() -> void:
    var anchor := Vector2(0.0, 0.0)
    var dir := Vector2(1.0, 0.0)
    var center := HarborPropShadowScript.projected_center(anchor, Vector2.ZERO, dir, 5.0)
    assert_true(center.x > 0.0, "horizontal cast should push center east, got %s" % center)
    assert_true(absf(center.y) < 0.01, "horizontal cast should not displace center vertically, got y=%f" % center.y)


func test_shadow_root_offset_flattens_on_y() -> void:
    # An upward visual_root_offset should be flattened by cos(45deg) in the
    # projected center, since the shadow lies on the ground.
    var anchor := Vector2(0.0, 0.0)
    var offset_up := Vector2(0.0, -20.0)
    var center := HarborPropShadowScript.projected_center(anchor, offset_up, HarborPropShadowScript.DEFAULT_CAST_DIR, 0.0)
    # The y component of the projected offset is offset.y * cos(45deg) ≈ -14.14,
    # then rotated by the default cast angle. Verify the absolute magnitude is
    # smaller than the unflattened offset.
    assert_true(center.length() < offset_up.length(), "projected root offset should flatten the y component, got %s" % center)
```

- [ ] **Step 3: Run the tests**

```
mcp__godot-ai__test_run filter="harbor_arena_layout"
```

Expected: all eight tests PASS (five from Task 2 + three new).

- [ ] **Step 4: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_prop_shadow.gd \
        examples/tidebound-harbor-godot/tests/test_harbor_arena_layout.gd
git commit -m "feat(tidebound-godot): HarborPropShadow projected-shadow helper"
```

---

## Phase 3 — Props data + unified render pipeline

### Task 5: Add `props()` data to HarborArenaLayout

**Files:**
- Modify: `scripts/harbor_arena_layout.gd` — replace the empty `props()` body
- Modify: `tests/test_harbor_arena_layout.gd` — add prop-data tests

- [ ] **Step 1: Replace `props()` with the seven entries**

In `scripts/harbor_arena_layout.gd`, replace the existing `props()` body with:

```gdscript
static func props() -> Array[Dictionary]:
    return [
        # 1. Boat sailing at the dock head.
        {
            "kind": "boat",
            "cell": Vector2i(6, 0),
            "footprint": [Vector2i.ZERO],
            "height_world": 1.2,
            "anchor_offset": Vector2(0.0, 0.0),
            "sort_bias": 0.05,
            "asset": "res://assets/boat-sail-a.png",
            "shadow": true,
            "blocks": true,
        },
        # 2. Buoy floating just past the dock.
        {
            "kind": "buoy",
            "cell": Vector2i(8, -1),
            "footprint": [Vector2i.ZERO],
            "height_world": 0.9,
            "anchor_offset": Vector2.ZERO,
            "sort_bias": 0.0,
            "asset": "res://assets/buoy-flag.png",
            "shadow": true,
            "blocks": false,
        },
        # 3. Lookout Tower on the south sand ridge.
        {
            "kind": "building_lookout",
            "cell": Vector2i(-1, 2),
            "footprint": [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)],
            "height_world": 3.4,
            "anchor_offset": Vector2.ZERO,
            "sort_bias": 0.1,
            "asset": "res://assets/stranded-buildings/Lookout Tower.png",
            "shadow": true,
            "blocks": true,
        },
        # 4. Shed on the north grass.
        {
            "kind": "building_shed",
            "cell": Vector2i(1, -2),
            "footprint": [Vector2i(0, 0), Vector2i(1, 0)],
            "height_world": 1.6,
            "anchor_offset": Vector2.ZERO,
            "sort_bias": 0.05,
            "asset": "res://assets/stranded-buildings/Shed.png",
            "shadow": true,
            "blocks": true,
        },
        # 5. Tall palm tree at the SW corner of the grass.
        {
            "kind": "palm_tree_tall",
            "cell": Vector2i(-3, 3),
            "footprint": [Vector2i.ZERO],
            "height_world": 2.6,
            "anchor_offset": Vector2.ZERO,
            "sort_bias": 0.05,
            "asset": "res://assets/tree-palm-tall.png",
            "shadow": true,
            "blocks": true,
        },
        # 6. Short palm tree near the dock approach.
        {
            "kind": "palm_tree_short",
            "cell": Vector2i(3, 1),
            "footprint": [Vector2i.ZERO],
            "height_world": 1.9,
            "anchor_offset": Vector2.ZERO,
            "sort_bias": 0.05,
            "asset": "res://assets/tree-palm-short.png",
            "shadow": true,
            "blocks": true,
        },
        # 7. Bonfire on the central clearing. No PNG -- drawn procedurally.
        {
            "kind": "bonfire",
            "cell": Vector2i(-2, 0),
            "footprint": [Vector2i.ZERO],
            "height_world": 0.6,
            "anchor_offset": Vector2.ZERO,
            "sort_bias": 0.05,
            "asset": "",
            "shadow": true,
            "blocks": true,
        },
    ]
```

- [ ] **Step 2: Add a test ensuring buoy is non-blocking**

Append to `tests/test_harbor_arena_layout.gd`:

```gdscript
func test_props_buoy_is_non_blocking() -> void:
    var found_buoy := false
    for p in HarborArenaLayoutScript.props():
        if p["kind"] == "buoy":
            assert_false(bool(p.get("blocks", true)), "buoy must be blocks=false (lives in water)")
            found_buoy = true
    assert_true(found_buoy, "buoy prop missing from props()")


func test_props_all_other_props_block() -> void:
    for p in HarborArenaLayoutScript.props():
        if p["kind"] == "buoy":
            continue
        assert_true(bool(p.get("blocks", true)), "%s must block, got blocks=%s" % [p["kind"], p.get("blocks", true)])


func test_props_assets_resolve() -> void:
    for p in HarborArenaLayoutScript.props():
        var asset_path: String = p["asset"]
        if asset_path == "":
            assert_eq(p["kind"], "bonfire", "only bonfire may have an empty asset path")
            continue
        assert_true(ResourceLoader.exists(asset_path), "asset %s missing for prop %s" % [asset_path, p["kind"]])
```

- [ ] **Step 3: Run the tests**

```
mcp__godot-ai__test_run filter="harbor_arena_layout"
```

Expected: 11 tests pass. If any asset path fails, fix the path in `props()` before continuing.

- [ ] **Step 4: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_arena_layout.gd \
        examples/tidebound-harbor-godot/tests/test_harbor_arena_layout.gd
git commit -m "feat(tidebound-godot): seven props in HarborArenaLayout"
```

---

### Task 6: Replace `_shed_props` with `_props` (data + collision wired together)

**Files:**
- Modify: `scripts/harbor_3d_prototype.gd` — replace `_shed_props` with `_props`, replace the 3D-shed builder, replace the prop-collision loop, add texture cache helper

This task bundles the data-shape change with the collision rewrite because the two are coupled: the new prop shape uses `Array[Vector2i]` offsets, the old `_shed_props` used a `Vector2i` size centered on the anchor. They cannot coexist mid-task without a silent bug.

- [ ] **Step 1: Add the new member variables and remove the old**

Near the top of the class (around line 41), delete:

```gdscript
var _shed_props: Array[Dictionary] = []
```

Add in its place:

```gdscript
var _props: Array[Dictionary] = []
var _prop_texture_cache := {}
var _last_blocked_cell: Vector2i = Vector2i(99999, 99999)  # sentinel "no recent blocker"
```

- [ ] **Step 2: Populate `_props` in `_ready`**

Find the existing `_shed_props = [...]` initializer in `_ready` (around line 76). Replace it with:

```gdscript
_props = HarborArenaLayoutScript.props()
```

Place this line after `_columns = _make_validation_layout_columns()` and before `_index_columns()`.

- [ ] **Step 3: Remove `_build_sheds` and its call**

Find `_build_sheds()` (around line 300) and delete the entire function. Find its call site in `_build_3d_scene` (around line 107) and delete the line:

```gdscript
_build_sheds()
```

(The 2D sprite layer will render the shed as a billboard prop in Task 8.)

- [ ] **Step 4: Add prop texture cache helper**

Add this function near the end of the script (after `_apply_visual_view_mode`):

```gdscript
func _prop_texture(prop: Dictionary) -> Texture2D:
    var asset: String = prop.get("asset", "")
    if asset == "":
        return null
    if _prop_texture_cache.has(asset):
        return _prop_texture_cache[asset]
    var tex: Texture2D = load(asset)
    _prop_texture_cache[asset] = tex
    return tex
```

- [ ] **Step 5: Add `_cell_blocked_by_prop` helper**

Add this function near `_is_player_cell_walkable` (around line 524):

```gdscript
func _cell_blocked_by_prop(cell: Vector2i) -> Dictionary:
    for p in _props:
        if not bool(p.get("blocks", true)):
            continue
        var anchor: Vector2i = p["cell"]
        var footprint: Array = p.get("footprint", [Vector2i.ZERO])
        for offset in footprint:
            if anchor + offset == cell:
                return p
    return {}
```

- [ ] **Step 6: Rewrite `_is_player_cell_walkable` to use the new helper**

Replace `_is_player_cell_walkable` (around line 524) entirely:

```gdscript
func _is_player_cell_walkable(cell: Vector2i, surface_height: int) -> bool:
    var cell_height := _height_at_cell(cell)
    if cell_height <= 0:
        return false
    if absi(cell_height - surface_height) > PLAYER_MAX_STEP_HEIGHT:
        return false
    var blocker := _cell_blocked_by_prop(cell)
    if not blocker.is_empty():
        if cell != _last_blocked_cell:
            _last_blocked_cell = cell
            print_debug("player_blocked_by_prop cell=%s kind=%s" % [cell, blocker.get("kind", "?")])
        return false
    return true
```

- [ ] **Step 7: Reset `_last_blocked_cell` on successful move**

Find `_move_player_with_slide` (around line 462). At the top of the function, after the `_is_player_pos_walkable(target_pos)` check that assigns `_player_pos = target_pos`, add the reset line:

```gdscript
func _move_player_with_slide(target_pos: Vector2) -> void:
    if _is_player_pos_walkable(target_pos):
        _player_pos = target_pos
        _last_blocked_cell = Vector2i(99999, 99999)
        return
    ...  # rest of the function unchanged
```

- [ ] **Step 8: Run and screenshot**

```
mcp__godot-ai__project_run
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected: arena still renders as in Task 3. The old 3D shed `MeshInstance3D` is gone (look for its absence in `scene_get_hierarchy` if uncertain). No props draw yet — that's Task 8. Logs clean (no errors about `_shed_props` or missing keys).

- [ ] **Step 9: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_3d_prototype.gd
git commit -m "refactor(tidebound-godot): _props with footprint-offset collision"
```

---

### Task 7: Refactor `_draw_terrain_sprite_cubes` into `_draw_world_sprites` with a unified item list

**Files:**
- Modify: `scripts/harbor_3d_prototype.gd` — `_draw_terrain_sprite_cubes`, `_build_terrain`

This task only changes the **shape** of the draw code (a unified item list with `layer` tags). It still only draws terrain. Props/shadows/actor come in Tasks 8, 9, 11.

- [ ] **Step 1: Add the layer-order constant**

At the top of the script with the other consts, add:

```gdscript
const LAYER_ORDER := {"terrain": 0, "shadow": 1, "prop": 2, "actor": 2}
```

- [ ] **Step 2: Rename and rewrite the draw function**

Replace `_draw_terrain_sprite_cubes` (around line 210) with:

```gdscript
func _draw_world_sprites() -> void:
    if not _camera:
        return
    var items: Array[Dictionary] = []
    _collect_terrain_items(items)
    items.sort_custom(_world_sprite_sort)
    for item in items:
        _draw_world_sprite_item(item)


func _collect_terrain_items(items: Array[Dictionary]) -> void:
    for column in _columns:
        var cell: Vector2i = column["cell"]
        var height := int(column["height"])
        var kind := String(column.get("kind", "grass"))
        if _block_materials.is_water_kind(kind):
            items.append({"layer": "terrain", "cell": cell, "kind": kind, "z": 0, "sort_bias": 0.0})
        elif height > 0:
            for z in range(height):
                items.append({"layer": "terrain", "cell": cell, "kind": kind, "z": z, "sort_bias": 0.0})


func _world_sprite_sort(a: Dictionary, b: Dictionary) -> bool:
    var ap := _sort_primary(a)
    var bp := _sort_primary(b)
    if not is_equal_approx(ap, bp):
        return ap < bp
    var al := int(LAYER_ORDER.get(a["layer"], 0))
    var bl := int(LAYER_ORDER.get(b["layer"], 0))
    if al != bl:
        return al < bl
    return float(a.get("sort_bias", 0.0)) < float(b.get("sort_bias", 0.0))


func _sort_primary(item: Dictionary) -> float:
    match item["layer"]:
        "terrain":
            var cell: Vector2i = item["cell"]
            return float(cell.x + cell.y) + float(item["z"]) * 2.0
        "shadow", "prop":
            var cell2: Vector2i = item["cell"]
            return float(cell2.x + cell2.y) + float(item["anchor_z"]) * 2.0
        "actor":
            var wp: Vector3 = item["world_pos"]
            return wp.x + wp.z + wp.y * 2.0
        _:
            return 0.0


func _draw_world_sprite_item(item: Dictionary) -> void:
    match item["layer"]:
        "terrain":
            _draw_terrain_item(item)
        # "shadow", "prop", "actor" added in later tasks
        _:
            pass


func _draw_terrain_item(item: Dictionary) -> void:
    var cell: Vector2i = item["cell"]
    var kind := String(item["kind"])
    var z := int(item["z"])
    var texture := _block_materials.cube_sprite_texture(kind)
    var anchor := _sprite_art_screen_position(grid_to_world(float(cell.x), float(cell.y), float(z)))
    if texture:
        var size := texture.get_size() * SPRITE_ART_DISPLAY_ZOOM
        var top_left := anchor - Vector2(float(texture.get_width()) * 0.5, float(texture.get_height()) - 1.0) * SPRITE_ART_DISPLAY_ZOOM
        _terrain_sprite_layer.draw_texture_rect(texture, Rect2(top_left, size), false)
        if _sprite_debug_overlay_enabled:
            _draw_sprite_debug_overlay(cell, kind, z, anchor, top_left, size)
    else:
        _draw_missing_cube_placeholder(anchor, kind)
        if _sprite_debug_overlay_enabled:
            _draw_sprite_debug_overlay(cell, kind, z, anchor, anchor - Vector2(17.5, 32.0) * SPRITE_ART_DISPLAY_ZOOM, Vector2(35.0, 33.0) * SPRITE_ART_DISPLAY_ZOOM)
```

- [ ] **Step 3: Rewire `_build_terrain` to connect the new draw function**

Find `_build_terrain` (around line 173). Change this line:

```gdscript
_terrain_sprite_layer.draw.connect(_draw_terrain_sprite_cubes)
```

To:

```gdscript
_terrain_sprite_layer.draw.connect(_draw_world_sprites)
```

- [ ] **Step 4: Update `_process` if it references the old name**

Search for `_draw_terrain_sprite_cubes` and replace any remaining references with `_draw_world_sprites`.

- [ ] **Step 5: Run and screenshot**

```
mcp__godot-ai__project_run
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected: arena renders identically to Task 3. The sort key change (now `float`, was `int`) and the layer-tag refactor should be invisible. Logs clean.

- [ ] **Step 6: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_3d_prototype.gd
git commit -m "refactor(tidebound-godot): unified sort/draw list for world sprites"
```

---

### Task 8: Add prop rendering (the `prop` layer)

**Files:**
- Modify: `scripts/harbor_3d_prototype.gd` — extend `_collect_terrain_items`-equivalent with prop collection, add `_draw_prop_item`, retire `_build_sheds`

- [ ] **Step 1: Rename the collect function and add prop collection**

Rename `_collect_terrain_items` to `_collect_world_sprite_items` and add prop collection inside it:

```gdscript
func _collect_world_sprite_items(items: Array[Dictionary]) -> void:
    for column in _columns:
        var cell: Vector2i = column["cell"]
        var height := int(column["height"])
        var kind := String(column.get("kind", "grass"))
        if _block_materials.is_water_kind(kind):
            items.append({"layer": "terrain", "cell": cell, "kind": kind, "z": 0, "sort_bias": 0.0})
        elif height > 0:
            for z in range(height):
                items.append({"layer": "terrain", "cell": cell, "kind": kind, "z": z, "sort_bias": 0.0})
    for prop in _props:
        var prop_cell: Vector2i = prop["cell"]
        var anchor_z := _height_at_cell(prop_cell)
        items.append({
            "layer": "prop",
            "cell": prop_cell,
            "anchor_z": anchor_z,
            "sort_bias": float(prop.get("sort_bias", 0.0)),
            "prop": prop,
        })
```

Update `_draw_world_sprites` to call the new name:

```gdscript
func _draw_world_sprites() -> void:
    if not _camera:
        return
    var items: Array[Dictionary] = []
    _collect_world_sprite_items(items)
    items.sort_custom(_world_sprite_sort)
    for item in items:
        _draw_world_sprite_item(item)
```

- [ ] **Step 2: Add `_draw_prop_item` and the bonfire helper**

Add to `_draw_world_sprite_item`'s match block — replace the `pass` after `"shadow", "prop", "actor"` with explicit cases:

```gdscript
func _draw_world_sprite_item(item: Dictionary) -> void:
    match item["layer"]:
        "terrain":
            _draw_terrain_item(item)
        "prop":
            _draw_prop_item(item)
        _:
            pass
```

Add the prop draw function below `_draw_terrain_item`:

```gdscript
func _draw_prop_item(item: Dictionary) -> void:
    var prop: Dictionary = item["prop"]
    var cell: Vector2i = item["cell"]
    var anchor_z: int = item["anchor_z"]
    var anchor := _sprite_art_screen_position(grid_to_world(float(cell.x), float(cell.y), float(anchor_z)))
    var anchor_offset: Vector2 = prop.get("anchor_offset", Vector2.ZERO)
    anchor += anchor_offset * SPRITE_ART_DISPLAY_ZOOM
    if String(prop["kind"]) == "bonfire":
        _draw_bonfire_at(anchor)
        return
    var texture := _prop_texture(prop)
    if texture == null:
        _draw_missing_cube_placeholder(anchor, String(prop["kind"]))
        return
    var tex_size := texture.get_size() * SPRITE_ART_DISPLAY_ZOOM
    var top_left := anchor - Vector2(tex_size.x * 0.5, tex_size.y - 1.0)
    _terrain_sprite_layer.draw_texture_rect(texture, Rect2(top_left, tex_size), false)


func _draw_bonfire_at(anchor: Vector2) -> void:
    var s := SPRITE_ART_DISPLAY_ZOOM
    # Stone ring (low, flattened ellipse).
    var ring_color := Color("#6e6358")
    _terrain_sprite_layer.draw_circle(anchor, 9.0 * s, ring_color)
    _terrain_sprite_layer.draw_circle(anchor + Vector2(0.0, -1.0 * s), 7.0 * s, Color("#3b342c"))
    # Log triangles (two crossed).
    var log_color := Color("#5a3a22")
    _terrain_sprite_layer.draw_polygon(
        PackedVector2Array([
            anchor + Vector2(-6.0, -2.0) * s,
            anchor + Vector2(6.0, -4.0) * s,
            anchor + Vector2(-5.0, -1.0) * s,
        ]),
        PackedColorArray([log_color, log_color, log_color])
    )
    _terrain_sprite_layer.draw_polygon(
        PackedVector2Array([
            anchor + Vector2(6.0, -2.0) * s,
            anchor + Vector2(-6.0, -4.0) * s,
            anchor + Vector2(5.0, -1.0) * s,
        ]),
        PackedColorArray([log_color, log_color, log_color])
    )
    # Flame polygon (orange outer + yellow inner core).
    var flame_outer := Color("#e96a2c")
    var flame_inner := Color("#ffd24a")
    _terrain_sprite_layer.draw_colored_polygon(
        PackedVector2Array([
            anchor + Vector2(0.0, -16.0) * s,
            anchor + Vector2(5.0, -8.0) * s,
            anchor + Vector2(2.0, -3.0) * s,
            anchor + Vector2(-2.0, -3.0) * s,
            anchor + Vector2(-5.0, -8.0) * s,
        ]),
        flame_outer
    )
    _terrain_sprite_layer.draw_colored_polygon(
        PackedVector2Array([
            anchor + Vector2(0.0, -11.0) * s,
            anchor + Vector2(2.0, -7.0) * s,
            anchor + Vector2(0.0, -4.0) * s,
            anchor + Vector2(-2.0, -7.0) * s,
        ]),
        flame_inner
    )
```

- [ ] **Step 3: Retire `_build_sheds`**

Find `_build_sheds` (around line 300) and remove the entire function. Remove the `_build_sheds()` call from `_build_3d_scene` (around line 107). The props are now drawn by `_draw_world_sprites`, not by 3D MeshInstance3D nodes.

- [ ] **Step 4: Run and screenshot**

```
mcp__godot-ai__project_run
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected: arena renders with **all six PNG props visible** (boat, buoy, lookout tower, shed, two palms) plus a procedurally-drawn **bonfire**. No shadows yet. No player migration yet — the 3D MeshInstance3D player card still exists.

If any prop appears mis-sorted (e.g. building draws behind the dock cube it's on), check the `anchor_z` lookup and `_height_at_cell`. Buildings on grass should have `anchor_z = 1`.

- [ ] **Step 5: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_3d_prototype.gd
git commit -m "feat(tidebound-godot): render props in unified 2D sprite layer"
```

---

### Task 9: Add prop shadow rendering (the `shadow` layer)

**Files:**
- Modify: `scripts/harbor_3d_prototype.gd` — add shadow item emission + draw

- [ ] **Step 1: Preload HarborPropShadow**

Near the top of the script with the other preloads, add:

```gdscript
const HarborPropShadowScript := preload("res://scripts/harbor_prop_shadow.gd")
```

- [ ] **Step 2: Emit a shadow item per prop in `_collect_world_sprite_items`**

Update the props loop in `_collect_world_sprite_items` to emit two items per prop when `shadow` is true:

```gdscript
    for prop in _props:
        var prop_cell: Vector2i = prop["cell"]
        var anchor_z := _height_at_cell(prop_cell)
        if bool(prop.get("shadow", true)):
            items.append({
                "layer": "shadow",
                "cell": prop_cell,
                "anchor_z": anchor_z,
                "sort_bias": float(prop.get("sort_bias", 0.0)),
                "prop": prop,
            })
        items.append({
            "layer": "prop",
            "cell": prop_cell,
            "anchor_z": anchor_z,
            "sort_bias": float(prop.get("sort_bias", 0.0)),
            "prop": prop,
        })
```

- [ ] **Step 3: Add shadow rendering to the item dispatch**

Extend `_draw_world_sprite_item`:

```gdscript
func _draw_world_sprite_item(item: Dictionary) -> void:
    match item["layer"]:
        "terrain":
            _draw_terrain_item(item)
        "shadow":
            _draw_shadow_item(item)
        "prop":
            _draw_prop_item(item)
        _:
            pass
```

Add the shadow draw function:

```gdscript
func _draw_shadow_item(item: Dictionary) -> void:
    var prop: Dictionary = item["prop"]
    var cell: Vector2i = item["cell"]
    var anchor_z: int = item["anchor_z"]
    var anchor := _sprite_art_screen_position(grid_to_world(float(cell.x), float(cell.y), float(anchor_z)))
    var anchor_offset: Vector2 = prop.get("anchor_offset", Vector2.ZERO)
    anchor += anchor_offset * SPRITE_ART_DISPLAY_ZOOM
    if String(prop["kind"]) == "bonfire":
        # Bonfire is drawn procedurally with its own light/ground bias; skip projected shadow.
        return
    var texture := _prop_texture(prop)
    if texture == null:
        return
    HarborPropShadowScript.draw_shadow(
        _terrain_sprite_layer,
        texture,
        anchor,
        Vector2.ZERO,
        SPRITE_ART_DISPLAY_ZOOM,
        HarborPropShadowScript.DEFAULT_CAST_DIR,
        4.0,
        1.0
    )
```

- [ ] **Step 4: Run and screenshot**

```
mcp__godot-ai__project_run
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected: each PNG prop now has a flattened, tilted shadow lying on the ground below/behind it. The buoy may have an awkward water-shadow (cosmetic; tracked as a follow-up). The bonfire still draws without a projected shadow (intentional).

- [ ] **Step 5: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_3d_prototype.gd
git commit -m "feat(tidebound-godot): projected shadows for props in unified layer"
```

---

## Phase 4 — Player migration into the 2D layer

### Task 10: Add `_player_world_pos()` and `_height_at_player_pos()` helpers

**Files:**
- Modify: `scripts/harbor_3d_prototype.gd` — two new helpers, replace inline `grid_to_world(_player_pos.x, ..., 0.0)` calls

- [ ] **Step 1: Add the two helpers**

Add near `grid_to_world` (around line 536):

```gdscript
func _height_at_player_pos(pos: Vector2) -> float:
    return float(_height_at_cell(_cell_at_pos(pos)))


func _player_world_pos() -> Vector3:
    return grid_to_world(_player_pos.x, _player_pos.y, _height_at_player_pos(_player_pos))
```

- [ ] **Step 2: Replace any inline equivalent uses**

Search for `grid_to_world(_player_pos.x, _player_pos.y` in the file and replace each occurrence with `_player_world_pos()`. There should be one or two in `_update_player_nodes`.

- [ ] **Step 3: Run and screenshot**

```
mcp__godot-ai__project_run
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected: arena renders identically. The MeshInstance3D player card still moves correctly (since `_update_player_nodes` uses the new helper, which returns the same result).

- [ ] **Step 4: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_3d_prototype.gd
git commit -m "refactor(tidebound-godot): _player_world_pos as single conversion point"
```

---

### Task 11: Migrate player visual into the 2D draw list

**Files:**
- Modify: `scripts/harbor_3d_prototype.gd` — add actor item emission, add actor draw, remove `_player_card` and `_player_shadow`, remove `_build_player` body / `_face_camera_horizontally`

- [ ] **Step 1: Emit actor items in `_collect_world_sprite_items`**

Add after the props loop:

```gdscript
    items.append({
        "layer": "shadow",
        "actor": "player",
        "world_pos": _player_world_pos(),
        "sort_bias": -0.001,
    })
    items.append({
        "layer": "actor",
        "actor": "player",
        "world_pos": _player_world_pos(),
        "sort_bias": 0.0,
    })
```

The shadow sort_bias is `-0.001` so it draws under the player card within the same depth bucket.

- [ ] **Step 2: Extend `_sort_primary` so actor shadows use world_pos too**

Update `_sort_primary` to handle actor shadows separately. The current `shadow` branch uses `cell + anchor_z*2`; an actor shadow has no `cell` but has `world_pos`. Update:

```gdscript
func _sort_primary(item: Dictionary) -> float:
    match item["layer"]:
        "terrain":
            var cell: Vector2i = item["cell"]
            return float(cell.x + cell.y) + float(item["z"]) * 2.0
        "shadow":
            if item.has("world_pos"):
                var wp_s: Vector3 = item["world_pos"]
                return wp_s.x + wp_s.z + wp_s.y * 2.0
            var cell_s: Vector2i = item["cell"]
            return float(cell_s.x + cell_s.y) + float(item["anchor_z"]) * 2.0
        "prop":
            var cell2: Vector2i = item["cell"]
            return float(cell2.x + cell2.y) + float(item["anchor_z"]) * 2.0
        "actor":
            var wp: Vector3 = item["world_pos"]
            return wp.x + wp.z + wp.y * 2.0
        _:
            return 0.0
```

- [ ] **Step 3: Dispatch actor items**

Extend `_draw_world_sprite_item`:

```gdscript
func _draw_world_sprite_item(item: Dictionary) -> void:
    match item["layer"]:
        "terrain":
            _draw_terrain_item(item)
        "shadow":
            if item.has("actor"):
                _draw_actor_shadow_item(item)
            else:
                _draw_shadow_item(item)
        "prop":
            _draw_prop_item(item)
        "actor":
            _draw_actor_item(item)
        _:
            pass
```

Add the actor draw functions. The player frame texture comes from the existing `_player_frame_texture()` (region-rect off the spritesheet — keep it as-is):

```gdscript
func _draw_actor_item(item: Dictionary) -> void:
    if String(item["actor"]) != "player":
        return
    var wp: Vector3 = item["world_pos"]
    var anchor := _sprite_art_screen_position(wp)
    var tex := _player_frame_texture()
    if tex == null:
        return
    var tex_size := tex.get_size() * SPRITE_ART_DISPLAY_ZOOM
    var top_left := anchor - Vector2(tex_size.x * 0.5, tex_size.y - 1.0)
    var flip_h := _player_should_face_left()
    var draw_rect := Rect2(top_left, tex_size)
    if flip_h:
        draw_rect = Rect2(top_left + Vector2(tex_size.x, 0.0), Vector2(-tex_size.x, tex_size.y))
    _terrain_sprite_layer.draw_texture_rect(tex, draw_rect, false)


func _draw_actor_shadow_item(item: Dictionary) -> void:
    if String(item["actor"]) != "player":
        return
    var wp: Vector3 = item["world_pos"]
    var anchor := _sprite_art_screen_position(Vector3(wp.x, _height_at_player_pos(_player_pos), wp.z))
    var tex := _player_frame_texture()
    if tex == null:
        return
    HarborPropShadowScript.draw_shadow(
        _terrain_sprite_layer,
        tex,
        anchor,
        Vector2.ZERO,
        SPRITE_ART_DISPLAY_ZOOM,
        HarborPropShadowScript.DEFAULT_CAST_DIR,
        3.0,
        1.0
    )
```

- [ ] **Step 4: Remove the MeshInstance3D player card and 3D shadow**

Make these surgical removals in `harbor_3d_prototype.gd`:

1. **Member variables** (around line 48–49): delete these two lines:
   ```gdscript
   var _player_card: MeshInstance3D
   var _player_shadow: MeshInstance3D
   ```

2. **`_clear_children`** (around line 114): delete the assignments to `_player_card` and `_player_shadow`:
   ```gdscript
   _player_card = null
   _player_shadow = null
   ```

3. **`_build_player`** (around line 324): replace the entire function body with `pass`:
   ```gdscript
   func _build_player() -> void:
       pass
   ```
   (Don't remove the call site in `_build_3d_scene` — leaving an empty function is cleaner than threading a removal through.)

4. **`_update_player_nodes`** (around line 390): replace its body with `pass`:
   ```gdscript
   func _update_player_nodes() -> void:
       pass
   ```

5. **`_face_camera_horizontally`** (around line 399): delete the entire function.

6. **`_player_material`** (around line 764): delete the entire function. It built a `StandardMaterial3D` for the now-gone 3D card and has no other callers.

`_player_frame_texture()` (around line 776) is **already self-contained** — it caches the spritesheet frame and returns a `Texture2D`. Leave it untouched. It is now called from `_draw_actor_item` / `_draw_actor_shadow_item`.

- [ ] **Step 5: Run and screenshot**

```
mcp__godot-ai__project_run
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected: player is now a 2D sprite drawn into the unified layer, with a projected shadow. The MeshInstance3D card is gone. The player still doesn't move (Task 12 enables movement).

If the player appears at the wrong screen position or sorts behind terrain it should be in front of, inspect `_sort_primary` for the actor branch and `_sprite_art_screen_position` for player world_pos.

- [ ] **Step 6: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_3d_prototype.gd
git commit -m "feat(tidebound-godot): migrate player visual into unified 2D layer"
```

---

## Phase 5 — Movement + collision

### Task 12: Make player-update gate layout-conditional + set spawn

**Files:**
- Modify: `scripts/harbor_3d_prototype.gd` — `_process` gate, `_ready` spawn initialization

- [ ] **Step 1: Set spawn from arena layout in `_ready`**

In `_ready` (around line 73), after `_props = HarborArenaLayoutScript.props()`, add:

```gdscript
if _layout_mode == LAYOUT_ARENA:
    _player_pos = HarborArenaLayoutScript.SPAWN_POINT
```

- [ ] **Step 2: Make the `_update_player` call layout-conditional**

Find `_process` (around line 91). Replace:

```gdscript
if DEFAULT_VALIDATION_CASE == 0:
    _update_player(delta)
```

With:

```gdscript
if _layout_mode == LAYOUT_ARENA:
    _update_player(delta)
elif _layout_mode == LAYOUT_SPRITE_VALIDATION and _active_case == "free walk":
    _update_player(delta)
```

- [ ] **Step 3: Don't re-teleport on arena boot**

Find the line in `_ready` that calls `_apply_validation_case(DEFAULT_VALIDATION_CASE)` (around line 81). Guard it:

```gdscript
if _layout_mode == LAYOUT_SPRITE_VALIDATION:
    _apply_validation_case(DEFAULT_VALIDATION_CASE)
```

- [ ] **Step 4: Run and screenshot — verify free walk**

```
mcp__godot-ai__project_run
# Press W/A/S/D in the game window to verify the player walks.
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected: player spawns on the grass island at `SPAWN_POINT`. WASD walks the player. Sprite is drawn into the 2D layer; sort is continuous (no popping between cells); shadow follows.

- [ ] **Step 5: Commit**

```
git add examples/tidebound-harbor-godot/scripts/harbor_3d_prototype.gd
git commit -m "feat(tidebound-godot): free-walk player in arena layout"
```

---

### Task 13: Drive-test collision (no code changes)

This task is verification-only. Collision was wired in Task 6 Steps 5–7; this task confirms it behaves correctly in the running game with the now-active player movement (Task 12) and prop list (Task 5).

- [ ] **Step 1: Run and exercise every collision case**

```
mcp__godot-ai__project_run
```

In the game window, perform these walks (use `mcp__godot-ai__editor_screenshot source=game` between any two you want to record):

1. Walk into the Lookout Tower (2×2 footprint at anchor `(-1, 2)`) from the south, then from the east.
2. Walk into the Shed (2×1 footprint at anchor `(1, -2)`) from the west, then from the north.
3. Walk into the bonfire (single cell at `(-2, 0)`).
4. Walk into each palm tree (single cells at `(-3, 3)` and `(3, 1)`).
5. Walk into the boat (single cell at `(6, 0)` — sits on a dock cell).
6. Walk to the easternmost dock cell `(6, 1)` and press east — player must stop, not slide into water.
7. Walk close to the buoy by going as far east on the dock as possible — confirm the buoy is **not** logged as a blocker (it lives in water and is unwalkable for height reasons, not for prop reasons).

- [ ] **Step 2: Read logs**

```
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Expected log lines (one per approach direction per blocker; not per frame):

```
player_blocked_by_prop cell=(-1, 2) kind=building_lookout
player_blocked_by_prop cell=(0, 2) kind=building_lookout
player_blocked_by_prop cell=(1, -2) kind=building_shed
player_blocked_by_prop cell=(2, -2) kind=building_shed
player_blocked_by_prop cell=(-2, 0) kind=bonfire
player_blocked_by_prop cell=(-3, 3) kind=palm_tree_tall
player_blocked_by_prop cell=(3, 1) kind=palm_tree_short
player_blocked_by_prop cell=(6, 0) kind=boat
```

**No** `kind=buoy` lines should appear.

If any blocker fires on every frame instead of once per approach, the `_last_blocked_cell` reset in `_move_player_with_slide` (Task 6 Step 7) didn't land — re-check that.

- [ ] **Step 3: No commit (verification only).**

---

## Phase 6 — Acceptance pass

### Task 14: Run the 9 acceptance shots

**Files:** none modified. This task only verifies and documents.

The screenshot ritual for each shot:

```
mcp__godot-ai__project_run
# manipulate player as described per shot
mcp__godot-ai__editor_screenshot source=game max_resolution=960
mcp__godot-ai__logs_read
mcp__godot-ai__project_manage op=stop
```

Save each shot's metadata (HUD text, log lines) inline in this task. The image itself is the MCP screenshot output — it doesn't need to be saved to disk for this milestone.

- [ ] **Shot 1: Arena overview**

Boot the game. Confirm HUD reads `Layout=arena View=sprite-cube art`. All seven props visible (boat, buoy, lookout tower, shed, two palm trees, bonfire). The only missing-asset marker permitted is the dock placeholder cube.

- [ ] **Shot 2: Player on grass island**

Player visible at spawn, with shadow. Confirm via `mcp__godot-ai__scene_get_hierarchy` that no `MeshInstance3D` named `PlayerCard` or `PlayerShadow` exists in the scene tree. (This is acceptance criterion 9 verified here.)

- [ ] **Shot 3: Grass → sand → dock**

Walk east. Capture a frame mid-walk on the dock cells. No height popping at seams.

- [ ] **Shot 4: Blocked by Lookout Tower**

Walk into the tower from the south. Player stops. Log line confirms `player_blocked_by_prop cell=... kind=building_lookout`. Repeat from the east approach.

- [ ] **Shot 5: Player behind palm tree**

Walk to a position where the tall palm tree is screen-down-right of the player. Confirm the tree sprite draws **over** the player.

- [ ] **Shot 6: Continuous-movement sort sanity**

Walk a tight circle on the grass island for ~5 seconds. The sprite should not visibly pop between cells. Capture mid-walk.

- [ ] **Shot 7: Blocked at dock edge**

Walk to the easternmost dock cell. Press east (D). Player stops; no slide into water. Capture.

- [ ] **Shot 8: Around-building navigation**

Walk around the Lookout Tower clockwise. Player should pass through the cell directly east of the tower's footprint (one row south of where the tower blocks). Capture a frame mid-pass.

- [ ] **Shot 9: No leftover 3D player visual**

Run `mcp__godot-ai__scene_get_hierarchy depth=10` while the game is **not** playing (open scene in editor). Search the output for `MeshInstance3D`. The list should contain only `ProxyBlock_*` (terrain debug proxies, hidden in sprite-art view) and `OrthographicCamera3D`, `StylizedSun`, `SoftSkyFill`, `WorldEnvironment`, `TerrainSpriteCubes` (Node2D), `TerrainLogicalProxy` (Node3D), `DebugMarkers` (Node3D), `HUD` (Label). Crucially: **no** `PlayerCard` or `PlayerShadow`.

- [ ] **Final commit (no code change; tag the milestone)**

```
git -C examples/tidebound-harbor-godot status
# Confirm clean working tree.
git tag -a tidebound-godot-3d-arena-v0 -m "3D arena milestone: terrain + 7 props + free-walk player"
```

Tag is local-only by default; do not push without the user's nod.

---

## Self-review notes (for the implementer)

**Spec coverage check** (re-run before claiming done):
- Hand-authored terrain: Tasks 1–3. ✅
- 7 props with correct assets: Task 5. ✅
- Movement enabled in arena: Task 12. ✅
- Player out of MeshInstance3D into 2D layer: Task 11. ✅
- `harbor_prop_shadow.gd` helper: Task 4. ✅
- Building-footprint collision: Task 13. ✅
- Validation layout untouched: confirm Task 3 only adds an early-return for `LAYOUT_SPRITE_VALIDATION`; `_make_sprite_validation_layout_columns` is left alone.

**Known shortcuts (per spec):**
- Dock renders as the missing-asset placeholder cube. Real `dock_cube.png` is a follow-up.
- Bonfire is procedurally drawn (no PNG asset).
- If bonfire art proves too fiddly, the fallback per spec is to drop it and ship six props. Don't fall back unilaterally — discuss with user first.

**Likely gotchas:**
- `_face_camera_horizontally` removal (Task 11 Step 4): search for any remaining call sites before deleting — there should be exactly one (inside the now-emptied `_update_player_nodes`).
- `_player_frame_texture()` is already self-contained — don't refactor it. It's still needed in Task 11 for the actor draw, and it caches in `_player_frame_texture_cache`.
- The new prop shape uses `Array[Vector2i]` offsets, not `Vector2i` footprint sizes. The old `_footprint_cells` helper (around line 800) becomes dead code after Task 6 — leave it; it's harmless and may be useful later if procedural footprint generation returns.
- If a prop appears in the wrong sort order, suspect `_height_at_cell(prop_cell)` returning `0` because the prop cell isn't in `_column_lookup`. Verify `_index_columns()` runs after `_columns = _make_validation_layout_columns()` in `_ready` — both prop cells and player walkability depend on it.
