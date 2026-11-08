import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { PhysicsWorld, RAPIER } from '../src/physics'

const DT = 1 / 60

async function worldWithBall() {
  const physics = await PhysicsWorld.create()
  const body = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0),
  )
  physics.world.createCollider(RAPIER.ColliderDesc.ball(0.1), body)
  const mesh = new THREE.Object3D()
  physics.track(body, mesh)
  const steps = vi.spyOn(physics.world, 'step')
  return { physics, body, mesh, steps }
}

describe('PhysicsWorld fixed timestep', () => {
  it('steps once per 1/60 s of elapsed time, carrying remainders across frames', async () => {
    const { physics, steps } = await worldWithBall()
    // 120 Hz display: every other frame owes a physics step
    for (let i = 0; i < 10; i++) physics.step(DT / 2 + 1e-9)
    expect(steps).toHaveBeenCalledTimes(5)
    // 30 Hz display: two steps per frame
    steps.mockClear()
    for (let i = 0; i < 4; i++) physics.step(DT * 2 + 1e-9)
    expect(steps).toHaveBeenCalledTimes(8)
  })

  it('caps catch-up at 5 steps after a long stall (e.g. a backgrounded tab)', async () => {
    const { physics, steps } = await worldWithBall()
    physics.step(3)
    expect(steps).toHaveBeenCalledTimes(5)
    // the stall is dropped, not paid back on later frames
    steps.mockClear()
    physics.step(0)
    expect(steps).not.toHaveBeenCalled()
  })

  it('syncs tracked meshes to their bodies after stepping', async () => {
    const { physics, body, mesh } = await worldWithBall()
    body.setAngvel({ x: 0, y: 3, z: 0 }, true)
    for (let i = 0; i < 20; i++) physics.step(DT)
    const t = body.translation()
    const r = body.rotation()
    expect(t.y).toBeLessThan(2) // it fell
    expect(mesh.position.toArray()).toEqual([t.x, t.y, t.z])
    expect(mesh.quaternion.toArray()).toEqual([r.x, r.y, r.z, r.w])
  })

  it('has a ground plane at y = 0', async () => {
    const { physics, body } = await worldWithBall()
    for (let i = 0; i < 180; i++) physics.step(DT)
    expect(body.translation().y).toBeCloseTo(0.1, 2) // ball radius
  })
})
