import * as THREE from 'three';

export interface PhysicsBody {
  id: string | number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  angularVelocity: THREE.Vector3;
  radius: number;
  mass: number;
  restitution: number;
  friction: number;
  isSettled: boolean;
  settleTimer: number;
  targetSlot?: { x: number; y: number; z: number };
}

/**
 * Continuous physical simulation for marbles settling inside the 3D bowl.
 * Handles gravity, static bowl boundary collision, rim constraint,
 * dynamic marble-to-marble impulse collision, and rotation.
 */
export class BowlPhysicsWorld {
  bodies: Map<string | number, PhysicsBody> = new Map();
  gravity: number = 14.0;
  sphereRadius: number = 0.19;
  rimRadius: number = 0.85;
  accumulator: number = 0;
  getFloorY: (r: number) => number;

  constructor(
    getFloorY: (r: number) => number,
    sphereRadius = 0.19,
    rimRadius = 0.85
  ) {
    this.getFloorY = getFloorY;
    this.sphereRadius = sphereRadius;
    this.rimRadius = rimRadius;
  }

  addBody(body: PhysicsBody) {
    this.bodies.set(body.id, body);
  }

  removeBody(id: string | number) {
    this.bodies.delete(id);
  }

  hasBody(id: string | number): boolean {
    return this.bodies.has(id);
  }

  getBody(id: string | number): PhysicsBody | undefined {
    return this.bodies.get(id);
  }

  clear() {
    this.bodies.clear();
    this.accumulator = 0;
  }

  /**
   * Sub-stepped physics integration tick.
   * Fixed time step (1/60s) ensures deterministic numerical stability.
   */
  step(fixedTimeStep = 1 / 60, dt = 1 / 60, maxSubSteps = 3) {
    const clampedDt = Math.min(dt, 0.1);
    this.accumulator += clampedDt;
    let steps = 0;
    while (this.accumulator >= fixedTimeStep && steps < maxSubSteps) {
      this.subStep(fixedTimeStep);
      this.accumulator -= fixedTimeStep;
      steps++;
    }
  }

  private subStep(dt: number) {
    const bodyList = Array.from(this.bodies.values());
    if (bodyList.length === 0) return;

    // 1. Force & velocity integration
    for (let i = 0; i < bodyList.length; i++) {
      const b = bodyList[i];
      if (b.isSettled) continue;

      // Downward gravity
      b.velocity.y -= this.gravity * dt;

      // Inward centripetal slope attraction so marbles roll naturally to bowl bottom
      const rc = Math.hypot(b.position.x, b.position.z);
      if (rc > 0.01) {
        const pull = Math.min(3.5, rc * 2.2);
        b.velocity.x -= (b.position.x / rc) * pull * dt;
        b.velocity.z -= (b.position.z / rc) * pull * dt;
      }

      // Air resistance / fluid drag
      b.velocity.x *= 1 - Math.min(1, dt * 1.2);
      b.velocity.z *= 1 - Math.min(1, dt * 1.2);

      // Position integration
      b.position.x += b.velocity.x * dt;
      b.position.y += b.velocity.y * dt;
      b.position.z += b.velocity.z * dt;

      // Convergence towards resting slot pocket if nearby
      if (b.targetSlot) {
        const dx = b.targetSlot.x - b.position.x;
        const dz = b.targetSlot.z - b.position.z;
        const distToSlot = Math.hypot(dx, dz);
        if (distToSlot < 0.18) {
          const converge = Math.min(1, dt * 4.5);
          b.position.x += dx * converge;
          b.position.z += dz * converge;
        }
      }

      // Roll quaternion update from velocity
      const horizSpeed = Math.hypot(b.velocity.x, b.velocity.z);
      if (horizSpeed > 0.001) {
        const axisX = -b.velocity.z / horizSpeed;
        const axisZ = b.velocity.x / horizSpeed;
        const angle = (horizSpeed / b.radius) * dt;
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(axisX, 0, axisZ),
          angle
        );
        b.quaternion.premultiply(rotQuat);
      }
    }

    // 2. Static Bowl Boundary Collisions (Parabolic/curved floor + Glass rim constraint)
    for (let i = 0; i < bodyList.length; i++) {
      const b = bodyList[i];

      // Rim constraint
      const rc = Math.hypot(b.position.x, b.position.z);
      if (rc > this.rimRadius && rc > 1e-5) {
        const scale = this.rimRadius / rc;
        b.position.x *= scale;
        b.position.z *= scale;
        const vDot = (b.velocity.x * b.position.x + b.velocity.z * b.position.z) / (rc * rc);
        if (vDot > 0) {
          b.velocity.x -= b.position.x * vDot * 1.5;
          b.velocity.z -= b.position.z * vDot * 1.5;
        }
      }

      // Interior floor collision
      const floorY = this.getFloorY(Math.hypot(b.position.x, b.position.z));
      const targetMinY = b.targetSlot ? Math.max(floorY, b.targetSlot.y) : floorY;

      if (b.position.y <= targetMinY) {
        b.position.y = targetMinY;
        if (b.velocity.y < 0) {
          if (Math.abs(b.velocity.y) > 0.6) {
            b.velocity.y = -b.velocity.y * b.restitution;
          } else {
            b.velocity.y = 0;
          }
        }
        b.velocity.x *= 1 - Math.min(1, dt * 5.0 * b.friction);
        b.velocity.z *= 1 - Math.min(1, dt * 5.0 * b.friction);

        // Settling detection
        const speedSq = b.velocity.lengthSq();
        if (speedSq < 0.015) {
          b.settleTimer += dt;
          if (b.settleTimer > 0.4) {
            b.isSettled = true;
            b.velocity.set(0, 0, 0);
            if (b.targetSlot) {
              b.position.set(b.targetSlot.x, b.targetSlot.y, b.targetSlot.z);
            }
          }
        } else {
          b.settleTimer = 0;
        }
      }
    }

    // 3. Dynamic Marble-to-Marble Sphere Collisions
    const minDist = 2 * this.sphereRadius;
    const minDistSq = minDist * minDist;

    for (let i = 0; i < bodyList.length; i++) {
      const b1 = bodyList[i];
      for (let j = i + 1; j < bodyList.length; j++) {
        const b2 = bodyList[j];

        const dx = b1.position.x - b2.position.x;
        const dy = b1.position.y - b2.position.y;
        const dz = b1.position.z - b2.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < minDistSq && distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;

          // Wake up sleeping bodies on impact
          b1.isSettled = false;
          b2.isSettled = false;
          b1.settleTimer = 0;
          b2.settleTimer = 0;

          // Position separation
          b1.position.x += nx * overlap * 0.5;
          b1.position.y += ny * overlap * 0.5;
          b1.position.z += nz * overlap * 0.5;

          b2.position.x -= nx * overlap * 0.5;
          b2.position.y -= ny * overlap * 0.5;
          b2.position.z -= nz * overlap * 0.5;

          // Elastic collision impulse
          const rvx = b1.velocity.x - b2.velocity.x;
          const rvy = b1.velocity.y - b2.velocity.y;
          const rvz = b1.velocity.z - b2.velocity.z;

          const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;

          if (velAlongNormal < 0) {
            const restitution = (b1.restitution + b2.restitution) * 0.5;
            const impulse = -(1 + restitution) * velAlongNormal * 0.5;

            b1.velocity.x += nx * impulse;
            b1.velocity.y += ny * impulse;
            b1.velocity.z += nz * impulse;

            b2.velocity.x -= nx * impulse;
            b2.velocity.y -= ny * impulse;
            b2.velocity.z -= nz * impulse;
          }
        }
      }
    }
  }
}
