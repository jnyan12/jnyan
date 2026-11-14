import { soundEngine } from './audio';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  GRAVITY_DIRECTIONS,
  GRAVITY_INTERVAL,
  GRAVITY_MAGNITUDE,
  GravityIndex,
  InputState,
  LevelDef,
  PLAYER_RADIUS,
  Particle,
  PlayerState,
  RuntimeBumper,
  RuntimeTape,
  RuntimeWall,
} from './types';

export interface CannonSequenceState {
  active: boolean;
  elapsed: number;
  fired: boolean;
  startX: number;
  startY: number;
  currentAngle: number;
  recoil: number;
}

export interface WorldState {
  level: LevelDef;
  player: PlayerState;
  walls: RuntimeWall[];
  tapes: RuntimeTape[];
  bumpers: RuntimeBumper[];
  particles: Particle[];
  gravityIndex: GravityIndex;
  gravityTimer: number; // counts down from 10 to 0
  lastBeepSecond: number;
  levelElapsed: number;
  bounces: number;
  tapeEscapes: number;
  gravityShifts: number;
  screenShake: number;
  gravityShiftFlash: number;
  cannonSeq: CannonSequenceState;
}

export function createWorld(level: LevelDef): WorldState {
  return {
    level,
    player: {
      x: level.spawn.x,
      y: level.spawn.y,
      vx: 0,
      vy: 0,
      radius: PLAYER_RADIUS,
      grounded: false,
      coyoteTimer: 0,
      groundNx: 0,
      groundNy: -1,
      squashX: 1,
      squashY: 1,
      squashAngle: 0,
      stuckTapeId: null,
      peelProgress: 0,
      peelCooldown: 0,
      trail: [],
      eyeLookX: 1,
      eyeLookY: 0,
    },
    walls: level.walls.map((w) => ({
      ...w,
      flex: 0,
      flexVel: 0,
      lastImpactNx: 0,
      lastImpactNy: -1,
      hitFlash: 0,
    })),
    tapes: level.tapes.map((t) => ({
      ...t,
      baseX: t.x,
      baseY: t.y,
      baseAngle: t.angle,
      peelFlash: 0,
    })),
    bumpers: level.bumpers.map((b) => ({
      ...b,
      pulse: 0,
    })),
    particles: [],
    gravityIndex: level.initialGravity,
    gravityTimer: GRAVITY_INTERVAL,
    lastBeepSecond: 4,
    levelElapsed: 0,
    bounces: 0,
    tapeEscapes: 0,
    gravityShifts: 0,
    screenShake: 0,
    gravityShiftFlash: 0,
    cannonSeq: {
      active: false,
      elapsed: 0,
      fired: false,
      startX: 0,
      startY: 0,
      currentAngle: level.cannon.idleAngle,
      recoil: 0,
    },
  };
}

function spawnParticles(
  world: WorldState,
  x: number,
  y: number,
  count: number,
  color: string,
  speedMin: number,
  speedMax: number,
  sizeMin = 2.5,
  sizeMax = 5.5,
  life = 0.45
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    const maxLife = life * (0.7 + Math.random() * 0.6);
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: sizeMin + Math.random() * (sizeMax - sizeMin),
      color,
      alpha: 1,
      life: maxLife,
      maxLife,
    });
  }
}

function spawnDirectionalBurst(
  world: WorldState,
  x: number,
  y: number,
  dirAngle: number,
  spread: number,
  count: number,
  color: string,
  speedMin: number,
  speedMax: number,
  life = 0.6
): void {
  for (let i = 0; i < count; i++) {
    const angle = dirAngle + (Math.random() - 0.5) * spread;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    const maxLife = life * (0.7 + Math.random() * 0.6);
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + Math.random() * 4.5,
      color,
      alpha: 1,
      life: maxLife,
      maxLife,
    });
  }
}

