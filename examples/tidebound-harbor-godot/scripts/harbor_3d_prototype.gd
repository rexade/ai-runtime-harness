extends Node3D

const PLAYER_TEXTURE := preload("res://assets/townfolk-headphones-idle.png")
const HarborBlockMaterialsScript := preload("res://scripts/harbor_block_materials.gd")
const HarborArenaLayoutScript := preload("res://scripts/harbor_arena_layout.gd")

const SOURCE_BLOCK_SIZE := Vector2i(35, 33)
const TARGET_FULL_BLOCK_PIXELS := Vector2(35.0, 33.0)
const TARGET_BLOCK_TOP_PIXELS := Vector2(32.0, 16.0)
const BLOCK_SIZE := 1.0
const BLOCK_HEIGHT := 1.0
const PLAYER_HEIGHT := 1.6
const PLAYER_FRAME_SIZE := Vector2i(10, 21)
const PLAYER_CARD_SIZE := Vector2(PLAYER_HEIGHT * float(PLAYER_FRAME_SIZE.x) / float(PLAYER_FRAME_SIZE.y), PLAYER_HEIGHT)
const PLAYER_COLLISION_RADIUS := 0.22
const PLAYER_MAX_STEP_HEIGHT := 1
const PLAYER_TOP_SPEED := 3.2
const PLAYER_BOOST_SPEED := 4.6
const CAMERA_YAW_DEG := 45.0
const CAMERA_ELEVATION_DEG := 30.0
const ORTHO_SIZE := 31.5
const CAMERA_DISTANCE := 64.0
const CAMERA_TARGET := Vector3(0.0, 0.8, 0.0)
const DEFAULT_VALIDATION_CASE := 2
const LIGHTING_MODE := "stylized-soft-blocks"
const SHADOWS_DEFAULT_ENABLED := true
const SUN_ROTATION_DEG := Vector3(-48.0, 36.0, 0.0)
const SUN_LIGHT_ENERGY := 1.65
const SUN_SHADOW_OPACITY := 0.34
const AMBIENT_LIGHT_COLOR := Color("#b7c5a9")
const AMBIENT_LIGHT_ENERGY := 0.86
const FILL_LIGHT_COLOR := Color("#b9d4ff")
const FILL_LIGHT_ENERGY := 0.42
const VIEW_SPRITE_ART := "sprite-cube art"
const VIEW_PROXY_DEBUG := "proxy debug"
const LAYOUT_ARENA := "arena"
const LAYOUT_SPRITE_VALIDATION := "sprite validation"
const SPRITE_ART_DISPLAY_ZOOM := 2.0
const LAYER_ORDER := {"terrain": 0, "shadow": 1, "prop": 2, "actor": 2}

var _columns: Array[Dictionary] = []
var _column_lookup := {}
var _props: Array[Dictionary] = []
var _prop_texture_cache := {}
var _last_blocked_cell: Vector2i = Vector2i(99999, 99999)  # sentinel "no recent blocker"
var _player_pos := Vector2(-3.0, 2.0)
var _player_velocity := Vector2.ZERO
var _player_heading := 0.0
var _player_speed := 0.0
var _animation_time := 0.0
var _camera: Camera3D
var _player_card: MeshInstance3D
var _player_shadow: MeshInstance3D
var _player_frame_texture_cache: Texture2D
var _sun_light: DirectionalLight3D
var _fill_light: DirectionalLight3D
var _hud: Label
var _terrain_sprite_layer: Node2D
var _terrain_proxy_root: Node3D
var _visual_view_mode := VIEW_SPRITE_ART
var _layout_mode := LAYOUT_ARENA
var _sprite_debug_overlay_enabled := false
var _debug_markers: Node3D
var _debug_overlay_enabled := true
var _shadows_enabled := SHADOWS_DEFAULT_ENABLED
var _active_case := "free walk"
var _block_materials := HarborBlockMaterialsScript.new()
var _keys := {
	"backward": false,
	"boost": false,
	"forward": false,
	"left": false,
	"right": false,
}


func _ready() -> void:
	_columns = _make_validation_layout_columns()
	_props = HarborArenaLayoutScript.props()
	_index_columns()
	_ensure_input_map()
	_build_3d_scene()
	_apply_validation_case(DEFAULT_VALIDATION_CASE)
	set_process(true)
	set_process_input(true)


