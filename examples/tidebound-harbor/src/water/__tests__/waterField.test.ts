import { describe, it, expect } from 'vitest'
import { WaterField } from '../WaterField'

const baseOpts = {
  worldExtent: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  rippleResolution: { width: 32, height: 32 },
  rippleC: 0.5,
  rippleDamping: 0.99,
  waves: [
    { amplitude: 0.4, wavelength: 6, steepness: 0, directionDeg: 0, speed: 1, phase: 0 },
  ],
}

describe('WaterField', () => {
  it('returns Gerstner-only height when ripple buffer is untouched', () => {
    const f = new WaterField(baseOpts)
    expect(f.sample(0, 0, 0).height).toBeCloseTo(0, 4)
  })

  it('addImpulse increases the height at that world position', () => {
    const f = new WaterField(baseOpts)
    const before = f.sample(0, 0, 0).height
    f.addImpulse(0, 0, 1.0)
    expect(f.sample(0, 0, 0).height).toBeGreaterThan(before)
  })

  it('tick decays ripple energy', () => {
    const f = new WaterField({ ...baseOpts, rippleDamping: 0.9 })
    f.addImpulse(0, 0, 1.0)
    const e0 = Math.abs(f.sample(0, 0, 0).height)
    for (let i = 0; i < 60; i += 1) f.tick(1 / 60)
    expect(Math.abs(f.sample(0, 0, 0).height)).toBeLessThan(e0)
  })
})
