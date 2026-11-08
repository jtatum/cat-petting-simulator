import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCat, type Cat } from '../src/cat'
import { PhysicsWorld } from '../src/physics'

const DT = 1 / 60

async function droppedCat() {
  const physics = await PhysicsWorld.create()
  const scene = new THREE.Scene()
  const cat = createCat(physics, scene)
  return { physics, scene, cat }
}

function run(physics: PhysicsWorld, seconds: number) {
  for (let i = 0; i < Math.round(seconds / DT); i++) physics.step(DT)
}

function maxSpeed(cat: Cat) {
  let max = 0
  for (const { body } of cat.parts.values()) {
    const v = body.linvel()
    max = Math.max(max, Math.hypot(v.x, v.y, v.z))
  }
  return max
}

/** the ragdoll is whole: everything above the floor and near the torso */
function expectIntact(cat: Cat) {
  const hips = cat.parts.get('hips')!.body.translation()
  for (const [name, { body }] of cat.parts) {
    const t = body.translation()
    expect(Number.isFinite(t.x + t.y + t.z), name).toBe(true)
    expect(t.y, `${name} sank into the floor`).toBeGreaterThan(0.02)
    expect(Math.hypot(t.x - hips.x, t.z - hips.z), `${name} flew off`).toBeLessThan(0.7)
  }
}

describe('ragdoll cat', () => {
  afterEach(() => vi.restoreAllMocks())

  it('builds 14 bodies, each with a tracked mesh in the scene', async () => {
    const { scene, cat } = await droppedCat()
    expect(cat.parts.size).toBe(14)
    for (const { mesh } of cat.parts.values()) expect(mesh.parent).toBe(scene)
  })

  it('drops, settles to rest within two seconds, and stays in one piece', async () => {
    const { physics, cat } = await droppedCat()
    run(physics, 2)
    expect(maxSpeed(cat)).toBeLessThan(0.01)
    expectIntact(cat)
    // lying down, but the torso rests on its capsules rather than pancaking
    expect(cat.parts.get('hips')!.body.translation().y).toBeGreaterThan(0.09)
    expect(cat.parts.get('chest')!.body.translation().y).toBeGreaterThan(0.09)
  })

  it('stays at rest: muscle tone does not jitter or creep once settled', async () => {
    const { physics, cat } = await droppedCat()
    run(physics, 2)
    const before = [...cat.parts.values()].map(({ body }) => body.translation())
    run(physics, 3)
    const after = [...cat.parts.values()].map(({ body }) => body.translation())
    for (let i = 0; i < before.length; i++) {
      const d = Math.hypot(
        after[i]!.x - before[i]!.x,
        after[i]!.y - before[i]!.y,
        after[i]!.z - before[i]!.z,
      )
      expect(d).toBeLessThan(0.005)
    }
  })

  it('boop gives a mass-independent ~2.5 m/s hop and the cat recovers', async () => {
    const { physics, cat } = await droppedCat()
    run(physics, 2)
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // → chest, straight up
    cat.boop()
    const v = cat.parts.get('chest')!.body.linvel()
    expect(v.y).toBeCloseTo(2.5, 5)
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(0, 5)

    vi.restoreAllMocks()
    run(physics, 3)
    expect(maxSpeed(cat)).toBeLessThan(0.01)
    expectIntact(cat)
  })

  it('is deterministic: the same drop lands in the same pose', async () => {
    const a = await droppedCat()
    const b = await droppedCat()
    run(a.physics, 2)
    run(b.physics, 2)
    for (const [name, { body }] of a.cat.parts) {
      expect(b.cat.parts.get(name)!.body.translation()).toEqual(body.translation())
    }
  })
})