func _input(event: InputEvent) -> void:
	if event is InputEventKey and not event.echo:
		_set_key_state(event)


func _process(delta: float) -> void:
	_animation_time += delta
	if DEFAULT_VALIDATION_CASE == 0:
		_update_player(delta)
	_update_player_nodes()
	if _terrain_sprite_layer:
		_terrain_sprite_layer.queue_redraw()
	_update_hud()


func _build_3d_scene() -> void:
	_clear_children()
	_build_world_environment()
	_build_camera()
	_build_lights()
	_build_terrain()
	_build_player()
	_build_debug_markers()
	_build_hud()
	_update_player_nodes()


func _clear_children() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_terrain_sprite_layer = null
	_terrain_proxy_root = null
	_debug_markers = null
	_hud = null
	_player_card = null
	_player_shadow = null


func _build_world_environment() -> void:
	var world := WorldEnvironment.new()
	world.name = "WorldEnvironment"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#203040")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = AMBIENT_LIGHT_COLOR
	environment.ambient_light_energy = AMBIENT_LIGHT_ENERGY
	world.environment = environment
	add_child(world)


func _build_camera() -> void:
	_camera = Camera3D.new()
	_camera.name = "OrthographicCamera3D"
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = ORTHO_SIZE
	_camera.near = 0.05
	_camera.far = 80.0
	_camera.position = _camera_position_for(CAMERA_YAW_DEG, CAMERA_ELEVATION_DEG, CAMERA_DISTANCE, CAMERA_TARGET)
	add_child(_camera)
	_camera.look_at(CAMERA_TARGET, Vector3.UP)
	_camera.current = true


func _build_lights() -> void:
	_sun_light = DirectionalLight3D.new()
	_sun_light.name = "StylizedSun"
	_sun_light.light_energy = SUN_LIGHT_ENERGY
	_sun_light.light_color = Color("#fff2c7")
	_sun_light.rotation_degrees = SUN_ROTATION_DEG
	_sun_light.shadow_enabled = _shadows_enabled
	_sun_light.shadow_opacity = SUN_SHADOW_OPACITY
	_sun_light.shadow_bias = 0.08
	_sun_light.shadow_normal_bias = 1.8
	add_child(_sun_light)

	_fill_light = DirectionalLight3D.new()
	_fill_light.name = "SoftSkyFill"
	_fill_light.light_energy = FILL_LIGHT_ENERGY
	_fill_light.light_color = FILL_LIGHT_COLOR
	_fill_light.rotation_degrees = Vector3(-34.0, -145.0, 0.0)
	_fill_light.shadow_enabled = false
	add_child(_fill_light)


func _build_terrain() -> void:
	_terrain_sprite_layer = Node2D.new()
	_terrain_sprite_layer.name = "TerrainSpriteCubes"
	_terrain_sprite_layer.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_terrain_sprite_layer.draw.connect(_draw_world_sprites)
	add_child(_terrain_sprite_layer)

	var proxy_root := Node3D.new()
	proxy_root.name = "TerrainLogicalProxy"
	_terrain_proxy_root = proxy_root
	add_child(proxy_root)
	for column in _columns:
		var cell: Vector2i = column["cell"]
		var height := int(column["height"])
		var kind := String(column.get("kind", "grass"))
		if height <= 0 and not _block_materials.is_water_kind(kind):
			continue
		if _block_materials.is_water_kind(kind):
			_add_proxy_block(proxy_root, cell, kind, 0)
		else:
			for z in range(height):
				_add_proxy_block(proxy_root, cell, kind, z)
	_apply_visual_view_mode()


func _add_proxy_block(parent: Node, cell: Vector2i, kind: String, z: int) -> void:
	var block := MeshInstance3D.new()
	block.name = "ProxyBlock_%d_%d_%d_%s" % [cell.x, cell.y, z, kind]
	if _block_materials.is_water_kind(kind):
		block.mesh = _block_materials.water_mesh(Vector2(BLOCK_SIZE, BLOCK_SIZE))
		block.position = grid_to_world(float(cell.x), float(cell.y), 0.025)
	else:
		block.mesh = _block_materials.block_mesh(kind, Vector3(BLOCK_SIZE, BLOCK_HEIGHT, BLOCK_SIZE))
		block.position = grid_to_world(float(cell.x), float(cell.y), float(z) + 0.5)
	parent.add_child(block)


