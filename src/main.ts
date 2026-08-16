import * as THREE from 'three'
import { createScene } from './scene'
import { PhysicsWorld } from './physics'
import { createCat } from './cat'

async function main() {
  const container = document.getElementById('app')!
  const { scene, camera, renderer, controls } = createScene(container)
  const physics = await PhysicsWorld.create()

  const cat = createCat(physics, scene)

  // Debug: space shoves the cat so we can judge ragdoll stability.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') cat.boop()
  })
  // Debug handle for poking the sim from the console.
  ;(window as unknown as Record<string, unknown>).__sim = { cat, physics, camera, controls }

  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    physics.step(clock.getDelta())
    controls.update()
    renderer.render(scene, camera)
  })
}

main()
