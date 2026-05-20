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
