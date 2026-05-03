import type { WaterField } from './WaterField'

export interface FloatPose {
  height: number
  pitch: number
  roll: number
}

export function floatPose(
  field: WaterField,
  t: number,
  anchor: { x: number; z: number },
  halfLength: number,
  halfWidth: number,
): FloatPose {
  const c = field.sample(anchor.x, anchor.z, t).height
  const fwd = field.sample(anchor.x + halfLength, anchor.z, t).height
  const side = field.sample(anchor.x, anchor.z + halfWidth, t).height
  return {
    height: c,
    pitch: Math.atan2(fwd - c, halfLength),
    roll: Math.atan2(side - c, halfWidth),
  }
}
