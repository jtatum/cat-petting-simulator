import * as THREE from 'three'
import { PhysicsWorld, RAPIER } from './physics'

const FUR = 0xe8963c
const FUR_LIGHT = 0xf5e6c8
const DARK = 0x3a2e26

// Muscle tone: weak position motors biasing joints toward the build pose so
// the cat rests naturally instead of pancaking. Torque is capped so the cat
// always loses to gravity and to the player's hand.
const TONE = { stiffness: 40, damping: 5, maxTorque: 1.5 }
// The neck needs enough torque to hold the head up while resting (~1.3 N·m
// of gravity torque at this head mass/lever), or the cat face-plants.
const NECK_TONE = { stiffness: 60, damping: 6, maxTorque: 3 }
// Limbs get firmer tone than the spine so legs tuck under the body rather
// than splaying flat like roadkill.
const LIMB_TONE = { stiffness: 60, damping: 6, maxTorque: 2.5 }
const TAIL_TONE = { stiffness: 25, damping: 2.5, maxTorque: 0.4 }

// Flesh-ish density (kg/m³) so the whole cat masses a few kilograms and
// impulses/torques stay in intuitive units. Rapier's default density of 1
// makes a gram-scale cat that any force launches into orbit.
const BODY_DENSITY = 300

const ANG_AXES = [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ]

export interface CatPart {
  body: RAPIER.RigidBody
  mesh: THREE.Group
}

export interface Cat {
  parts: Map<string, CatPart>
  /** Debug helper: shove the cat to check ragdoll stability. */
  boop(): void
}

/** Orientation of a capsule collider/mesh, which are Y-aligned by default. */
type Axis = 'x' | 'y'

const AXIS_ROT: Record<Axis, THREE.Quaternion> = {
  x: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
  y: new THREE.Quaternion(),
}