func _draw_world_sprites() -> void:
	if not _camera:
		return
	var items: Array[Dictionary] = []
	_collect_world_sprite_items(items)
	items.sort_custom(_world_sprite_sort)
	for item in items:
		_draw_world_sprite_item(item)


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
		"prop":
			_draw_prop_item(item)
		# shadow / actor layers added in later tasks
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


func _sprite_art_screen_position(world_pos: Vector3) -> Vector2:
	var projected := _camera.unproject_position(world_pos)
	var viewport_center := get_viewport().get_visible_rect().size * 0.5
	return viewport_center + (projected - viewport_center) * SPRITE_ART_DISPLAY_ZOOM


func _draw_sprite_debug_overlay(cell: Vector2i, kind: String, z: int, anchor: Vector2, top_left: Vector2, size: Vector2) -> void:
	_terrain_sprite_layer.draw_rect(Rect2(top_left, size), Color("#ffeb66"), false, 1.0)
	_terrain_sprite_layer.draw_circle(anchor, 2.5, Color("#ff4f7a"))
	_terrain_sprite_layer.draw_line(anchor + Vector2(-5.0, 0.0), anchor + Vector2(5.0, 0.0), Color("#ff4f7a"), 1.0)
	_terrain_sprite_layer.draw_line(anchor + Vector2(0.0, -5.0), anchor + Vector2(0.0, 5.0), Color("#ff4f7a"), 1.0)
	_terrain_sprite_layer.draw_string(
		ThemeDB.fallback_font,
		top_left + Vector2(0.0, -4.0),
		"%s %s z%d" % [str(cell), kind, z],
		HORIZONTAL_ALIGNMENT_LEFT,
		120.0,
		10.0,
		Color("#f5f7ff")
	)


func _draw_missing_cube_placeholder(anchor: Vector2, kind: String) -> void:
	var s := SPRITE_ART_DISPLAY_ZOOM
	var top := PackedVector2Array([
		anchor + Vector2(0.0, -32.0) * s,
		anchor + Vector2(16.0, -24.0) * s,
		anchor + Vector2(0.0, -16.0) * s,
		anchor + Vector2(-16.0, -24.0) * s,
	])
	var right := PackedVector2Array([
		anchor + Vector2(16.0, -24.0) * s,
		anchor + Vector2(16.0, -8.0) * s,
		anchor + Vector2(0.0, 0.0),
		anchor + Vector2(0.0, -16.0) * s,
	])
	var left := PackedVector2Array([
		anchor + Vector2(-16.0, -24.0) * s,
		anchor + Vector2(0.0, -16.0) * s,
		anchor + Vector2(0.0, 0.0),
		anchor + Vector2(-16.0, -8.0) * s,
	])
	var base := _block_materials.fallback_color(kind)
	_terrain_sprite_layer.draw_colored_polygon(left, base.darkened(0.18))
	_terrain_sprite_layer.draw_colored_polygon(right, base.darkened(0.30))
	_terrain_sprite_layer.draw_colored_polygon(top, base.lightened(0.12))


func _build_player() -> void:
	_player_shadow = MeshInstance3D.new()
	_player_shadow.name = "PlayerFeetShadow"
	var shadow_mesh := CylinderMesh.new()
	shadow_mesh.top_radius = PLAYER_COLLISION_RADIUS * 1.15
	shadow_mesh.bottom_radius = PLAYER_COLLISION_RADIUS * 1.15
	shadow_mesh.height = 0.01
	shadow_mesh.radial_segments = 24
	_player_shadow.mesh = shadow_mesh
	_player_shadow.material_override = _plain_material(Color(0.02, 0.03, 0.025, 0.34), false)
	add_child(_player_shadow)

	_player_card = MeshInstance3D.new()
	_player_card.name = "PlayerSprite3D"
	var quad := QuadMesh.new()
	quad.size = PLAYER_CARD_SIZE
	_player_card.mesh = quad
	_player_card.material_override = _player_material()
	add_child(_player_card)


