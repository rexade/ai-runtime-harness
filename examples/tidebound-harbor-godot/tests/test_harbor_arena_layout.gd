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
