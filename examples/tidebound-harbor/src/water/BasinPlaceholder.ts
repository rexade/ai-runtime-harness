import * as THREE from 'three'
import type { LandBox } from './ShoreSDF'

export class BasinPlaceholder {
  readonly group: THREE.Group
  readonly lands: LandBox[]

  constructor() {
    this.group = new THREE.Group()
    this.lands = []

    // Seafloor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(24, 1, 24),
      new THREE.MeshBasicMaterial({ color: 0x3b3122 }),
    )
    floor.position.y = -1.5
    this.group.add(floor)

    // Island block (one)
    const island = new THREE.Mesh(
      new THREE.BoxGeometry(5, 1.6, 4),
      new THREE.MeshBasicMaterial({ color: 0x498f5a }),
    )
    island.position.set(-4, 0.3, -3)
    this.group.add(island)
    // beach skirt
    const beach = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.4, 4.6),
      new THREE.MeshBasicMaterial({ color: 0xd6b76a }),
    )
    beach.position.set(-4, -0.5, -3)
    this.group.add(beach)
    this.lands.push({ minX: -6.5, maxX: -1.5, minZ: -5, maxZ: -1 })

    // Dock post (one)
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 2.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x6b4a30 }),
    )
    post.position.set(2.5, 0.7, 0.5)
    this.group.add(post)
    this.lands.push({ minX: 2.3, maxX: 2.7, minZ: 0.3, maxZ: 0.7 })

    // Rock (one)
    const rock = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x55514a }),
    )
    rock.position.set(4.5, 0.0, 3.0)
    this.group.add(rock)
    this.lands.push({ minX: 4.05, maxX: 4.95, minZ: 2.55, maxZ: 3.45 })
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        ;(obj.material as THREE.Material).dispose()
      }
    })
  }
}
