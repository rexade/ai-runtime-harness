import { SceneBootstrap } from '../water/SceneBootstrap'
import { WaterField } from '../water/WaterField'
import { WaterMesh } from '../water/WaterMesh'
import { BasinPlaceholder } from '../water/BasinPlaceholder'
import { bakeShoreSDF } from '../water/ShoreSDF'
import { loadKenneySailboatA } from '../water/BoatLoader'
import { BoatActor } from '../water/BoatActor'
import { CALM, STORM, type WaterPreset } from '../water/WaterPresets'

export class PlaygroundScene {
  private bootstrap: SceneBootstrap | null = null
  private field: WaterField | null = null
  private mesh: WaterMesh | null = null
  private basin: BasinPlaceholder | null = null
  private boat: BoatActor | null = null
  private boatDispose: (() => void) | null = null
  private preset: WaterPreset = CALM
  private cancelled = false

  async mount(canvas: HTMLCanvasElement): Promise<void> {
    this.bootstrap = new SceneBootstrap({
      canvas,
      internalWidth: 480,
      internalHeight: 270,
      worldHalfExtent: 12,
    })

    this.basin = new BasinPlaceholder()
    this.bootstrap.scene.add(this.basin.group)

    const extent = { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }
    const sdf = bakeShoreSDF({
      worldExtent: extent,
      resolution: { width: 128, height: 128 },
      lands: this.basin.lands,
    })

    this.field = new WaterField({
      worldExtent: extent,
      rippleResolution: { width: 96, height: 96 },
      rippleC: 0.45,
      rippleDamping: this.preset.rippleDamping,
      waves: this.preset.waves,
    })

    this.mesh = new WaterMesh({
      field: this.field,
      shoreSDF: sdf,
      segments: 256,
      palette: this.preset.palette,
      shoreFoamWidth: this.preset.shoreFoamWidth,
      crestFoamThreshold: this.preset.crestFoamThreshold,
      sunDirectionDeg: this.preset.sunDirectionDeg,
    })
    this.mesh.setRippleStrength(this.preset.rippleStrength)
    this.bootstrap.scene.add(this.mesh.mesh)

    const boatLoaded = await loadKenneySailboatA('/kenney_watercraft/')
    if (this.cancelled) {
      boatLoaded.dispose()
      return
    }
    this.boatDispose = boatLoaded.dispose
    this.bootstrap.scene.add(boatLoaded.object)
    this.boat = new BoatActor({
      object: boatLoaded.object,
      field: this.field,
      orbitRadius: 5.5,
      orbitPeriodSec: 18,
      wakeIntervalSec: 0.18,
      wakeIntensity: 0.45,
    })

    this.bootstrap.setUpdate((dt, t) => {
      if (!this.field || !this.mesh || !this.boat) return
      this.field.tick(dt)
      this.mesh.update(t)
      this.boat.update(dt, t)
    })
    this.bootstrap.start()
  }

  setPreset(id: 'calm' | 'storm'): void {
    this.preset = id === 'calm' ? CALM : STORM
    if (this.field) {
      this.field.waves = this.preset.waves
      this.field.ripple.setDamping(this.preset.rippleDamping)
    }
    if (this.mesh) {
      this.mesh.setPalette(this.preset.palette)
      this.mesh.setFoamThresholds(this.preset.shoreFoamWidth, this.preset.crestFoamThreshold)
      this.mesh.setSunDirection(this.preset.sunDirectionDeg)
      this.mesh.setRippleStrength(this.preset.rippleStrength)
    }
  }

  setDebugMode(mode: 0 | 1 | 2 | 3): void {
    this.mesh?.setDebugMode(mode)
  }

  dispose(): void {
    this.cancelled = true
    this.bootstrap?.stop()
    this.boatDispose?.()
    this.mesh?.dispose()
    this.basin?.dispose()
    this.bootstrap?.dispose()
    this.bootstrap = null
    this.boat = null
    this.boatDispose = null
    this.mesh = null
    this.basin = null
    this.field = null
  }
}
