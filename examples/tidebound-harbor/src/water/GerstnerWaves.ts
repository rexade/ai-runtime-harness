export interface GerstnerWave {
  amplitude: number
  wavelength: number
  steepness: number
  directionDeg: number
  speed: number
  phase: number
}

export interface GerstnerSample {
  height: number
  displacementX: number
  displacementZ: number
  normal: [number, number, number]
}

const DEG = Math.PI / 180

export function sampleGerstner(x: number, z: number, t: number, waves: readonly GerstnerWave[]): GerstnerSample {
  let h = 0
  let dx = 0
  let dz = 0
  let nx = 0
  let nz = 0

  for (const w of waves) {
    if (w.amplitude === 0) continue
    const k = (Math.PI * 2) / w.wavelength
    const dirX = Math.cos(w.directionDeg * DEG)
    const dirZ = Math.sin(w.directionDeg * DEG)
    const phase = k * (dirX * x + dirZ * z) - w.speed * k * t + w.phase
    const sin = Math.sin(phase)
    const cos = Math.cos(phase)
    const q = w.steepness / Math.max(k * w.amplitude * waves.length, 1e-6)

    h += w.amplitude * sin
    dx += q * w.amplitude * dirX * cos
    dz += q * w.amplitude * dirZ * cos
    nx += w.amplitude * k * dirX * cos
    nz += w.amplitude * k * dirZ * cos
  }

  // Surface normal = normalize(-∂h/∂x, 1, -∂h/∂z)
  const nXOut = -nx
  const nZOut = -nz
  const nYOut = 1
  const len = Math.sqrt(nXOut * nXOut + nYOut * nYOut + nZOut * nZOut) || 1

  return {
    height: h,
    displacementX: dx,
    displacementZ: dz,
    normal: [nXOut / len, nYOut / len, nZOut / len],
  }
}
