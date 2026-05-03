import { describe, it, expect } from 'vitest'
import { WaterField } from '../WaterField'
import { floatPose } from '../Buoyancy'

const opts = {
  worldExtent: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  rippleResolution: { width: 32, height: 32 },
  rippleC: 0.5,
  rippleDamping: 0.99,
  waves: [{ amplitude: 0.5, wavelength: 4, steepness: 0, directionDeg: 0, speed: 0, phase: 0 }],
}

describe('floatPose', () => {
  it('height equals field height at the anchor position', () => {
    const f = new WaterField(opts)
    const pose = floatPose(f, 0, { x: 1, z: 0 }, 0.5, 0.5)
    expect(pose.height).toBeCloseTo(f.sample(1, 0, 0).height, 5)
  })

  it('a wave traveling along +X induces non-zero pitch', () => {
    const f = new WaterField(opts)
    const pose = floatPose(f, 0, { x: 0.5, z: 0 }, 1.0, 0.6)
    expect(Math.abs(pose.pitch)).toBeGreaterThan(0)
  })

  it('a wave traveling along +X gives zero roll (no Z slope)', () => {
    const f = new WaterField(opts)
    const pose = floatPose(f, 0, { x: 0.5, z: 0 }, 1.0, 0.6)
    expect(pose.roll).toBeCloseTo(0, 4)
  })
})
