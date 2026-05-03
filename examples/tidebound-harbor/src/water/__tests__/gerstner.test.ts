import { describe, it, expect } from 'vitest'
import { sampleGerstner, type GerstnerWave } from '../GerstnerWaves'

describe('sampleGerstner', () => {
  it('returns zero when amplitude is zero', () => {
    const wave: GerstnerWave = { amplitude: 0, wavelength: 10, steepness: 0, directionDeg: 0, speed: 1, phase: 0 }
    const r = sampleGerstner(0, 0, 0, [wave])
    expect(r.height).toBeCloseTo(0)
    expect(r.normal[1]).toBeCloseTo(1)
  })

  it('superposes linearly when steepness is zero (pure sine)', () => {
    const a: GerstnerWave = { amplitude: 0.5, wavelength: 8, steepness: 0, directionDeg: 0, speed: 0, phase: 0 }
    const b: GerstnerWave = { amplitude: 0.3, wavelength: 8, steepness: 0, directionDeg: 0, speed: 0, phase: 0 }
    const both = sampleGerstner(0, 0, 0, [a, b]).height
    const sumOfParts = sampleGerstner(0, 0, 0, [a]).height + sampleGerstner(0, 0, 0, [b]).height
    expect(both).toBeCloseTo(sumOfParts, 5)
  })

  it('peak height equals amplitude at the crest of a single sine wave', () => {
    const wave: GerstnerWave = { amplitude: 0.7, wavelength: 4, steepness: 0, directionDeg: 0, speed: 0, phase: 0 }
    const r = sampleGerstner(1, 0, 0, [wave]) // crest at x = wavelength/4
    expect(r.height).toBeCloseTo(0.7, 5)
  })

  it('time advancement by one period reproduces the initial value', () => {
    const wave: GerstnerWave = { amplitude: 0.4, wavelength: 4, steepness: 0, directionDeg: 0, speed: 1, phase: 0 }
    const at0 = sampleGerstner(0, 0, 0, [wave]).height
    const atFullPeriod = sampleGerstner(0, 0, 4, [wave]).height
    expect(atFullPeriod).toBeCloseTo(at0, 5)
  })

  it('analytical normal tilts in the wave-direction at non-extreme phase', () => {
    const wave: GerstnerWave = { amplitude: 0.5, wavelength: 4, steepness: 0, directionDeg: 0, speed: 0, phase: 0 }
    const r = sampleGerstner(0.5, 0, 0, [wave]) // mid-rise
    expect(Math.abs(r.normal[0])).toBeGreaterThan(0)
    expect(r.normal[1]).toBeGreaterThan(0)
    expect(Math.abs(r.normal[2])).toBeLessThan(1e-6)
  })
})
