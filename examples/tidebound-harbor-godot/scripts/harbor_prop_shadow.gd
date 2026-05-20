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
