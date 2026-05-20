@tool
extends McpTestSuite

const HarborArenaLayoutScript := preload("res://scripts/harbor_arena_layout.gd")
const HarborPropShadowScript := preload("res://scripts/harbor_prop_shadow.gd")


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