func _build_debug_markers() -> void:
	_debug_markers = Node3D.new()
	_debug_markers.name = "DepthDebugMarkers"
	add_child(_debug_markers)
	if not _debug_overlay_enabled:
		_debug_markers.visible = false
		return
	for column in _columns:
		var cell: Vector2i = column["cell"]
		var height := int(column["height"])
		if height <= 1:
			continue
		_add_marker(_debug_markers, grid_to_world(float(cell.x), float(cell.y), float(height)) + Vector3(0.0, 0.018, 0.0), Color("#58a6ff"))
	for marker in _validation_markers():
		_add_marker(_debug_markers, grid_to_world(marker["pos"].x, marker["pos"].y, float(_height_at_cell(_cell_at_pos(marker["pos"])))) + Vector3(0.0, 0.04, 0.0), marker["color"])


func _validation_markers() -> Array[Dictionary]:
	return [
		{"pos": Vector2(0.62, 0.62), "color": Color("#46f58d")},
		{"pos": Vector2(-0.51, -0.51), "color": Color("#ffcf5a")},
		{"pos": Vector2(0.0, 0.0), "color": Color("#58a6ff")},
		{"pos": Vector2(-2.35, -0.55), "color": Color("#d56cff")},
		{"pos": Vector2(4.45, 1.45), "color": Color("#46f58d")},
		{"pos": Vector2(1.55, -1.45), "color": Color("#ffcf5a")},
	]


func _build_hud() -> void:
	var canvas := CanvasLayer.new()
	canvas.name = "HudCanvas"
	add_child(canvas)
	_hud = Label.new()
	_hud.name = "PrototypeLabel"
	_hud.position = Vector2(18.0, 18.0)
	_hud.size = Vector2(680.0, 130.0)
	_hud.add_theme_font_size_override("font_size", 15)
	_hud.add_theme_color_override("font_color", Color("#f3f7fb"))
	_hud.add_theme_color_override("font_shadow_color", Color(0.02, 0.03, 0.04, 0.9))
	_hud.add_theme_constant_override("shadow_offset_x", 1)
	_hud.add_theme_constant_override("shadow_offset_y", 1)
	canvas.add_child(_hud)
	_update_hud()


func _update_player_nodes() -> void:
	var surface_height := _height_at_cell(_cell_at_pos(_player_pos))
	var feet := grid_to_world(_player_pos.x, _player_pos.y, float(surface_height)) + Vector3(0.0, 0.015, 0.0)
	_player_shadow.position = feet
	_player_shadow.visible = _shadows_enabled
	_player_card.position = feet + Vector3(0.0, PLAYER_CARD_SIZE.y * 0.5, 0.0)
	_face_camera_horizontally(_player_card)


func _face_camera_horizontally(node: Node3D) -> void:
	if not _camera:
		return
	var target := _camera.global_position
	target.y = node.global_position.y
	node.look_at(target, Vector3.UP)


func _update_hud() -> void:
	if not _hud:
		return
	var cell := _cell_at_pos(_player_pos)
	var surface_height := _height_at_cell(cell)
	var feet_world := grid_to_world(_player_pos.x, _player_pos.y, float(surface_height))
	var block_measure := _projected_block_top_measure()
	var full_block_measure := _projected_full_block_measure()
	_hud.text = "Harbor3DPrototype: 3D logical world + 2D iso cube sprites\nView=%s  Layout=%s  Sprite debug=%s  Case=%s\nGrid=%s  world=%s  surface=%d  logical cube=1x1x1\nCamera yaw=%.1f elevation=%.1f ortho=%.1f  sprite display zoom=%.1fx\nSprite target %.0fx%.0f px -> %.1fx%.1f px | top target %.0fx%.0f px -> %.1fx%.1f px\nF1 proxy. F2 sprite art. F3 validation layout. F4 anchors/bounds. Keys 1-6 validation." % [
		_visual_view_mode,
		_layout_mode,
		"on" if _sprite_debug_overlay_enabled else "off",
		_active_case,
		str(cell),
		str(feet_world),
		surface_height,
		CAMERA_YAW_DEG,
		CAMERA_ELEVATION_DEG,
		ORTHO_SIZE,
		SPRITE_ART_DISPLAY_ZOOM,
		TARGET_FULL_BLOCK_PIXELS.x,
		TARGET_FULL_BLOCK_PIXELS.y,
		full_block_measure.x,
		full_block_measure.y,
		TARGET_BLOCK_TOP_PIXELS.x,
		TARGET_BLOCK_TOP_PIXELS.y,
		block_measure.x,
		block_measure.y,
	]