function closestPointOnOBB(
  px: number,
  py: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  angle: number
): { cx: number; cy: number; nx: number; ny: number; dist: number; inside: boolean } {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const dx = px - bx;
  const dy = py - by;

  // Local space coordinates
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;

  const hw = bw / 2;
  const hh = bh / 2;

  const clampedX = Math.max(-hw, Math.min(hw, lx));
  const clampedY = Math.max(-hh, Math.min(hh, ly));

  const diffX = lx - clampedX;
  const diffY = ly - clampedY;
  const distSq = diffX * diffX + diffY * diffY;

  let localNx = 0;
  let localNy = 0;
  let inside = false;
  let dist = Math.sqrt(distSq);

  if (distSq > 1e-6) {
    localNx = diffX / dist;
    localNy = diffY / dist;
  } else {
    inside = true;
    const penX = hw - Math.abs(lx);
    const penY = hh - Math.abs(ly);
    if (penX < penY) {
      localNx = lx >= 0 ? 1 : -1;
      localNy = 0;
      dist = -penX;
    } else {
      localNx = 0;
      localNy = ly >= 0 ? 1 : -1;
      dist = -penY;
    }
  }

  // Rotate closest point and normal back to world space
  const wCos = Math.cos(angle);
  const wSin = Math.sin(angle);
  const cx = bx + (clampedX * wCos - clampedY * wSin);
  const cy = by + (clampedX * wSin + clampedY * wCos);
  const nx = localNx * wCos - localNy * wSin;
  const ny = localNx * wSin + localNy * wCos;

  return { cx, cy, nx, ny, dist, inside };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export interface StepResult {
  cannonCompleted: boolean;
}

export function stepWorld(world: WorldState, input: InputState, rawDt: number): StepResult {
  const dt = Math.max(0, Math.min(rawDt, 0.03));
  if (dt === 0) return { cannonCompleted: false };

  // Update visual wall springs & flashes
  for (const wall of world.walls) {
    if (wall.type === 'elastic') {
      const springForce = -220 * wall.flex - 14 * wall.flexVel;
      wall.flexVel += springForce * dt;
      wall.flex += wall.flexVel * dt;
      if (Math.abs(wall.flex) < 0.02 && Math.abs(wall.flexVel) < 0.05) {
        wall.flex = 0;
        wall.flexVel = 0;
      }
    }
    wall.hitFlash = Math.max(0, wall.hitFlash - dt * 3.5);
  }

  for (const bumper of world.bumpers) {
    bumper.pulse = Math.max(0, bumper.pulse - dt * 4);
  }

  for (const tape of world.tapes) {
    tape.peelFlash = Math.max(0, tape.peelFlash - dt * 3);
  }

  world.screenShake = Math.max(0, world.screenShake - dt * 28);
  world.gravityShiftFlash = Math.max(0, world.gravityShiftFlash - dt * 2.2);

  // Update particles
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      world.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.alpha = Math.max(0, p.life / p.maxLife);
    if (p.ring) {
      p.size += dt * 110;
    }
  }

  // Handle active cannon sequence
  if (world.cannonSeq.active) {
    const seq = world.cannonSeq;
    const cannon = world.level.cannon;
    seq.elapsed += dt;
    seq.recoil = Math.max(0, seq.recoil - dt * 3.8);

    if (!seq.fired) {
      // Load player into cannon & rotate to launchAngle
      const t = Math.min(1, seq.elapsed / 0.42);
      const ease = 1 - Math.pow(1 - t, 3);
      world.player.x = seq.startX + (cannon.x - seq.startX) * ease;
      world.player.y = seq.startY + (cannon.y - seq.startY) * ease;
      world.player.vx = 0;
      world.player.vy = 0;
      seq.currentAngle = lerpAngle(cannon.idleAngle, cannon.launchAngle, ease);

      if (seq.elapsed >= 0.46) {
        seq.fired = true;
        seq.recoil = 1;
        world.screenShake = 9;
        soundEngine.playCannonBlast();

        const muzzleX = cannon.x + Math.cos(cannon.launchAngle) * 32;
        const muzzleY = cannon.y + Math.sin(cannon.launchAngle) * 32;

        // Smoke ring + sparks
        world.particles.push({
          x: muzzleX,
          y: muzzleY,
          vx: Math.cos(cannon.launchAngle) * 60,
          vy: Math.sin(cannon.launchAngle) * 60,
          size: 12,
          color: '#10B981',
          alpha: 1,
          life: 0.55,
          maxLife: 0.55,
          ring: true,
        });
        spawnDirectionalBurst(world, muzzleX, muzzleY, cannon.launchAngle, 0.9, 26, '#34D399', 160, 520, 0.65);
        spawnDirectionalBurst(world, muzzleX, muzzleY, cannon.launchAngle, 0.6, 16, '#FBBF24', 220, 620, 0.55);

        world.player.x = muzzleX;
        world.player.y = muzzleY;
        world.player.vx = Math.cos(cannon.launchAngle) * 1280;
        world.player.vy = Math.sin(cannon.launchAngle) * 1280;
      }
    } else {
      // Player flying out of the cannon
      world.player.x += world.player.vx * dt;
      world.player.y += world.player.vy * dt;
      world.player.trail.push({ x: world.player.x, y: world.player.y, alpha: 0.9 });
      if (world.player.trail.length > 18) world.player.trail.shift();

      if (seq.elapsed >= 1.15) {
        return { cannonCompleted: true };
      }
    }
    return { cannonCompleted: false };
  }

  // Advance elapsed & 10-second clockwise gravity timer
  world.levelElapsed += dt;
  world.gravityTimer -= dt;

  const ceilSec = Math.ceil(world.gravityTimer);
  if (ceilSec <= 3 && ceilSec >= 1 && ceilSec !== world.lastBeepSecond) {
    world.lastBeepSecond = ceilSec;
    soundEngine.playGravityTick();
  }

  if (world.gravityTimer <= 0) {
    world.gravityTimer += GRAVITY_INTERVAL;
    world.lastBeepSecond = 4;
    world.gravityIndex = ((world.gravityIndex + 1) % 4) as GravityIndex;
    world.gravityShifts += 1;
    world.gravityShiftFlash = 1;
    world.screenShake = Math.max(world.screenShake, 4);
    soundEngine.playGravityRotate();

    // Small unstick nudge on gravity shift
    if (world.player.stuckTapeId) {
      world.player.peelProgress += 0.45;
    }
  }

  // Update moving & spinning tapes
  for (const tape of world.tapes) {
    if (tape.moveAxis && tape.moveRange && tape.moveSpeed) {
      const offset = Math.sin(world.levelElapsed * tape.moveSpeed + (tape.movePhase ?? 0)) * tape.moveRange;
      tape.x = tape.baseX + (tape.moveAxis === 'x' ? offset : 0);
      tape.y = tape.baseY + (tape.moveAxis === 'y' ? offset : 0);
    }
    if (tape.spinSpeed) {
      tape.angle = tape.baseAngle + world.levelElapsed * tape.spinSpeed;
    }
  }

  const grav = GRAVITY_DIRECTIONS[world.gravityIndex];
  const player = world.player;

  // Recover squash & stretch smoothly
  player.squashX += (1 - player.squashX) * Math.min(1, dt * 14);
  player.squashY += (1 - player.squashY) * Math.min(1, dt * 14);

  player.peelCooldown = Math.max(0, player.peelCooldown - dt);
  player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);

  // Input vector (keyboard/pad + optional canvas pointer steering)
  let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  if (ix === 0 && iy === 0 && input.pointerActive && input.pointerX != null && input.pointerY != null) {
    const pdx = input.pointerX - player.x;
    const pdy = input.pointerY - player.y;
    const pDist = Math.hypot(pdx, pdy);
    if (pDist > 10) {
      ix = pdx / pDist;
      iy = pdy / pDist;
    }
  }

  // If stuck to tape, handle peeling logic
  if (player.stuckTapeId) {
    const stuckTape = world.tapes.find((t) => t.id === player.stuckTapeId);
    if (!stuckTape) {
      player.stuckTapeId = null;
      player.peelProgress = 0;
    } else {
      // Follow moving tape lightly
      player.vx *= Math.pow(0.015, dt);
      player.vy *= Math.pow(0.015, dt);

      const isDuct = stuckTape.variant === 'duct';
      const hasMoveInput = Math.hypot(ix, iy) > 0.1;
      if (hasMoveInput) {
        player.peelProgress += dt * (isDuct ? 0.95 : 1.75);
      }
      if (input.jumpPressed) {
        player.peelProgress += isDuct ? 0.25 : 0.42;
        player.squashX = 1.18;
        player.squashY = 0.85;
      }
      // Subtle passive tension from gravity pulling against tape
      player.peelProgress += dt * (isDuct ? 0.03 : 0.12);

      if (player.peelProgress >= 1) {
        // Rip free!
        player.stuckTapeId = null;
        player.peelProgress = 0;
        player.peelCooldown = 0.34;
        world.tapeEscapes += 1;
        stuckTape.peelFlash = 1;
        soundEngine.playTapeRip();

        // Launch slightly in input direction or opposite gravity
        let escapeX = ix;
        let escapeY = iy;
        if (Math.hypot(escapeX, escapeY) < 0.1) {
          escapeX = -grav.vx;
          escapeY = -grav.vy;
        }
        const len = Math.hypot(escapeX, escapeY) || 1;
        player.vx = (escapeX / len) * 360;
        player.vy = (escapeY / len) * 360;
        spawnParticles(world, player.x, player.y, 12, '#FBBF24', 70, 210, 2.5, 4.5, 0.4);
      }
    }
  } else {
    // Normal free movement & gravity
    player.vx += grav.vx * GRAVITY_MAGNITUDE * dt;
    player.vy += grav.vy * GRAVITY_MAGNITUDE * dt;

    // Responsive 4-way steering (stronger perpendicular to gravity, supportive along gravity)
    const perpX = Math.abs(grav.vy); // 1 when gravity is vertical
    const perpY = Math.abs(grav.vx); // 1 when gravity is horizontal

    const accelPerp = player.grounded ? 1950 : 1220;
    const accelPara = 760;

    player.vx += ix * (perpX ? accelPerp : accelPara) * dt;
    player.vy += iy * (perpY ? accelPerp : accelPara) * dt;

    // Gentle damping on axis perpendicular to gravity when no input
    if (perpX && Math.abs(ix) < 0.05) {
      player.vx *= Math.pow(player.grounded ? 0.04 : 0.48, dt);
    }
    if (perpY && Math.abs(iy) < 0.05) {
      player.vy *= Math.pow(player.grounded ? 0.04 : 0.48, dt);
    }

    // Jump opposite current gravity (Space OR pressing/pointing strongly against gravity when grounded)
    const pressingAgainstGrav = ix * -grav.vx + iy * -grav.vy > 0.5;
    if ((input.jumpPressed || (pressingAgainstGrav && player.grounded)) && (player.grounded || player.coyoteTimer > 0)) {
      const jumpSpeed = 435;
      // Preserve perpendicular velocity, set velocity along -grav
      const perpVel = player.vx * perpX + player.vy * perpY;
      player.vx = perpX * perpVel + -grav.vx * jumpSpeed;
      player.vy = perpY * perpVel + -grav.vy * jumpSpeed;
      player.grounded = false;
      player.coyoteTimer = 0;
      player.squashAngle = Math.atan2(-grav.vy, -grav.vx);
      player.squashX = 1.28;
      player.squashY = 0.76;
      soundEngine.playJump();
      spawnParticles(world, player.x + grav.vx * 12, player.y + grav.vy * 12, 6, '#94A3B8', 40, 120, 2, 3.5, 0.25);
    }
  }

  // Cap max speed to keep physics crisp
  const maxSpeed = 940;
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > maxSpeed) {
    player.vx = (player.vx / speed) * maxSpeed;
    player.vy = (player.vy / speed) * maxSpeed;
  }

  // Sub-stepped collision integration
  const substeps = 4;
  const subDt = dt / substeps;
  player.grounded = false;

  for (let s = 0; s < substeps; s++) {
    player.x += player.vx * subDt;
    player.y += player.vy * subDt;

    // Wall collisions
    for (const wall of world.walls) {
      const res = closestPointOnOBB(player.x, player.y, wall.x, wall.y, wall.w, wall.h, wall.angle);
      if (res.dist < player.radius) {
        const overlap = player.radius - res.dist;
        player.x += res.nx * overlap;
        player.y += res.ny * overlap;

        const vn = player.vx * res.nx + player.vy * res.ny;
        if (vn < 0) {
          if (wall.type === 'elastic') {
            const factor = wall.bounceFactor ?? 1.32;
            const minSpeed = wall.minBounceSpeed ?? 520;
            const tx = -res.ny;
            const ty = res.nx;
            const vt = player.vx * tx + player.vy * ty;
            const bouncedNormalSpeed = Math.min(880, Math.max(minSpeed, Math.abs(vn) * factor));

            player.vx = res.nx * bouncedNormalSpeed + tx * vt * 0.92;
            player.vy = res.ny * bouncedNormalSpeed + ty * vt * 0.92;

            // Only count & trigger visuals once per frame/impact
            if (wall.hitFlash < 0.4) {
              world.bounces += 1;
              wall.hitFlash = 1;
              wall.flexVel = Math.min(480, Math.max(240, bouncedNormalSpeed * 0.55));
              wall.lastImpactNx = res.nx;
              wall.lastImpactNy = res.ny;
              world.screenShake = Math.max(world.screenShake, Math.min(6, bouncedNormalSpeed / 140));
              player.squashAngle = Math.atan2(res.ny, res.nx);
              player.squashX = 0.68;
              player.squashY = 1.35;
              soundEngine.playElasticBounce(bouncedNormalSpeed / 560);
              spawnParticles(world, res.cx, res.cy, 11, '#FF5E3A', 90, 290, 2.5, 5, 0.4);
            }
          } else {
            // Solid wall
            const impactSpeed = Math.abs(vn);
            const restitution = impactSpeed > 220 ? 0.28 : 0;
            player.vx -= (1 + restitution) * vn * res.nx;
            player.vy -= (1 + restitution) * vn * res.ny;

            // Check if surface supports player against current gravity
            const alignWithUp = res.nx * -grav.vx + res.ny * -grav.vy;
            if (alignWithUp > 0.55) {
              player.grounded = true;
              player.coyoteTimer = 0.12;
              player.groundNx = res.nx;
              player.groundNy = res.ny;
            }

            if (impactSpeed > 180 && wall.hitFlash < 0.2) {
              wall.hitFlash = 0.45;
              player.squashAngle = Math.atan2(res.ny, res.nx);
              player.squashX = 0.82;
              player.squashY = 1.18;
              soundEngine.playSolidHit(impactSpeed / 550);
            }
          }
        }
      }
    }

    // Circular bumper collisions
    for (const bumper of world.bumpers) {
      const dx = player.x - bumper.x;
      const dy = player.y - bumper.y;
      const dist = Math.hypot(dx, dy);
      const minDist = player.radius + bumper.radius;
      if (dist < minDist) {
        const nx = dist > 1e-4 ? dx / dist : 0;
        const ny = dist > 1e-4 ? dy / dist : -1;
        player.x = bumper.x + nx * minDist;
        player.y = bumper.y + ny * minDist;

        const power = bumper.power ?? 560;
        const vn = player.vx * nx + player.vy * ny;
        const launch = Math.max(power, Math.abs(vn) * 1.25);
        player.vx = nx * Math.min(860, launch);
        player.vy = ny * Math.min(860, launch);

        if (bumper.pulse < 0.4) {
          bumper.pulse = 1;
          world.bounces += 1;
          world.screenShake = Math.max(world.screenShake, 4.5);
          player.squashAngle = Math.atan2(ny, nx);
          player.squashX = 0.7;
          player.squashY = 1.32;
          soundEngine.playElasticBounce(1.15);
          spawnParticles(world, bumper.x + nx * bumper.radius, bumper.y + ny * bumper.radius, 12, '#2DD4BF', 90, 260, 2.5, 5, 0.38);
        }
      }
    }

    // Sticky tape collisions
    if (!player.stuckTapeId && player.peelCooldown <= 0) {
      for (const tape of world.tapes) {
        const res = closestPointOnOBB(player.x, player.y, tape.x, tape.y, tape.w, tape.h, tape.angle);
        if (res.dist < player.radius - 1) {
          player.stuckTapeId = tape.id;
          player.peelProgress = 0;
          player.vx *= 0.15;
          player.vy *= 0.15;
          soundEngine.playTapeStick();
          spawnParticles(world, res.cx, res.cy, 6, '#F59E0B', 30, 100, 2, 3.5, 0.25);
          break;
        }
      }
    }

    // Clamp safety within arena bounds
    player.x = Math.max(24 + player.radius, Math.min(ARENA_WIDTH - 24 - player.radius, player.x));
    player.y = Math.max(24 + player.radius, Math.min(ARENA_HEIGHT - 24 - player.radius, player.y));
  }

  // Update eye direction & trail
  if (Math.hypot(player.vx, player.vy) > 25) {
    const vLen = Math.hypot(player.vx, player.vy);
    player.eyeLookX += (player.vx / vLen - player.eyeLookX) * Math.min(1, dt * 12);
    player.eyeLookY += (player.vy / vLen - player.eyeLookY) * Math.min(1, dt * 12);
  }
  player.trail.push({ x: player.x, y: player.y, alpha: 0.5 });
  if (player.trail.length > 10) player.trail.shift();
  for (const t of player.trail) {
    t.alpha *= 0.88;
  }

  // Check cannon capture!
  const cannon = world.level.cannon;
  const distToCannon = Math.hypot(player.x - cannon.x, player.y - cannon.y);
  if (distToCannon < cannon.captureRadius + 6) {
    player.stuckTapeId = null;
    world.cannonSeq = {
      active: true,
      elapsed: 0,
      fired: false,
      startX: player.x,
      startY: player.y,
      currentAngle: cannon.idleAngle,
      recoil: 0,
    };
    soundEngine.playCannonLoad();
  }

  return { cannonCompleted: false };
}
