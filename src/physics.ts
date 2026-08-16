import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'

const FIXED_DT = 1 / 60
const MAX_SUBSTEPS = 5

/** A rigid body paired with the mesh that visualizes it. */
interface BodyMeshPair {
  body: RAPIER.RigidBody
  mesh: THREE.Object3D
}

export class PhysicsWorld {
  readonly world: RAPIER.World
  private pairs: BodyMeshPair[] = []
  private accumulator = 0

  private constructor(world: RAPIER.World) {
    this.world = world
    this.world.timestep = FIXED_DT
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init()
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    // Static ground collider matching the visual floor plane.
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(20, 0.1, 20).setTranslation(0, -0.1, 0),
    )

    return new PhysicsWorld(world)
  }

  /** Register a body whose transform should drive a mesh each frame. */
  track(body: RAPIER.RigidBody, mesh: THREE.Object3D): void {
    this.pairs.push({ body, mesh })
  }

  /** Advance the simulation on a fixed timestep and sync tracked meshes. */
  step(elapsed: number): void {
    this.accumulator = Math.min(this.accumulator + elapsed, FIXED_DT * MAX_SUBSTEPS)
    while (this.accumulator >= FIXED_DT) {
      this.world.step()
      this.accumulator -= FIXED_DT
    }

    for (const { body, mesh } of this.pairs) {
      const t = body.translation()
      const r = body.rotation()
      mesh.position.set(t.x, t.y, t.z)
      mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }
}

export { RAPIER }