func _update_player(delta: float) -> void:
	var screen_x := (1.0 if _keys["right"] else 0.0) - (1.0 if _keys["left"] else 0.0)
	var screen_y := (1.0 if _keys["backward"] else 0.0) - (1.0 if _keys["forward"] else 0.0)
	var input := Vector2(screen_x, screen_y)
	var input_magnitude := minf(1.0, input.length())
	var top_speed := PLAYER_BOOST_SPEED if _keys["boost"] else PLAYER_TOP_SPEED
	var target_velocity := Vector2.ZERO
	if input_magnitude > 0.0:
		var world_x := (screen_x + screen_y) / sqrt(2.0)
		var world_y := (screen_y - screen_x) / sqrt(2.0)
		target_velocity = Vector2(world_x, world_y).normalized() * top_speed
	var blend := 1.0 - exp(-delta * (10.5 if input_magnitude > 0.0 else 7.2))
	_player_velocity = _player_velocity.lerp(target_velocity, blend)
	if input_magnitude <= 0.0 and _player_velocity.length_squared() < 0.0025:
		_player_velocity = Vector2.ZERO
	_player_speed = _player_velocity.length()
	if _player_speed > 0.08:
		_player_heading = atan2(_player_velocity.y, _player_velocity.x)
	var target_pos := _player_pos + _player_velocity * delta
	target_pos.x = clampf(target_pos.x, HarborArenaLayoutScript.PLAYER_CLAMP_MIN.x, HarborArenaLayoutScript.PLAYER_CLAMP_MAX.x)
	target_pos.y = clampf(target_pos.y, HarborArenaLayoutScript.PLAYER_CLAMP_MIN.y, HarborArenaLayoutScript.PLAYER_CLAMP_MAX.y)
	_move_player_with_slide(target_pos)


func _move_player_with_slide(target_pos: Vector2) -> void:
	if _is_player_pos_walkable(target_pos):
		_player_pos = target_pos
		_last_blocked_cell = Vector2i(99999, 99999)
		return
	var x_target := Vector2(target_pos.x, _player_pos.y)
	if _is_player_pos_walkable(x_target):
		_player_pos = x_target
		_player_velocity.y *= 0.15
		return
	var y_target := Vector2(_player_pos.x, target_pos.y)
	if _is_player_pos_walkable(y_target):
		_player_pos = y_target
		_player_velocity.x *= 0.15
		return
	_player_velocity *= 0.15


func _teleport_player(pos: Vector2, case_name: String) -> void:
	_player_pos = pos
	_player_velocity = Vector2.ZERO
	_player_speed = 0.0
	_active_case = case_name
	_update_player_nodes()
	_update_hud()


func _apply_validation_case(case_id: int) -> void:
	match case_id:
		1:
			_teleport_player(Vector2(0.62, 0.62), "1 front of 1x1 raised block: player visible")
		2:
			_teleport_player(Vector2(-0.51, -0.51), "2 behind 1x1 raised block: block occludes naturally")
		3:
			_teleport_player(Vector2(0.0, 0.0), "3 on top of raised block: feet on top")
		4:
			_teleport_player(Vector2(-2.35, -0.55), "4 2x2 platform corner: no painter artifact")
		5:
			_teleport_player(Vector2(4.45, 1.45), "5 in front of building: player visible")
		6:
			_teleport_player(Vector2(1.55, -1.45), "6 behind building: building occludes naturally")


