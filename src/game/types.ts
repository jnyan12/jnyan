export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 560;
export const GRAVITY_INTERVAL = 10; // seconds per clockwise rotation
export const GRAVITY_MAGNITUDE = 680;
export const PLAYER_RADIUS = 16;

export type GameState =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'CANNON_SEQUENCE'
  | 'LEVEL_COMPLETE'
  | 'VICTORY';

export type GravityIndex = 0 | 1 | 2 | 3;

export interface GravityMeta {
  index: GravityIndex;
  label: 'DOWN' | 'LEFT' | 'UP' | 'RIGHT';
  vx: number;
  vy: number;
  angleRad: number;
}

// Clockwise rotation starting from DOWN (6 o'clock -> 9 o'clock -> 12 o'clock -> 3 o'clock)
export const GRAVITY_DIRECTIONS: readonly GravityMeta[] = [
  { index: 0, label: 'DOWN', vx: 0, vy: 1, angleRad: Math.PI / 2 },
  { index: 1, label: 'LEFT', vx: -1, vy: 0, angleRad: Math.PI },
  { index: 2, label: 'UP', vx: 0, vy: -1, angleRad: -Math.PI / 2 },
  { index: 3, label: 'RIGHT', vx: 1, vy: 0, angleRad: 0 },
] as const;

export type WallType = 'solid' | 'elastic';

export interface WallDef {
  id: string;
  x: number; // center X
  y: number; // center Y
  w: number;
  h: number;
  angle: number; // radians
  type: WallType;
  bounceFactor?: number; // multiplier on elastic reflection
  minBounceSpeed?: number;
}

export interface RuntimeWall extends WallDef {
  flex: number; // current visual/spring displacement
  flexVel: number;
  lastImpactNx: number;
  lastImpactNy: number;
  hitFlash: number;
}

export type TapeVariant = 'masking' | 'duct';

export interface TapeDef {
  id: string;
  x: number; // center X
  y: number; // center Y
  w: number;
  h: number;
  angle: number; // radians
  variant: TapeVariant;
  moveAxis?: 'x' | 'y';
  moveRange?: number;
  moveSpeed?: number;
  movePhase?: number;
  spinSpeed?: number; // radians per second
}

export interface RuntimeTape extends TapeDef {
  baseX: number;
  baseY: number;
  baseAngle: number;
  peelFlash: number;
}

export interface BumperDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  power?: number;
}

export interface RuntimeBumper extends BumperDef {
  pulse: number;
}

export interface CannonDef {
  x: number;
  y: number;
  idleAngle: number; // radians, mouth pointing direction
  launchAngle: number; // radians, direction cannon rotates to before blasting to next level
  captureRadius: number;
}

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  parTime: number;
  initialGravity: GravityIndex;
  spawn: { x: number; y: number };
  cannon: CannonDef;
  walls: WallDef[];
  tapes: TapeDef[];
  bumpers: BumperDef[];
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  grounded: boolean;
  coyoteTimer: number;
  groundNx: number;
  groundNy: number;
  squashX: number;
  squashY: number;
  squashAngle: number;
  stuckTapeId: string | null;
  peelProgress: number; // 0..1 to break free
  peelCooldown: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
  eyeLookX: number;
  eyeLookY: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  ring?: boolean;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  pointerActive?: boolean;
  pointerX?: number;
  pointerY?: number;
}

export interface LevelProgress {
  bestTime: number | null;
  completed: boolean;
}
