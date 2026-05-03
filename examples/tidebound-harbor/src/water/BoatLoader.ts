import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'

export interface LoadedBoat {
  object: THREE.Object3D
  dispose: () => void
}

export async function loadKenneySailboatA(baseUrl: string = '/kenney_watercraft/'): Promise<LoadedBoat> {
  const mtlLoader = new MTLLoader()
  mtlLoader.setPath(baseUrl)
  const materials = await new Promise<unknown>((resolve, reject) => {
    mtlLoader.load('boat-sail-a.mtl', resolve as never, undefined, reject as never)
  })
  ;(materials as { preload: () => void }).preload()

  const objLoader = new OBJLoader()
  objLoader.setMaterials(materials as never)
  objLoader.setPath(baseUrl)

  const obj = await new Promise<THREE.Group>((resolve, reject) => {
    objLoader.load('boat-sail-a.obj', resolve, undefined, reject as never)
  })

  // Kenney watercraft pack ships at metric scale; the playground uses ~12-unit half-extent,
  // and a sailboat reading well at gameplay zoom needs to be roughly 2 world units long.
  // The raw mesh tends to be too large; scale to fit.
  const box = new THREE.Box3().setFromObject(obj)
  const size = new THREE.Vector3()
  box.getSize(size)
  const targetLength = 2.0
  const scale = targetLength / Math.max(size.x, size.z, 0.001)
  obj.scale.setScalar(scale)
  obj.position.y = 0

  // disable shadow contributions; let pixelate handle look
  obj.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = false
      node.receiveShadow = false
    }
  })

  return {
    object: obj,
    dispose: () => {
      obj.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          const mat = node.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else if (mat) (mat as THREE.Material).dispose()
        }
      })
    },
  }
}