func _is_player_pos_walkable(pos: Vector2) -> bool:
	var current_height := _height_at_cell(_cell_at_pos(_player_pos))
	var diagonal_radius := PLAYER_COLLISION_RADIUS * 0.70710678
	var samples := [
		pos,
		pos + Vector2(PLAYER_COLLISION_RADIUS, 0.0),
		pos + Vector2(-PLAYER_COLLISION_RADIUS, 0.0),
		pos + Vector2(0.0, PLAYER_COLLISION_RADIUS),
		pos + Vector2(0.0, -PLAYER_COLLISION_RADIUS),
		pos + Vector2(diagonal_radius, diagonal_radius),
		pos + Vector2(diagonal_radius, -diagonal_radius),
		pos + Vector2(-diagonal_radius, diagonal_radius),
		pos + Vector2(-diagonal_radius, -diagonal_radius),
	]
	for sample in samples:
		if not _is_player_cell_walkable(_cell_at_pos(sample), current_height):
			return false
	return true


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


func grid_to_world(x: float, y: float, h: float) -> Vector3:
	return Vector3(x * BLOCK_SIZE, h * BLOCK_HEIGHT, y * BLOCK_SIZE)


func _camera_position_for(yaw_degrees: float, elevation_degrees: float, distance: float, target: Vector3) -> Vector3:
	var yaw := deg_to_rad(yaw_degrees)
	var elevation := deg_to_rad(elevation_degrees)
	var horizontal_distance := cos(elevation) * distance
	return target + Vector3(
		sin(yaw) * horizontal_distance,
		sin(elevation) * distance,
		cos(yaw) * horizontal_distance
	)


func _projected_block_top_measure() -> Vector2:
	if not _camera:
		return Vector2.ZERO
	var y := float(_height_at_cell(Vector2i.ZERO))
	var corners := [
		grid_to_world(-0.5, -0.5, y),
		grid_to_world(0.5, -0.5, y),
		grid_to_world(0.5, 0.5, y),
		grid_to_world(-0.5, 0.5, y),
	]
	var min_p := Vector2(INF, INF)
	var max_p := Vector2(-INF, -INF)
	for corner in corners:
		var screen := _camera.unproject_position(corner)
		min_p.x = minf(min_p.x, screen.x)
		min_p.y = minf(min_p.y, screen.y)
		max_p.x = maxf(max_p.x, screen.x)
		max_p.y = maxf(max_p.y, screen.y)
	return max_p - min_p


func _projected_full_block_measure() -> Vector2:
	if not _camera:
		return Vector2.ZERO
	var points := [
		grid_to_world(-0.5, -0.5, 0.0),
		grid_to_world(0.5, -0.5, 0.0),
		grid_to_world(0.5, 0.5, 0.0),
		grid_to_world(-0.5, 0.5, 0.0),
		grid_to_world(-0.5, -0.5, 1.0),
		grid_to_world(0.5, -0.5, 1.0),
		grid_to_world(0.5, 0.5, 1.0),
		grid_to_world(-0.5, 0.5, 1.0),
	]
	var min_p := Vector2(INF, INF)
	var max_p := Vector2(-INF, -INF)
	for point in points:
		var screen := _camera.unproject_position(point)
		min_p.x = minf(min_p.x, screen.x)
		min_p.y = minf(min_p.y, screen.y)
		max_p.x = maxf(max_p.x, screen.x)
		max_p.y = maxf(max_p.y, screen.y)
	return max_p - min_p


func _make_validation_layout_columns() -> Array[Dictionary]:
	if _layout_mode == LAYOUT_SPRITE_VALIDATION:
		return _make_sprite_validation_layout_columns()
	return HarborArenaLayoutScript.columns()


func _make_sprite_validation_layout_columns() -> Array[Dictionary]:
	var columns: Array[Dictionary] = []
	columns.append(_column(Vector2i(-4, -1), "grass", 1))
	columns.append(_column(Vector2i(-2, -1), "stone", 1))
	columns.append(_column(Vector2i(0, -1), "water", 0))
	columns.append(_column(Vector2i(2, -1), "missing_asset", 1))
	for y in range(1, 3):
		for x in range(-4, -2):
			columns.append(_column(Vector2i(x, y), "grass", 1))
	columns.append(_column(Vector2i(0, 1), "sand", 1))
	columns.append(_column(Vector2i(1, 1), "sand", 2))
	return columns


