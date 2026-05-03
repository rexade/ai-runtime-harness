import * as THREE from 'three'
import waterVert from './shaders/water.vert.glsl?raw'
import waterFrag from './shaders/water.frag.glsl?raw'
import type { WaterField } from './WaterField'
import type { ShoreSDF } from './ShoreSDF'

const MAX_WAVES = 6

export interface WaterPalette {
  shallow: THREE.Color
  mid: THREE.Color
  deep: THREE.Color
  foam: THREE.Color
}

export interface WaterMeshOptions {
  field: WaterField
  shoreSDF: ShoreSDF
  segments?: number
  palette: WaterPalette
  shoreFoamWidth: number
  crestFoamThreshold: number
  sunDirectionDeg: number
}

export class WaterMesh {
  readonly mesh: THREE.Mesh
  private material: THREE.ShaderMaterial
  private rippleTex: THREE.DataTexture
  private rippleData: Float32Array
  private shoreTex: THREE.DataTexture

  constructor(private opts: WaterMeshOptions) {
    const ext = opts.field.extent
    const w = ext.maxX - ext.minX
    const d = ext.maxZ - ext.minZ
    const segments = opts.segments ?? 256
    const geom = new THREE.PlaneGeometry(w, d, segments, segments)
    geom.rotateX(-Math.PI / 2)
    geom.translate((ext.minX + ext.maxX) / 2, 0, (ext.minZ + ext.maxZ) / 2)

    this.rippleData = new Float32Array(opts.field.ripple.width * opts.field.ripple.height)
    this.rippleTex = new THREE.DataTexture(
      this.rippleData,
      opts.field.ripple.width,
      opts.field.ripple.height,
      THREE.RedFormat,
      THREE.FloatType,
    )
    this.rippleTex.needsUpdate = true
    this.rippleTex.minFilter = THREE.LinearFilter
    this.rippleTex.magFilter = THREE.LinearFilter

    this.shoreTex = new THREE.DataTexture(
      opts.shoreSDF.data,
      opts.shoreSDF.width,
      opts.shoreSDF.height,
      THREE.RedFormat,
      THREE.FloatType,
    )
    this.shoreTex.needsUpdate = true
    this.shoreTex.minFilter = THREE.LinearFilter
    this.shoreTex.magFilter = THREE.LinearFilter

    const wavesA = new Array(MAX_WAVES).fill(0).map(() => new THREE.Vector4())
    const wavesB = new Array(MAX_WAVES).fill(0).map(() => new THREE.Vector4())

    const sunRad = opts.sunDirectionDeg * Math.PI / 180
    const sunDir = new THREE.Vector3(Math.cos(sunRad), 0.85, Math.sin(sunRad)).normalize()

    this.material = new THREE.ShaderMaterial({
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      uniforms: {
        uTime: { value: 0 },
        uWaveCount: { value: 0 },
        uWavesA: { value: wavesA },
        uWavesB: { value: wavesB },
        uRipple: { value: this.rippleTex },
        uRippleStrength: { value: 1.0 },
        uExtent: { value: new THREE.Vector4(ext.minX, ext.maxX, ext.minZ, ext.maxZ) },
        uShoreSDF: { value: this.shoreTex },
        uSeafloorY: { value: -1.5 },
        uSunDir: { value: sunDir },
        uPaletteShallow: { value: opts.palette.shallow },
        uPaletteMid: { value: opts.palette.mid },
        uPaletteDeep: { value: opts.palette.deep },
        uPaletteFoam: { value: opts.palette.foam },
        uShoreFoamWidth: { value: opts.shoreFoamWidth },
        uCrestFoamThreshold: { value: opts.crestFoamThreshold },
        uDebugMode: { value: 0 },
      },
    })

    this.mesh = new THREE.Mesh(geom, this.material)
  }

  update(t: number): void {
    const u = this.material.uniforms
    u.uTime.value = t

    const wavesA = u.uWavesA.value as THREE.Vector4[]
    const wavesB = u.uWavesB.value as THREE.Vector4[]
    const DEG = Math.PI / 180
    const count = Math.min(MAX_WAVES, this.opts.field.waves.length)
    u.uWaveCount.value = count
    for (let i = 0; i < count; i += 1) {
      const w = this.opts.field.waves[i]
      wavesA[i].set(w.amplitude, w.wavelength, w.speed, w.phase)
      wavesB[i].set(Math.cos(w.directionDeg * DEG), Math.sin(w.directionDeg * DEG), w.steepness, 0)
    }

    const src = this.opts.field.ripple.snapshot()
    this.rippleData.set(src)
    this.rippleTex.needsUpdate = true
  }

  setDebugMode(mode: 0 | 1 | 2 | 3): void {
    this.material.uniforms.uDebugMode.value = mode
  }

  setPalette(p: WaterPalette): void {
    this.material.uniforms.uPaletteShallow.value.copy(p.shallow)
    this.material.uniforms.uPaletteMid.value.copy(p.mid)
    this.material.uniforms.uPaletteDeep.value.copy(p.deep)
    this.material.uniforms.uPaletteFoam.value.copy(p.foam)
  }

  setFoamThresholds(shoreFoamWidth: number, crestFoamThreshold: number): void {
    this.material.uniforms.uShoreFoamWidth.value = shoreFoamWidth
    this.material.uniforms.uCrestFoamThreshold.value = crestFoamThreshold
  }

  setRippleStrength(value: number): void {
    this.material.uniforms.uRippleStrength.value = value
  }

  setSunDirection(degrees: number): void {
    const r = degrees * Math.PI / 180
    const v = (this.material.uniforms.uSunDir.value as THREE.Vector3)
    v.set(Math.cos(r), 0.85, Math.sin(r)).normalize()
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.rippleTex.dispose()
    this.shoreTex.dispose()
  }
}
