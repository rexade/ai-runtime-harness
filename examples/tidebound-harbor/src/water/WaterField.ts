import { sampleGerstner, type GerstnerWave } from './GerstnerWaves'
import { RippleBuffer } from './RippleBuffer'

export interface WorldExtent {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface WaterFieldOptions {
  worldExtent: WorldExtent
  rippleResolution: { width: number; height: number }
  rippleC: number
  rippleDamping: number
  waves: GerstnerWave[]
}

export interface WaterSample {
  height: number
  normal: [number, number, number]
}

export class WaterField {
  readonly extent: WorldExtent
  waves: GerstnerWave[]
  readonly ripple: RippleBuffer
  private elapsed = 0

  constructor(opts: WaterFieldOptions) {
    this.extent = { ...opts.worldExtent }
    this.waves = [...opts.waves]
    this.ripple = new RippleBuffer({
      width: opts.rippleResolution.width,
      height: opts.rippleResolution.height,
      c: opts.rippleC,
      damping: opts.rippleDamping,
    })
  }

  worldToUV(x: number, z: number): { u: number; v: number } {
    const u = clamp01((x - this.extent.minX) / (this.extent.maxX - this.extent.minX))
    const v = clamp01((z - this.extent.minZ) / (this.extent.maxZ - this.extent.minZ))
    return { u, v }
  }

  sample(x: number, z: number, t: number): WaterSample {
    const g = sampleGerstner(x, z, t, this.waves)
    const uv = this.worldToUV(x, z)
    const ripple = this.ripple.sample(uv.u, uv.v)
    return {
      height: g.height + ripple,
      normal: g.normal,
    }
  }

  addImpulse(x: number, z: number, magnitude: number): void {
    const { u, v } = this.worldToUV(x, z)
    this.ripple.addImpulse(u, v, magnitude)
  }

  tick(dt: number): void {
    this.elapsed += dt
    this.ripple.step(dt)
  }

  getElapsed(): number {
    return this.elapsed
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
