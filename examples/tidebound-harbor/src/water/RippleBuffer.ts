export interface RippleBufferOptions {
  width: number
  height: number
  c: number       // wave propagation coefficient (0..1 for stability)
  damping: number // per-step multiplier (0.9..1.0)
}

export class RippleBuffer {
  readonly width: number
  readonly height: number
  private c: number
  private damping: number
  private cur: Float32Array
  private prev: Float32Array

  constructor(opts: RippleBufferOptions) {
    this.width = opts.width
    this.height = opts.height
    this.c = opts.c
    this.damping = opts.damping
    this.cur = new Float32Array(this.width * this.height)
    this.prev = new Float32Array(this.width * this.height)
  }

  setDamping(value: number): void {
    this.damping = value
  }

  addImpulse(u: number, v: number, magnitude: number): void {
    const cx = Math.min(this.width - 1, Math.max(0, Math.floor(u * this.width)))
    const cy = Math.min(this.height - 1, Math.max(0, Math.floor(v * this.height)))
    this.cur[cy * this.width + cx] += magnitude
  }

  pokeCellForTest(cx: number, cy: number, value: number): void {
    this.cur[cy * this.width + cx] = value
  }

  step(_dt: number): void {
    const w = this.width
    const h = this.height
    const c = this.c
    const damping = this.damping
    const next = this.prev
    const cur = this.cur

    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x
        const lap = cur[i - 1] + cur[i + 1] + cur[i - w] + cur[i + w] - 4 * cur[i]
        next[i] = (2 * cur[i] - next[i] + c * c * lap) * damping
      }
    }
    for (let x = 0; x < w; x += 1) {
      next[x] = 0
      next[(h - 1) * w + x] = 0
    }
    for (let y = 0; y < h; y += 1) {
      next[y * w] = 0
      next[y * w + (w - 1)] = 0
    }
    this.prev = cur
    this.cur = next
  }

  sample(u: number, v: number): number {
    const fx = u * (this.width - 1)
    const fy = v * (this.height - 1)
    const x0 = Math.max(0, Math.min(this.width - 1, Math.floor(fx)))
    const y0 = Math.max(0, Math.min(this.height - 1, Math.floor(fy)))
    const x1 = Math.min(this.width - 1, x0 + 1)
    const y1 = Math.min(this.height - 1, y0 + 1)
    const tx = fx - x0
    const ty = fy - y0
    const w = this.width
    const a = this.cur[y0 * w + x0]
    const b = this.cur[y0 * w + x1]
    const c2 = this.cur[y1 * w + x0]
    const d = this.cur[y1 * w + x1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d * tx) * ty
  }

  snapshot(): Float32Array {
    return this.cur
  }
}
