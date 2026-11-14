import { WorldState } from './physics';
import { ARENA_HEIGHT, ARENA_WIDTH, GRAVITY_DIRECTIONS, RuntimeTape, RuntimeWall } from './types';

function drawBlueprintGrid(ctx: CanvasRenderingContext2D, world: WorldState): void {
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  // Subtle radial workshop glow near center & cannon
  const cannon = world.level.cannon;
  const glow = ctx.createRadialGradient(cannon.x, cannon.y, 12, cannon.x, cannon.y, 150);
  glow.addColorStop(0, 'rgba(16, 185, 129, 0.16)');
  glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  // Fine blueprint grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.055)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 48; x < ARENA_WIDTH; x += 48) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA_HEIGHT);
  }
  for (let y = 48; y < ARENA_HEIGHT; y += 48) {
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA_WIDTH, y);
  }
  ctx.stroke();

  // Subtle gravity drift lines in background so player feels current gravity pull
  const grav = GRAVITY_DIRECTIONS[world.gravityIndex];
  const t = world.levelElapsed;
  ctx.save();
  ctx.strokeStyle =
    world.gravityTimer <= 2.5
      ? `rgba(245, 158, 11, ${0.12 + 0.08 * Math.sin(t * 14)})`
      : 'rgba(56, 189, 248, 0.09)';
  ctx.lineWidth = 1.5;

  const spacing = 120;
  for (let gx = 80; gx < ARENA_WIDTH - 40; gx += spacing) {
    for (let gy = 70; gy < ARENA_HEIGHT - 40; gy += spacing) {
      const drift = (t * 48) % 36;
      const sx = gx + grav.vx * drift;
      const sy = gy + grav.vy * drift;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + grav.vx * 18, sy + grav.vy * 18);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Brief flash border when gravity rotates clockwise
  if (world.gravityShiftFlash > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(56, 189, 248, ${world.gravityShiftFlash * 0.55})`;
    ctx.lineWidth = 6;
    ctx.strokeRect(27, 27, ARENA_WIDTH - 54, ARENA_HEIGHT - 54);
    ctx.restore();
  }
}

function drawWall(ctx: CanvasRenderingContext2D, wall: RuntimeWall): void {
  ctx.save();
  ctx.translate(wall.x, wall.y);
  ctx.rotate(wall.angle);

  const hw = wall.w / 2;
  const hh = wall.h / 2;

  if (wall.type === 'solid') {
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, wall.w, wall.h, 4);
    ctx.fill();

    ctx.strokeStyle = wall.hitFlash > 0 ? '#94A3B8' : '#334155';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Subtle inner highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(-hw + 3, -hh + 2, Math.max(0, wall.w - 6), Math.min(4, wall.h - 4));
  } else {
    // Elastic wall: draw bowed rubber band along its longer axis!
    const isHorizontal = wall.w >= wall.h;
    // Transform world impact normal into local wall flex
    const cos = Math.cos(-wall.angle);
    const sin = Math.sin(-wall.angle);
    const localNx = wall.lastImpactNx * cos - wall.lastImpactNy * sin;
    const localNy = wall.lastImpactNx * sin + wall.lastImpactNy * cos;
    const flexDir = isHorizontal ? -Math.sign(localNy || 1) : -Math.sign(localNx || 1);
    const bend = wall.flex * 0.45 * flexDir;

    // Backing shadow groove
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, wall.w, wall.h, 6);
    ctx.fill();

    // Stretchy rubber body
    const flashBoost = wall.hitFlash;
    const grad = isHorizontal
      ? ctx.createLinearGradient(0, -hh, 0, hh)
      : ctx.createLinearGradient(-hw, 0, hw, 0);
    grad.addColorStop(0, flashBoost > 0.2 ? '#FF8E72' : '#FF5E3A');
    grad.addColorStop(0.5, '#FB714E');
    grad.addColorStop(1, '#E04422');

    ctx.fillStyle = grad;
    ctx.beginPath();
    if (isHorizontal) {
      ctx.moveTo(-hw + 4, -hh);
      ctx.quadraticCurveTo(0, -hh + bend, hw - 4, -hh);
      ctx.lineTo(hw - 4, hh);
      ctx.quadraticCurveTo(0, hh + bend, -hw + 4, hh);
      ctx.closePath();
    } else {
      ctx.moveTo(-hw, -hh + 4);
      ctx.quadraticCurveTo(-hw + bend, 0, -hw, hh - 4);
      ctx.lineTo(hw, hh - 4);
      ctx.quadraticCurveTo(hw + bend, 0, hw, -hh + 4);
      ctx.closePath();
    }
    ctx.fill();

    // Ribbed traction stripes on elastic band
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1.5;
    if (isHorizontal && wall.w > 48) {
      for (let rx = -hw + 20; rx <= hw - 20; rx += 18) {
        const t = (rx + hw) / wall.w;
        const yOff = 4 * t * (1 - t) * bend;
        ctx.beginPath();
        ctx.moveTo(rx, -hh + 3 + yOff);
        ctx.lineTo(rx, hh - 3 + yOff);
        ctx.stroke();
      }
    } else if (!isHorizontal && wall.h > 48) {
      for (let ry = -hh + 20; ry <= hh - 20; ry += 18) {
        const t = (ry + hh) / wall.h;
        const xOff = 4 * t * (1 - t) * bend;
        ctx.beginPath();
        ctx.moveTo(-hw + 3 + xOff, ry);
        ctx.lineTo(hw - 3 + xOff, ry);
        ctx.stroke();
      }
    }

    // Steel anchor rivets at both ends
    ctx.fillStyle = '#CBD5E1';
    const rivetOffset = isHorizontal ? hw - 8 : hh - 8;
    const rivets = isHorizontal
      ? [
          [-rivetOffset, 0],
          [rivetOffset, 0],
        ]
      : [
          [0, -rivetOffset],
          [0, rivetOffset],
        ];
    for (const [rx, ry] of rivets) {
      ctx.beginPath();
      ctx.arc(rx, ry, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawTape(ctx: CanvasRenderingContext2D, tape: RuntimeTape): void {
  ctx.save();
  ctx.translate(tape.x, tape.y);
  ctx.rotate(tape.angle);

  const hw = tape.w / 2;
  const hh = tape.h / 2;
  const isMasking = tape.variant === 'masking';

  // Tape base strip with serrated/torn ends
  ctx.fillStyle = tape.peelFlash > 0 ? '#FDE68A' : isMasking ? '#F59E0B' : '#94A3B8';
  ctx.beginPath();
  const teeth = 4;
  ctx.moveTo(-hw, -hh);
  ctx.lineTo(hw, -hh);
  for (let i = 0; i < teeth; i++) {
    const y0 = -hh + (i * tape.h) / teeth;
    const y1 = -hh + ((i + 0.5) * tape.h) / teeth;
    const y2 = -hh + ((i + 1) * tape.h) / teeth;
    ctx.lineTo(hw + (i % 2 === 0 ? 4 : -2), y1);
    ctx.lineTo(hw, y2);
    void y0;
  }
  ctx.lineTo(-hw, hh);
  for (let i = teeth - 1; i >= 0; i--) {
    const y1 = -hh + ((i + 0.5) * tape.h) / teeth;
    const y0 = -hh + (i * tape.h) / teeth;
    ctx.lineTo(-hw - (i % 2 === 0 ? 4 : -2), y1);
    ctx.lineTo(-hw, y0);
  }
  ctx.closePath();
  ctx.fill();

  // Diagonal adhesive weave / hazard stripes
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = isMasking ? 'rgba(120, 53, 15, 0.28)' : 'rgba(15, 23, 42, 0.3)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let sx = -hw - tape.h; sx < hw + tape.h; sx += 16) {
    ctx.moveTo(sx, -hh - 2);
    ctx.lineTo(sx + tape.h, hh + 2);
  }
  ctx.stroke();
  ctx.restore();

  // Gloss highlight edge
  ctx.strokeStyle = isMasking ? 'rgba(254, 243, 199, 0.55)' : 'rgba(241, 245, 249, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-hw + 1, -hh + 1, tape.w - 2, tape.h - 2);

  // Center pivot bolt for spinning tape obstacles
  if (tape.spinSpeed) {
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Moving rail indicator if tape patrols
  if (tape.moveAxis && tape.moveRange) {
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (tape.moveAxis === 'x') {
      ctx.moveTo(tape.baseX - tape.moveRange, tape.baseY);
      ctx.lineTo(tape.baseX + tape.moveRange, tape.baseY);
    } else {
      ctx.moveTo(tape.baseX, tape.baseY - tape.moveRange);
      ctx.lineTo(tape.baseX, tape.baseY + tape.moveRange);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawCannon(ctx: CanvasRenderingContext2D, world: WorldState): void {
  const cannon = world.level.cannon;
  const seq = world.cannonSeq;
  const angle = seq.active ? seq.currentAngle : cannon.idleAngle;
  const recoilOffset = seq.active ? seq.recoil * 12 : 0;

  ctx.save();
  ctx.translate(cannon.x, cannon.y);

  // Outer target beacon ring
  const pulse = 0.5 + 0.5 * Math.sin(world.levelElapsed * 4);
  ctx.strokeStyle = `rgba(16, 185, 129, ${0.28 + pulse * 0.25})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, cannon.captureRadius + 4 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Rotating barrel
  ctx.save();
  ctx.rotate(angle);
  ctx.translate(-recoilOffset, 0);

  // Barrel shadow
  ctx.fillStyle = '#0B1120';
  ctx.beginPath();
  ctx.roundRect(-22, -21, 56, 42, 10);
  ctx.fill();

  // Barrel metallic body
  const barrelGrad = ctx.createLinearGradient(0, -18, 0, 18);
  barrelGrad.addColorStop(0, '#475569');
  barrelGrad.addColorStop(0.5, '#334155');
  barrelGrad.addColorStop(1, '#1E293B');
  ctx.fillStyle = barrelGrad;
  ctx.beginPath();
  ctx.roundRect(-20, -18, 52, 36, 8);
  ctx.fill();
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Glowing emerald intake collar at muzzle
  ctx.fillStyle = seq.active && !seq.fired ? '#FBBF24' : '#10B981';
  ctx.beginPath();
  ctx.roundRect(24, -20, 10, 40, 4);
  ctx.fill();

  // Dark mouth opening
  ctx.fillStyle = '#064E3B';
  ctx.beginPath();
  ctx.ellipse(32, 0, 4, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Swivel base mount
  ctx.fillStyle = '#1E293B';
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#10B981';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, world: WorldState): void {
  const player = world.player;

  // Hide inside cannon during brief load pause right before fire
  if (world.cannonSeq.active && !world.cannonSeq.fired && world.cannonSeq.elapsed > 0.25) {
    return;
  }

  // Sticky adhesive threads when stuck to tape
  if (player.stuckTapeId) {
    const tape = world.tapes.find((t) => t.id === player.stuckTapeId);
    if (tape) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.78)';
      ctx.lineWidth = 2.5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(player.x + i * 7, player.y + i * 5);
        ctx.lineTo(tape.x + i * 14, tape.y + i * 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Motion trail
  for (let i = 0; i < player.trail.length; i++) {
    const tr = player.trail[i];
    const ratio = (i + 1) / player.trail.length;
    ctx.fillStyle = world.cannonSeq.fired
      ? `rgba(52, 211, 153, ${tr.alpha * 0.55})`
      : `rgba(56, 189, 248, ${tr.alpha * 0.26})`;
    ctx.beginPath();
    ctx.arc(tr.x, tr.y, player.radius * ratio * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(player.x, player.y);

  // Peel progress ring if stuck to tape
  if (player.stuckTapeId) {
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.peelProgress);
    ctx.stroke();
  }

  // Squash & stretch
  ctx.rotate(player.squashAngle);
  ctx.scale(player.squashX, player.squashY);
  ctx.rotate(-player.squashAngle);

  // Outer rubberized glow
  const bodyGrad = ctx.createRadialGradient(-5, -5, 3, 0, 0, player.radius);
  bodyGrad.addColorStop(0, '#BAE6FD');
  bodyGrad.addColorStop(0.55, '#38BDF8');
  bodyGrad.addColorStop(1, '#0284C7');

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#E0F2FE';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Expressive eyes looking along velocity
  const lookOffsetX = player.eyeLookX * 4;
  const lookOffsetY = player.eyeLookY * 4;

  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.arc(-4.5 + lookOffsetX, -1.5 + lookOffsetY, 2.6, 0, Math.PI * 2);
  ctx.arc(4.5 + lookOffsetX, -1.5 + lookOffsetY, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(-5.2 + lookOffsetX, -2.3 + lookOffsetY, 1, 0, Math.PI * 2);
  ctx.arc(3.8 + lookOffsetX, -2.3 + lookOffsetY, 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  world: WorldState,
  pointer?: { active: boolean; x: number; y: number }
): void {
  ctx.save();

  if (world.screenShake > 0.2) {
    const sx = (Math.random() - 0.5) * world.screenShake;
    const sy = (Math.random() - 0.5) * world.screenShake;
    ctx.translate(sx, sy);
  }

  drawBlueprintGrid(ctx, world);

  // Draw walls
  for (const wall of world.walls) {
    drawWall(ctx, wall);
  }

  // Draw circular bumpers
  for (const b of world.bumpers) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const scale = 1 + b.pulse * 0.22;
    ctx.scale(scale, scale);

    ctx.fillStyle = '#134E4A';
    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = b.pulse > 0.2 ? '#99F6E4' : '#2DD4BF';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#2DD4BF';
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw sticky tapes
  for (const tape of world.tapes) {
    drawTape(ctx, tape);
  }

  // Draw cannon
  drawCannon(ctx, world);

  // Draw particles
  for (const p of world.particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw pointer steering guide if holding mouse/touch inside arena
  if (pointer?.active && !world.cannonSeq.active) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(world.player.x, world.player.y);
    ctx.lineTo(pointer.x, pointer.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Draw player
  drawPlayer(ctx, world);

  // Subtle on-canvas prompt if stuck in tape
  if (world.player.stuckTapeId) {
    const stuckTape = world.tapes.find((t) => t.id === world.player.stuckTapeId);
    const isDuct = stuckTape?.variant === 'duct';
    ctx.save();
    ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isDuct ? '#E2E8F0' : '#FDE68A';
    const promptY = Math.max(46, world.player.y - 32);
    ctx.fillText(
      isDuct ? 'HEAVY TAPE! Mash Space or Move to Rip Free' : 'STUCK! Tap Space or Move to Peel',
      world.player.x,
      promptY
    );
    ctx.restore();
  }

  ctx.restore();
}
