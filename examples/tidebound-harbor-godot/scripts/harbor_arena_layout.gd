class_name HarborArenaLayout
extends RefCounted

## Hand-authored arena content for harbor_3d_prototype.gd's LAYOUT_ARENA mode.
## Coordinates: grid cells with +x east, +y south. Heights: 0=water, 1=walkable surface.

const SPAWN_POINT := Vector2(0.0, 0.0)
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