func _column(cell: Vector2i, kind: String, height: int) -> Dictionary:
	return {
		"cell": cell,
		"height": height,
		"debug_color": Color("#8fe34f"),
		"kind": kind,
	}


func _set_column_height(columns: Array[Dictionary], cell: Vector2i, height: int) -> void:
	for column in columns:
		if Vector2i(column.get("cell", Vector2i.ZERO)) == cell:
			column["height"] = height
			column["debug_color"] = Color("#b6f15e") if height >= 3 else Color("#8fe34f")
			return


func _index_columns() -> void:
	_column_lookup.clear()
	for column in _columns:
		var cell: Vector2i = column["cell"]
		_column_lookup[_cell_key(cell)] = column


func _height_at_cell(cell: Vector2i) -> int:
	var column: Dictionary = _column_lookup.get(_cell_key(cell), {})
	return int(column.get("height", 0))


func _cell_at_pos(pos: Vector2) -> Vector2i:
	return Vector2i(roundi(pos.x), roundi(pos.y))


func _cell_key(cell: Vector2i) -> String:
	return "%d,%d" % [cell.x, cell.y]


func _terrain_material_for(column: Dictionary) -> Material:
	var height := int(column.get("height", 1))
	var color: Color = column.get("debug_color", Color("#8fe34f"))
	color = color.darkened(maxf(0.0, float(height - 1) * 0.07))
	return _plain_material(color, true)


func _plain_material(color: Color, opaque: bool) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.82
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
	if not opaque or color.a < 1.0:
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_ALWAYS
		mat.no_depth_test = false
	return mat


func _add_building_contact_shadow(parent: Node, center: Vector3, footprint: Vector2, base_height: float) -> void:
	var shadow := MeshInstance3D.new()
	shadow.name = "ShedContactShadow"
	var mesh := BoxMesh.new()
	mesh.size = Vector3(footprint.x + 0.28, 0.012, footprint.y + 0.28)
	shadow.mesh = mesh
	shadow.position = Vector3(center.x, grid_to_world(0.0, 0.0, base_height).y + 0.018, center.z)
	shadow.material_override = _plain_material(Color(0.02, 0.025, 0.02, 0.20), false)
	shadow.add_to_group("stylized_contact_shadow")
	shadow.visible = _shadows_enabled
	parent.add_child(shadow)


func _set_shadows_enabled(enabled: bool) -> void:
	_shadows_enabled = enabled
	if _sun_light:
		_sun_light.shadow_enabled = _shadows_enabled
	if _player_shadow:
		_player_shadow.visible = _shadows_enabled
	for shadow in get_tree().get_nodes_in_group("stylized_contact_shadow"):
		if shadow is Node3D:
			shadow.visible = _shadows_enabled


func _set_visual_view_mode(mode: String) -> void:
	_visual_view_mode = mode
	_apply_visual_view_mode()
	if _terrain_sprite_layer:
		_terrain_sprite_layer.queue_redraw()
	_update_hud()


func _toggle_sprite_validation_layout() -> void:
	_layout_mode = LAYOUT_ARENA if _layout_mode == LAYOUT_SPRITE_VALIDATION else LAYOUT_SPRITE_VALIDATION
	_rebuild_layout()


func _toggle_sprite_debug_overlay() -> void:
	_sprite_debug_overlay_enabled = not _sprite_debug_overlay_enabled
	if _terrain_sprite_layer:
		_terrain_sprite_layer.queue_redraw()
	_update_hud()


func _rebuild_layout() -> void:
	_columns = _make_validation_layout_columns()
	_index_columns()
	_build_3d_scene()
	_apply_validation_case(DEFAULT_VALIDATION_CASE)
	_set_visual_view_mode(_visual_view_mode)


func _apply_visual_view_mode() -> void:
	var sprite_art := _visual_view_mode == VIEW_SPRITE_ART
	if _terrain_sprite_layer:
		_terrain_sprite_layer.visible = sprite_art
	if _terrain_proxy_root:
		_terrain_proxy_root.visible = not sprite_art
	if _sun_light:
		_sun_light.visible = not sprite_art
	if _fill_light:
		_fill_light.visible = not sprite_art


