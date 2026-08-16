import * as THREE from 'three'
import { createScene } from './scene'
import { PhysicsWorld, RAPIER } from './physics'

async function main() {
  const container = document.getElementById('app')!
  const { scene, camera, renderer, controls } = createScene(container)
  const physics = await PhysicsWorld.create()

  // Placeholder dynamic body: a cube dropped from above to prove the
  // physics/render pipeline works end to end. Replaced by the cat ragdoll
  // in milestone 2 (see PLAN.md).
  const cubeBody = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 3, 0)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.2, 0.6))),
  )
  physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25).setRestitution(0.4),
    cubeBody,
  )
  const cubeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xe8a04c, roughness: 0.5 }),
  )
  cubeMesh.castShadow = true
  scene.add(cubeMesh)
  physics.track(cubeBody, cubeMesh)

  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    physics.step(clock.getDelta())
    controls.update()
    renderer.render(scene, camera)
  })
}

main()
