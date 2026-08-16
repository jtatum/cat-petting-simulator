# Cat Petting Simulator — Project Plan

A 3D physics toy: you drive a ragdoll-ish arm with the mouse and pet a
physically simulated cat. The cat reacts. Everyone is happy.

## Stack

- **Three.js** — rendering. No engine/editor needed at this scope.
- **Rapier** (`@dimforge/rapier3d-compat`, WASM) — physics. Chosen over
  cannon-es for joint stability and motorized joints, which the arm and
  ragdoll both depend on.
- **Vite + TypeScript** — build/dev.

## Architecture notes

- Physics runs on a fixed 60 Hz timestep (accumulator in `physics.ts`);
  rendering is uncapped. Add render interpolation later if stepping is
  visible.
- Meshes are dumb visualizations of rigid bodies via `PhysicsWorld.track()`.
  Game logic reads/writes the physics world, never mesh transforms.
- The arm is driven by *forces/motors toward a target*, never by setting
  positions directly — that's what keeps contact with the cat soft and
  believable.

## Milestones

### 1. Scene + physics bootstrap ✅ (scaffold)
Three.js scene, lighting, shadows, orbit camera, Rapier world with ground,
fixed-timestep loop, falling test cube proving the pipeline.

### 2. The cat (ragdoll)
- Rigid bodies: torso (2 segments), head, 4 legs (2 segments each), tail
  (3+ segments). Capsule colliders, placeholder materials.
- Spherical/revolute joints with limits; light joint damping so it flops
  but doesn't spasm.
- Gentle "muscle tone": weak motors biasing joints toward a lying-down
  pose so the cat rests naturally instead of pancaking.
- Tune masses/damping until dropping the cat looks funny but not broken.

### 3. The arm
- Kinematic shoulder anchor at screen edge + articulated upper arm /
  forearm / hand (paddle-shaped collider).
- Mouse raycast onto an interaction plane → target point; joint motors /
  spring forces pull the hand toward it. Scroll or key to raise/lower.
- Tune so the arm feels weighty but responsive — this is the core feel of
  the game and deserves real iteration time.

### 4. Petting mechanics
- Contact detection (hand ↔ cat body parts) via Rapier contact events.
- A "stroke" = sustained contact + tangential hand velocity within a speed
  band. Too fast or poking = bad pet.
- Purr meter: rises on good strokes (head/back bonus), decays over time,
  drops on bad contact.

### 5. Reactions & juice
- Cat state machine: content → purring → overstimulated (bats at hand /
  rolls away) based on meter and recent input.
- Purr audio (loop volume tied to meter), heart particles, tail-swish
  driven by joint motors, subtle camera nudge.

### 6. Polish
- Replace capsules with a simple modeled/skinned cat, fur-ish material.
- Sound design, menu/title, pettable-spot variety (chin scritches),
  maybe multiple cats.

## Risks / open questions

- **Ragdoll stability** is the big one — joint tuning can eat days.
  Mitigation: keep masses uniform-ish, use CCD on the hand, damp early.
- Should the cat ever *stand/walk*? Active ragdoll locomotion is a huge
  step up in complexity. Deferred until the petting loop is fun.
- Mobile/touch support — not a goal for now.
