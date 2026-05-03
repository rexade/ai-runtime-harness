import { describe, it, expect } from 'vitest'
import { RippleBuffer } from '../RippleBuffer'

describe('RippleBuffer', () => {
  it('starts at zero everywhere', () => {
    const r = new RippleBuffer({ width: 16, height: 16, c: 0.5, damping: 0.99 })
    expect(r.sample(0.5, 0.5)).toBe(0)
  })

  it('addImpulse raises the value at the nearest cell', () => {
    const r = new RippleBuffer({ width: 16, height: 16, c: 0.5, damping: 0.99 })
    r.addImpulse(0.5, 0.5, 1.0)
    expect(r.sample(0.5, 0.5)).toBeGreaterThan(0)
  })

  it('step propagates an impulse outward', () => {
    const r = new RippleBuffer({ width: 32, height: 32, c: 0.5, damping: 1.0 })
    r.addImpulse(0.5, 0.5, 1.0)
    const before = Math.abs(r.sample(0.62, 0.5))
    for (let i = 0; i < 8; i += 1) r.step(1 / 60)
    const after = Math.abs(r.sample(0.62, 0.5))
    expect(after).toBeGreaterThan(before)
  })

  it('damping decays total energy over time', () => {
    const r = new RippleBuffer({ width: 32, height: 32, c: 0.5, damping: 0.95 })
    r.addImpulse(0.5, 0.5, 1.0)
    const energy = (): number => {
      const buf = r.snapshot()
      let e = 0
      for (let i = 0; i < buf.length; i += 1) e += buf[i] * buf[i]
      return e
    }
    for (let i = 0; i < 4; i += 1) r.step(1 / 60)
    const e1 = energy()
    for (let i = 0; i < 60; i += 1) r.step(1 / 60)
    expect(energy()).toBeLessThan(e1)
  })

  it('sample is bilinear between cells', () => {
    const r = new RippleBuffer({ width: 4, height: 4, c: 0.5, damping: 1.0 })
    r.pokeCellForTest(1, 1, 1.0)
    const between = r.sample(0.5, 0.4)
    expect(between).toBeGreaterThan(0)
    expect(between).toBeLessThan(1)
  })
})
