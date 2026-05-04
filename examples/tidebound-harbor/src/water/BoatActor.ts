import * as THREE from 'three'
import type { WaterField } from './WaterField'
import { floatPose } from './Buoyancy'

export interface BoatActorOptions {
  object: THREE.Object3D
  field: WaterField
  orbitCenterX?: number
  orbitCenterZ?: number
  orbitRadius: number
  orbitPeriodSec: number
  wakeIntervalSec: number
  wakeIntensity: number
}

export class BoatActor {
  private timeAccum = 0
  private wakeAccum = 0
  private lastPos = new THREE.Vector3()
  private halfLength = 1.0
  private halfWidth = 0.4

  constructor(private opts: BoatActorOptions) {
    const cx = opts.orbitCenterX ?? 0
    const cz = opts.orbitCenterZ ?? 0
    this.opts.object.position.set(cx + opts.orbitRadius, 0, cz)
    this.lastPos.copy(this.opts.object.position)
  }

  update(dt: number, t: number): void {
    this.timeAccum = t
    const omega = (Math.PI * 2) / this.opts.orbitPeriodSec
    const angle = this.timeAccum * omega
    const cx = this.opts.orbitCenterX ?? 0
    const cz = this.opts.orbitCenterZ ?? 0
    const x = cx + Math.cos(angle) * this.opts.orbitRadius
    const z = cz + Math.sin(angle) * this.opts.orbitRadius
    const heading = Math.atan2(-Math.sin(angle), Math.cos(angle)) // tangent

    const pose = floatPose(this.opts.field, t, { x, z }, this.halfLength, this.halfWidth)
    this.opts.object.position.set(x, pose.height + 0.05, z)
    this.opts.object.rotation.set(pose.roll, heading - Math.PI / 2, pose.pitch)

    this.wakeAccum += dt
    if (this.wakeAccum >= this.opts.wakeIntervalSec) {
      this.wakeAccum = 0
      // drop two impulses behind the heading, slightly to either side, forming a chevron
      const back = -0.7
      const side = 0.35
      const fwdX = Math.cos(heading)
      const fwdZ = Math.sin(heading)
      const sideX = -fwdZ
      const sideZ = fwdX
      this.opts.field.addImpulse(x + fwdX * back + sideX * side, z + fwdZ * back + sideZ * side, this.opts.wakeIntensity)
      this.opts.field.addImpulse(x + fwdX * back - sideX * side, z + fwdZ * back - sideZ * side, this.opts.wakeIntensity)
    }
  }
}
