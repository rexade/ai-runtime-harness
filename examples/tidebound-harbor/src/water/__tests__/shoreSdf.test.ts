import { describe, it, expect } from 'vitest'
import { bakeShoreSDF } from '../ShoreSDF'

describe('bakeShoreSDF', () => {
  it('produces a distance of zero at a land edge and positive offshore', () => {
    const sdf = bakeShoreSDF({
      worldExtent: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      resolution: { width: 64, height: 64 },
      lands: [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2 }],
    })
    const onEdge = sdf.sampleWorld(2, 0)
    const offshore = sdf.sampleWorld(8, 0)
    expect(Math.abs(onEdge)).toBeLessThan(0.5) // close to zero at boundary
    expect(offshore).toBeGreaterThan(onEdge)
  })

  it('returns negative distance inside a land box', () => {
    const sdf = bakeShoreSDF({
      worldExtent: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      resolution: { width: 64, height: 64 },
      lands: [{ minX: -2, maxX: 2, minZ: -2, maxZ: 2 }],
    })
    expect(sdf.sampleWorld(0, 0)).toBeLessThan(0)
  })

  it('handles multiple land boxes by taking the minimum signed distance', () => {
    const sdf = bakeShoreSDF({
      worldExtent: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      resolution: { width: 64, height: 64 },
      lands: [
        { minX: -5, maxX: -3, minZ: -1, maxZ: 1 },
        { minX: 3, maxX: 5, minZ: -1, maxZ: 1 },
      ],
    })
    expect(sdf.sampleWorld(0, 0)).toBeGreaterThan(0)
    // closer to the right island
    expect(sdf.sampleWorld(2.5, 0)).toBeLessThan(sdf.sampleWorld(0, 0))
  })
})
