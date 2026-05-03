import * as THREE from 'three'
import pixelateFrag from './shaders/pixelate.frag.glsl?raw'

const PIXELATE_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export interface SceneBootstrapOptions {
  canvas: HTMLCanvasElement
  internalWidth?: number   // default 480
  internalHeight?: number  // default 270
  worldHalfExtent?: number // default 12
  clearColor?: number      // default 0x081016
}

export class SceneBootstrap {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  private rt: THREE.WebGLRenderTarget
  private blitScene: THREE.Scene
  private blitCamera: THREE.OrthographicCamera
  private blitMesh: THREE.Mesh
  private rafId: number | null = null
  private lastT = 0
  private updateCb: ((dt: number, t: number) => void) | null = null

  constructor(private opts: SceneBootstrapOptions) {
    const internalW = opts.internalWidth ?? 480
    const internalH = opts.internalHeight ?? 270
    const worldHalf = opts.worldHalfExtent ?? 12

    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: false })
    this.renderer.setPixelRatio(1)
    this.renderer.setClearColor(opts.clearColor ?? 0x081016, 1)

    this.scene = new THREE.Scene()

    // 2:1 dimetric: yaw 45°, pitch atan(0.5) ≈ 26.565°.
    // Build the camera position from those angles around the origin.
    const aspect = internalW / internalH
    this.camera = new THREE.OrthographicCamera(
      -worldHalf * aspect, worldHalf * aspect,
      worldHalf, -worldHalf,
      0.1, 200,
    )
    const dist = 50
    const yaw = Math.PI / 4
    const pitch = Math.atan(0.5)
    this.camera.position.set(
      Math.cos(pitch) * Math.cos(yaw) * dist,
      Math.sin(pitch) * dist,
      Math.cos(pitch) * Math.sin(yaw) * dist,
    )
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(0, 0, 0)

    this.rt = new THREE.WebGLRenderTarget(internalW, internalH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    })

    this.blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.blitScene = new THREE.Scene()
    const blitMat = new THREE.ShaderMaterial({
      vertexShader: PIXELATE_VERT,
      fragmentShader: pixelateFrag,
      uniforms: { uTexture: { value: this.rt.texture } },
      depthTest: false,
      depthWrite: false,
    })
    const blitGeom = new THREE.PlaneGeometry(2, 2)
    this.blitMesh = new THREE.Mesh(blitGeom, blitMat)
    this.blitScene.add(this.blitMesh)

    this.handleResize()
    window.addEventListener('resize', this.handleResize)
  }

  setUpdate(cb: (dt: number, t: number) => void): void {
    this.updateCb = cb
  }

  start(): void {
    if (this.rafId !== null) return
    this.lastT = performance.now() / 1000
    const loop = () => {
      this.rafId = requestAnimationFrame(loop)
      const now = performance.now() / 1000
      const dt = Math.min(0.05, now - this.lastT)
      this.lastT = now
      this.updateCb?.(dt, now)
      this.renderer.setRenderTarget(this.rt)
      this.renderer.render(this.scene, this.camera)
      this.renderer.setRenderTarget(null)
      this.renderer.render(this.blitScene, this.blitCamera)
    }
    loop()
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  dispose(): void {
    this.stop()
    window.removeEventListener('resize', this.handleResize)
    this.rt.dispose()
    this.blitMesh.geometry.dispose()
    ;(this.blitMesh.material as THREE.Material).dispose()
    this.renderer.dispose()
  }

  private handleResize = (): void => {
    const canvas = this.opts.canvas
    const parent = canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    this.renderer.setSize(w, h, false)
  }
}
