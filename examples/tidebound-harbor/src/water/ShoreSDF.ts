import type { WorldExtent } from './WaterField'

export interface LandBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface BakeShoreSDFOptions {
  worldExtent: WorldExtent
  resolution: { width: number; height: number }
  lands: LandBox[]
}

export interface ShoreSDF {
  width: number
  height: number
  data: Float32Array
  extent: WorldExtent
  sampleWorld(x: number, z: number): number
}

function signedDistanceToBox(x: number, z: number, b: LandBox): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX)
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ)
  const outside = Math.sqrt(dx * dx + dz * dz)
  if (outside > 0) return outside
  // inside: negative distance to nearest edge
  const inside = Math.max(b.minX - x, x - b.maxX, b.minZ - z, z - b.maxZ)
  return inside // already negative
}

export function bakeShoreSDF(opts: BakeShoreSDFOptions): ShoreSDF {
  const { worldExtent: e, resolution: r, lands } = opts
  const data = new Float32Array(r.width * r.height)
  for (let j = 0; j < r.height; j += 1) {
    const v = j / (r.height - 1)
    const z = e.minZ + v * (e.maxZ - e.minZ)
    for (let i = 0; i < r.width; i += 1) {
      const u = i / (r.width - 1)
      const x = e.minX + u * (e.maxX - e.minX)
      let best = Number.POSITIVE_INFINITY
      for (const b of lands) {
        const d = signedDistanceToBox(x, z, b)
        if (d < best) best = d
      }
      data[j * r.width + i] = best
    }
  }
  return {
    width: r.width,
    height: r.height,
    data,
    extent: { ...e },
    sampleWorld(x, z) {
      const u = (x - e.minX) / (e.maxX - e.minX)
      const v = (z - e.minZ) / (e.maxZ - e.minZ)
      const fx = u * (r.width - 1)
      const fy = v * (r.height - 1)
      const x0 = Math.max(0, Math.min(r.width - 1, Math.floor(fx)))
      const y0 = Math.max(0, Math.min(r.height - 1, Math.floor(fy)))
      const x1 = Math.min(r.width - 1, x0 + 1)
      const y1 = Math.min(r.height - 1, y0 + 1)
      const tx = fx - x0
      const ty = fy - y0
      const a = data[y0 * r.width + x0]
      const c = data[y0 * r.width + x1]
      const dd = data[y1 * r.width + x0]
      const ee = data[y1 * r.width + x1]
      return (a * (1 - tx) + c * tx) * (1 - ty) + (dd * (1 - tx) + ee * tx) * ty
    },
  }
}