export function createCat(physics: PhysicsWorld, scene: THREE.Scene): Cat {
  const parts = new Map<string, CatPart>()

  function part(
    name: string,
    pos: [number, number, number],
    shape: { capsule?: [halfHeight: number, radius: number, axis: Axis]; ball?: number },
    color = FUR,
  ): CatPart {
    const body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos[0], pos[1] + DROP_HEIGHT, pos[2])
        .setLinearDamping(0.3)
        .setAngularDamping(2),
    )

    const mesh = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
    let inner: THREE.Mesh

    if (shape.capsule) {
      const [halfHeight, radius, axis] = shape.capsule
      physics.world.createCollider(
        RAPIER.ColliderDesc.capsule(halfHeight, radius)
          .setRotation(AXIS_ROT[axis])
          .setFriction(0.8)
          .setDensity(BODY_DENSITY),
        body,
      )
      inner = new THREE.Mesh(new THREE.CapsuleGeometry(radius, halfHeight * 2, 8, 16), material)
      inner.quaternion.copy(AXIS_ROT[axis])
    } else {
      const radius = shape.ball!
      physics.world.createCollider(
        RAPIER.ColliderDesc.ball(radius).setFriction(0.8).setDensity(BODY_DENSITY),
        body,
      )
      inner = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material)
    }

    inner.castShadow = true
    mesh.add(inner)
    scene.add(mesh)
    physics.track(body, mesh)

    const catPart = { body, mesh }
    parts.set(name, catPart)
    return catPart
  }

  /**
   * Joint two parts at a world-space point (in build-pose coordinates).
   * All bodies are axis-aligned in the build pose, so local anchors are just
   * world point minus body center.
   */
  function anchorsFor(a: CatPart, b: CatPart, world: [number, number, number]) {
    const ta = a.body.translation()
    const tb = b.body.translation()
    const y = world[1] + DROP_HEIGHT
    return {
      a1: { x: world[0] - ta.x, y: y - ta.y, z: world[2] - ta.z },
      a2: { x: world[0] - tb.x, y: y - tb.y, z: world[2] - tb.z },
    }
  }

  function socket(
    a: CatPart,
    b: CatPart,
    world: [number, number, number],
    tone = TONE,
  ): RAPIER.SphericalImpulseJoint {
    const { a1, a2 } = anchorsFor(a, b, world)
    const joint = physics.world.createImpulseJoint(
      RAPIER.JointData.spherical(a1, a2),
      a.body,
      b.body,
      true,
    ) as RAPIER.SphericalImpulseJoint
    // rapier3d-compat 0.20 bundling bug: the joint factory wraps spherical
    // joints in a stub class missing the per-axis motor methods, while the
    // exported SphericalImpulseJoint class has them. Re-point the prototype.
    Object.setPrototypeOf(joint, RAPIER.SphericalImpulseJoint.prototype)
    joint.setContactsEnabled(false)
    for (const axis of ANG_AXES) {
      joint.configureMotorPosition(axis, 0, tone.stiffness, tone.damping)
      joint.setMotorMaxForce(axis, tone.maxTorque)
    }
    return joint
  }

  function hinge(
    a: CatPart,
    b: CatPart,
    world: [number, number, number],
    limits: [number, number],
  ): RAPIER.RevoluteImpulseJoint {
    const { a1, a2 } = anchorsFor(a, b, world)
    const joint = physics.world.createImpulseJoint(
      RAPIER.JointData.revolute(a1, a2, { x: 0, y: 0, z: 1 }),
      a.body,
      b.body,
      true,
    ) as RAPIER.RevoluteImpulseJoint
    joint.setContactsEnabled(false)
    joint.setLimits(limits[0], limits[1])
    joint.configureMotorPosition(0, TONE.stiffness, TONE.damping)
    joint.setMotorMaxForce(TONE.maxTorque)
    return joint
  }

  // --- Build pose: standing on the ground plane, facing +X. ---

  const hips = part('hips', [-0.13, 0.33, 0], { capsule: [0.09, 0.11, 'x'] })
  const chest = part('chest', [0.13, 0.33, 0], { capsule: [0.09, 0.11, 'x'] })
  const head = part('head', [0.42, 0.47, 0], { ball: 0.095 })

  socket(hips, chest, [0, 0.33, 0])
  socket(chest, head, [0.3, 0.4, 0], NECK_TONE)

  // Legs: upper segment torso→knee, lower segment knee→paw.
  // Front knees fold backward, rear hocks fold forward.
  for (const side of [-1, 1] as const) {
    for (const end of ['front', 'rear'] as const) {
      const x = end === 'front' ? 0.2 : -0.2
      const z = side * 0.1
      const torso = end === 'front' ? chest : hips
      const kneeLimits: [number, number] = end === 'front' ? [-1.9, 0.15] : [-0.15, 1.9]

      const upper = part(`${end}-upper-${side}`, [x, 0.235, z], {
        capsule: [0.03, 0.035, 'y'],
      })
      const lower = part(
        `${end}-lower-${side}`,
        [x, 0.1, z],
        { capsule: [0.04, 0.03, 'y'] },
        FUR_LIGHT,
      )
      socket(torso, upper, [x, 0.3, z], LIMB_TONE)
      hinge(upper, lower, [x, 0.17, z], kneeLimits)
    }
  }

  // Tail: a floppy chain off the back of the hips. The first joint sits just
  // past the hip capsule's end cap (x ≈ -0.33) so the tail actually
  // protrudes, and segments staircase upward so the tone motors hold a
  // gentle upright curl.
  let prev = hips
  let jointX = -0.33
  for (let i = 0; i < 3; i++) {
    const y = 0.36 + i * 0.04
    const seg = part(
      `tail-${i}`,
      [jointX - 0.06, y + 0.02, 0],
      { capsule: [0.035, 0.026, 'x'] },
      i === 2 ? FUR_LIGHT : FUR,
    )
    socket(prev, seg, [jointX, y, 0], TAIL_TONE)
    prev = seg
    jointX -= 0.12
  }

  addFace(head.mesh)

  return {
    parts,
    boop() {
      const target = Math.random() < 0.5 ? hips : chest
      // Impulse scaled by mass → a consistent ~2.5 m/s hop regardless of tuning.
      const m = target.body.mass()
      target.body.applyImpulse(
        { x: (Math.random() - 0.5) * m, y: 2.5 * m, z: (Math.random() - 0.5) * m },
        true,
      )
    },
  }
}

const DROP_HEIGHT = 0.05

/** Purely cosmetic ears/eyes/nose so the capsule pile reads as a cat. */
function addFace(headMesh: THREE.Group) {
  const fur = new THREE.MeshStandardMaterial({ color: FUR, roughness: 0.85 })
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.4 })

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), fur)
    ear.position.set(-0.01, 0.085, side * 0.055)
    ear.rotation.x = side * 0.25
    ear.castShadow = true
    headMesh.add(ear)

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), dark)
    eye.position.set(0.075, 0.02, side * 0.04)
    headMesh.add(eye)
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), dark)
  nose.position.set(0.092, -0.015, 0)
  nose.scale.set(0.7, 0.7, 1)
  headMesh.add(nose)
}