func _prop_texture(prop: Dictionary) -> Texture2D:
	var asset: String = prop.get("asset", "")
	if asset == "":
		return null
	if _prop_texture_cache.has(asset):
		return _prop_texture_cache[asset]
	var tex: Texture2D = load(asset)
	_prop_texture_cache[asset] = tex
	return tex


func _player_material() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = _player_frame_texture()
	mat.albedo_color = Color.WHITE
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	mat.alpha_scissor_threshold = 0.10
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat


func _player_frame_texture() -> Texture2D:
	if _player_frame_texture_cache:
		return _player_frame_texture_cache
	var source := PLAYER_TEXTURE.get_image()
	if not source:
		return PLAYER_TEXTURE
	var frame := Image.create(PLAYER_FRAME_SIZE.x, PLAYER_FRAME_SIZE.y, false, Image.FORMAT_RGBA8)
	frame.fill(Color(0, 0, 0, 0))
	frame.blit_rect(source, Rect2i(Vector2i.ZERO, PLAYER_FRAME_SIZE), Vector2i.ZERO)
	_player_frame_texture_cache = ImageTexture.create_from_image(frame)
	return _player_frame_texture_cache


func _add_marker(parent: Node, pos: Vector3, color: Color) -> void:
	var marker := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.045
	mesh.height = 0.09
	marker.mesh = mesh
	marker.position = pos
	marker.material_override = _plain_material(color, false)
	parent.add_child(marker)


func _footprint_cells(anchor_cell: Vector2i, footprint: Vector2i) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	var start_x := anchor_cell.x - int(floor(float(footprint.x) * 0.5))
	var start_y := anchor_cell.y - int(floor(float(footprint.y) * 0.5))
	for y in range(footprint.y):
		for x in range(footprint.x):
			cells.append(Vector2i(start_x + x, start_y + y))
	return cells


func _set_key_state(event: InputEventKey) -> void:
	var handled := true
	match event.keycode:
		KEY_W, KEY_UP:
			_keys["forward"] = event.pressed
		KEY_S, KEY_DOWN:
			_keys["backward"] = event.pressed
		KEY_A, KEY_LEFT:
			_keys["left"] = event.pressed
		KEY_D, KEY_RIGHT:
			_keys["right"] = event.pressed
		KEY_SHIFT:
			_keys["boost"] = event.pressed
		KEY_L:
			if event.pressed:
				_set_shadows_enabled(not _shadows_enabled)
		KEY_F1:
			if event.pressed:
				_set_visual_view_mode(VIEW_PROXY_DEBUG)
		KEY_F2:
			if event.pressed:
				_set_visual_view_mode(VIEW_SPRITE_ART)
		KEY_F3:
			if event.pressed:
				_toggle_sprite_validation_layout()
		KEY_F4:
			if event.pressed:
				_toggle_sprite_debug_overlay()
		KEY_1:
			if event.pressed:
				_apply_validation_case(1)
		KEY_2:
			if event.pressed:
				_apply_validation_case(2)
		KEY_3:
			if event.pressed:
				_apply_validation_case(3)
		KEY_4:
			if event.pressed:
				_apply_validation_case(4)
		KEY_5:
			if event.pressed:
				_apply_validation_case(5)
		KEY_6:
			if event.pressed:
				_apply_validation_case(6)
		_:
			handled = false
	if handled:
		get_viewport().set_input_as_handled()


func _ensure_input_map() -> void:
	_bind_key_if_missing("move_left", KEY_A)
	_bind_key_if_missing("move_left", KEY_LEFT)
	_bind_key_if_missing("move_right", KEY_D)
	_bind_key_if_missing("move_right", KEY_RIGHT)
	_bind_key_if_missing("move_up", KEY_W)
	_bind_key_if_missing("move_up", KEY_UP)
	_bind_key_if_missing("move_down", KEY_S)
	_bind_key_if_missing("move_down", KEY_DOWN)
	_bind_key_if_missing("burst", KEY_SHIFT)


func _bind_key_if_missing(action: StringName, keycode: Key) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action)
	for action_event in InputMap.action_get_events(action):
		if action_event is InputEventKey and action_event.keycode == keycode:
			return
	var key := InputEventKey.new()
	key.keycode = keycode
	InputMap.action_add_event(action, key)
