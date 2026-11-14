import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Grid2x2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import { LEVELS } from '../game/levels';
import { WorldState, createWorld, stepWorld } from '../game/physics';
import { renderWorld } from '../game/renderer';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  GRAVITY_DIRECTIONS,
  GRAVITY_INTERVAL,
  GameState,
  GravityIndex,
  InputState,
  LevelProgress,
} from '../game/types';

const STORAGE_KEY = 'elasty_progress_v1';

interface HudSnapshot {
  gravityIndex: GravityIndex;
  gravityTimer: number;
  levelElapsed: number;
  bounces: number;
  tapeEscapes: number;
  stuckInTape: boolean;
  inCannon: boolean;
}

function loadProgress(): Record<number, LevelProgress> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<number, LevelProgress>;
  } catch {
    return {};
  }
}

function saveProgress(data: Record<number, LevelProgress>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

function formatTime(sec: number): string {
  return `${sec.toFixed(1)}s`;
}

export const ElastyGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [levelIdx, setLevelIdx] = useState(0);
  const [showLevelSelect, setShowLevelSelect] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState<Record<number, LevelProgress>>(() => loadProgress());

  // Campaign run stats for final victory summary
  const [runStats, setRunStats] = useState({ totalTime: 0, totalBounces: 0, totalTapeEscapes: 0 });
  const [transitionBanner, setTransitionBanner] = useState<string | null>(null);

  const [hud, setHud] = useState<HudSnapshot>({
    gravityIndex: 0,
    gravityTimer: GRAVITY_INTERVAL,
    levelElapsed: 0,
    bounces: 0,
    tapeEscapes: 0,
    stuckInTape: false,
    inCannon: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<WorldState>(createWorld(LEVELS[0]));
  const gameStateRef = useRef<GameState>(gameState);
  const levelIdxRef = useRef<number>(levelIdx);
  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    jumpPressed: false,
    jumpHeld: false,
  });
  const bannerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    levelIdxRef.current = levelIdx;
  }, [levelIdx]);

  const showBanner = useCallback((text: string) => {
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
    }
    setTransitionBanner(text);
    bannerTimerRef.current = window.setTimeout(() => {
      setTransitionBanner(null);
    }, 2200);
  }, []);

  const focusArena = useCallback(() => {
    window.focus();
    requestAnimationFrame(() => {
      canvasRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const loadLevel = useCallback(
    (index: number, nextState: GameState = 'PLAYING') => {
      const clamped = Math.max(0, Math.min(LEVELS.length - 1, index));
      const lvl = LEVELS[clamped];
      worldRef.current = createWorld(lvl);
      setLevelIdx(clamped);
      levelIdxRef.current = clamped;
      setHud({
        gravityIndex: lvl.initialGravity,
        gravityTimer: GRAVITY_INTERVAL,
        levelElapsed: 0,
        bounces: 0,
        tapeEscapes: 0,
        stuckInTape: false,
        inCannon: false,
      });
      setGameState(nextState);
      gameStateRef.current = nextState;
      setShowLevelSelect(false);
      if (nextState === 'PLAYING') {
        focusArena();
      }
    },
    [focusArena]
  );

  const startGame = useCallback(
    (startIndex = 0) => {
      soundEngine.unlock();
      if (startIndex === 0) {
        setRunStats({ totalTime: 0, totalBounces: 0, totalTapeEscapes: 0 });
      }
      loadLevel(startIndex, 'PLAYING');
      showBanner(`Level ${String(LEVELS[startIndex].id).padStart(2, '0')} · ${LEVELS[startIndex].name}`);
    },
    [loadLevel, showBanner]
  );

  const restartLevel = useCallback(() => {
    soundEngine.unlock();
    loadLevel(levelIdxRef.current, 'PLAYING');
  }, [loadLevel]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  }, [muted]);

  const handleLevelCleared = useCallback(() => {
    const world = worldRef.current;
    const clearedLevel = world.level;
    const elapsed = world.levelElapsed;

    // Persist level completion & best time
    setProgress((prev) => {
      const existing = prev[clearedLevel.id];
      const bestTime =
        existing?.bestTime != null ? Math.min(existing.bestTime, elapsed) : elapsed;
      const updated: Record<number, LevelProgress> = {
        ...prev,
        [clearedLevel.id]: { completed: true, bestTime },
      };
      saveProgress(updated);
      return updated;
    });

    setRunStats((prev) => ({
      totalTime: prev.totalTime + elapsed,
      totalBounces: prev.totalBounces + world.bounces,
      totalTapeEscapes: prev.totalTapeEscapes + world.tapeEscapes,
    }));

    const nextIdx = levelIdxRef.current + 1;
    if (nextIdx < LEVELS.length) {
      // Cannon shoots straight into the next level!
      loadLevel(nextIdx, 'PLAYING');
      showBanner(`Level ${String(LEVELS[nextIdx].id).padStart(2, '0')} · ${LEVELS[nextIdx].name}`);
    } else {
      setGameState('VICTORY');
      gameStateRef.current = 'VICTORY';
    }
  }, [loadLevel, showBanner]);

  // Keyboard bindings (checks both e.code and e.key for universal keyboard/layout compatibility)
  useEffect(() => {
    const mapKey = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      return {
        isLeft: code === 'KeyA' || code === 'ArrowLeft' || key === 'a' || key === 'arrowleft',
        isRight: code === 'KeyD' || code === 'ArrowRight' || key === 'd' || key === 'arrowright',
        isUp: code === 'KeyW' || code === 'ArrowUp' || key === 'w' || key === 'arrowup',
        isDown: code === 'KeyS' || code === 'ArrowDown' || key === 's' || key === 'arrowdown',
        isJump: code === 'Space' || key === ' ' || key === 'spacebar',
        isRestart: code === 'KeyR' || key === 'r',
        isPause: code === 'Escape' || code === 'KeyP' || key === 'escape' || key === 'p',
      };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const { isLeft, isRight, isUp, isDown, isJump, isRestart, isPause } = mapKey(e);
      if (isLeft || isRight || isUp || isDown || isJump) {
        if (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'CANNON_SEQUENCE') {
          e.preventDefault();
        }
      }

      soundEngine.unlock();

      if (isLeft) inputRef.current.left = true;
      if (isRight) inputRef.current.right = true;
      if (isUp) inputRef.current.up = true;
      if (isDown) inputRef.current.down = true;
      if (isJump) {
        if (!inputRef.current.jumpHeld) {
          inputRef.current.jumpPressed = true;
        }
        inputRef.current.jumpHeld = true;
      }

      if (isRestart && (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'PAUSED')) {
        restartLevel();
      }
      if (isPause) {
        if (gameStateRef.current === 'PLAYING') {
          setGameState('PAUSED');
        } else if (gameStateRef.current === 'PAUSED') {
          setGameState('PLAYING');
          focusArena();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const { isLeft, isRight, isUp, isDown, isJump } = mapKey(e);
      if (isLeft) inputRef.current.left = false;
      if (isRight) inputRef.current.right = false;
      if (isUp) inputRef.current.up = false;
      if (isDown) inputRef.current.down = false;
      if (isJump) inputRef.current.jumpHeld = false;
    };

    const onBlur = () => {
      inputRef.current = {
        left: false,
        right: false,
        up: false,
        down: false,
        jumpPressed: false,
        jumpHeld: false,
        pointerActive: false,
      };
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('blur', onBlur);
    };
  }, [focusArena, restartLevel]);

  // Main animation & physics loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let hudSyncAccum = 0;

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const state = gameStateRef.current;
      const world = worldRef.current;

      if (state === 'PLAYING' || state === 'CANNON_SEQUENCE') {
        const res = stepWorld(world, inputRef.current, dt);
        inputRef.current.jumpPressed = false;

        if (world.cannonSeq.active && state === 'PLAYING') {
          setGameState('CANNON_SEQUENCE');
          gameStateRef.current = 'CANNON_SEQUENCE';
        }

        if (res.cannonCompleted) {
          handleLevelCleared();
        }

        hudSyncAccum += dt;
        if (hudSyncAccum >= 0.05) {
          hudSyncAccum = 0;
          setHud({
            gravityIndex: world.gravityIndex,
            gravityTimer: Math.max(0, world.gravityTimer),
            levelElapsed: world.levelElapsed,
            bounces: world.bounces,
            tapeEscapes: world.tapeEscapes,
            stuckInTape: world.player.stuckTapeId !== null,
            inCannon: world.cannonSeq.active,
          });
        }
      }

      // Render canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const targetW = ARENA_WIDTH * dpr;
        const targetH = ARENA_HEIGHT * dpr;
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          renderWorld(
            ctx,
            world,
            inputRef.current.pointerActive &&
              inputRef.current.pointerX != null &&
              inputRef.current.pointerY != null
              ? {
                  active: true,
                  x: inputRef.current.pointerX,
                  y: inputRef.current.pointerY,
                }
              : undefined
          );
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [handleLevelCleared]);

  const currentLevel = LEVELS[levelIdx];
  const gravMeta = GRAVITY_DIRECTIONS[hud.gravityIndex];
  const gravProgress = hud.gravityTimer / GRAVITY_INTERVAL;
  const isGravityWarning = hud.gravityTimer <= 2.5;
  const completedCount = Object.values(progress).filter((p) => p.completed).length;

  const setTouchInput = (
    key: 'left' | 'right' | 'up' | 'down',
    active: boolean
  ) => {
    soundEngine.unlock();
    inputRef.current[key] = active;
  };

  const triggerTouchJump = (active: boolean) => {
    soundEngine.unlock();
    if (active && !inputRef.current.jumpHeld) {
      inputRef.current.jumpPressed = true;
    }
    inputRef.current.jumpHeld = active;
  };

  const updatePointerTarget = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * ARENA_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * ARENA_HEIGHT;
    inputRef.current.pointerX = Math.max(0, Math.min(ARENA_WIDTH, x));
    inputRef.current.pointerY = Math.max(0, Math.min(ARENA_HEIGHT, y));
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameStateRef.current !== 'PLAYING') return;
    soundEngine.unlock();
    focusArena();
    e.currentTarget.setPointerCapture(e.pointerId);
    inputRef.current.pointerActive = true;
    updatePointerTarget(e);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!inputRef.current.pointerActive) return;
    updatePointerTarget(e);
  };

  const handleCanvasPointerEnd = () => {
    inputRef.current.pointerActive = false;
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      {/* Top Bar (strict 3-zone header: Brand — Nav/Telemetry — Primary Controls) */}
      <header className="w-full border-b border-slate-800/80 bg-[#0B1120]/95">
        <div className="max-w-[1160px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            onClick={() => setGameState('TITLE_MENU')}
            className="font-display text-xl font-extrabold tracking-tight text-white hover:text-[#FF5E3A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Elasty
          </button>

          {/* Zone 2: Live Gravity & Level Context (unboxed typographic HUD during play) */}
          {gameState !== 'TITLE_MENU' ? (
            <div className="flex items-center gap-5 sm:gap-7 min-w-0">
              <div className="hidden md:flex items-center gap-2 text-sm text-slate-300 whitespace-nowrap truncate">
                <span className="font-semibold text-white">
                  Level {String(currentLevel.id).padStart(2, '0')}
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-400 truncate max-w-[190px]">{currentLevel.name}</span>
              </div>

              {/* 10s Clockwise Gravity Compass */}
              <div className="flex items-center gap-3">
                <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                  <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke="#1E293B"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15"
                      fill="none"
                      stroke={isGravityWarning ? '#F59E0B' : '#38BDF8'}
                      strokeWidth="3"
                      strokeDasharray={94.25}
                      strokeDashoffset={94.25 * (1 - gravProgress)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span
                    className="absolute inset-0 flex items-center justify-center transition-transform duration-200"
                    style={{
                      transform: `rotate(${hud.gravityIndex * 90}deg)`,
                    }}
                  >
                    <ArrowDown
                      className={`w-4 h-4 ${isGravityWarning ? 'text-amber-400' : 'text-sky-400'}`}
                    />
                  </span>
                </div>

                <div className="flex items-baseline gap-2 text-sm whitespace-nowrap">
                  <span className={`font-semibold ${isGravityWarning ? 'text-amber-400' : 'text-sky-300'}`}>
                    {gravMeta.label}
                  </span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span
                    className={`font-mono-tabular font-semibold ${
                      isGravityWarning ? 'text-amber-400' : 'text-slate-200'
                    }`}
                  >
                    {formatTime(hud.gravityTimer)}
                  </span>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
                <span>Time</span>
                <span className="font-mono-tabular text-sm font-medium text-slate-200">
                  {formatTime(hud.levelElapsed)}
                </span>
              </div>
            </div>
          ) : (
            <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-400">
              <button
                onClick={() => setShowLevelSelect(true)}
                className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Levels ({completedCount}/{LEVELS.length})
              </button>
              <a
                href="#rules"
                className="hover:text-white transition-colors whitespace-nowrap shrink-0"
              >
                How to Play
              </a>
            </nav>
          )}

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleMute}
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              title={muted ? 'Unmute' : 'Mute'}
              className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {gameState === 'TITLE_MENU' ? (
              <button
                onClick={() => startGame(0)}
                className="px-4 py-2 h-10 rounded-lg bg-[#FF5E3A] hover:bg-[#ff7050] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Start Game
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowLevelSelect(true)}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 h-10 rounded-lg border border-slate-800 bg-slate-900 hover:border-slate-700 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Grid2x2 className="w-4 h-4" />
                  <span>Levels</span>
                </button>
                <button
                  onClick={restartLevel}
                  title="Restart level (R)"
                  className="inline-flex items-center gap-1.5 px-3 py-2 h-10 rounded-lg border border-slate-800 bg-slate-900 hover:border-slate-700 text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">Restart</span>
                </button>
                <button
                  onClick={() => {
                    if (gameState === 'PAUSED') {
                      setGameState('PLAYING');
                      focusArena();
                    } else {
                      setGameState('PAUSED');
                    }
                  }}
                  title="Pause (Esc)"
                  className="inline-flex items-center gap-1.5 px-3 py-2 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {gameState === 'PAUSED' ? (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4" />
                      <span className="hidden sm:inline">Pause</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-5 sm:py-6">
        {gameState === 'TITLE_MENU' ? (
          <div className="w-full max-w-[1040px] space-y-10 py-4">
            {/* Hero Block */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <p className="text-sm font-medium text-sky-400">
                  {LEVELS.length} Kinetic Arenas · Clockwise Gravity · Adhesive Obstacles
                </p>
                <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.08] [text-wrap:balance]">
                  Bounce off elastic walls, outsmart sticky tapes, and launch into the cannon.
                </h1>
                <p className="text-base text-slate-300 leading-relaxed max-w-xl">
                  Every 10 seconds, gravity rotates 90 degrees clockwise — shifting floors into walls and ceilings into drops. Time your rebounds to land inside the cannon and blast straight into the next level.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={() => startGame(0)}
                    className="px-6 py-3 rounded-lg bg-[#FF5E3A] hover:bg-[#ff7050] text-white font-semibold text-base transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Start Game
                  </button>
                  <button
                    onClick={() => setShowLevelSelect(true)}
                    className="px-5 py-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-100 font-medium text-base transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Select Level
                  </button>
                </div>
              </div>

              {/* Clean Live Preview Frame */}
              <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0F172A] p-5 space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-medium text-slate-200">Arena Elements</span>
                  <span>01 — 04</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3.5 py-2 border-b border-slate-800/80">
                    <div className="w-10 h-3 rounded bg-[#FF5E3A] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Elastic Walls</p>
                      <p className="text-xs text-slate-400">Flex inward and rocket you away on impact</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3.5 py-2 border-b border-slate-800/80">
                    <div className="w-10 h-3 rounded bg-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Sticky Tapes</p>
                      <p className="text-xs text-slate-400">Snag your momentum — tap Space or move to rip free</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3.5 py-2 border-b border-slate-800/80">
                    <div className="w-10 h-6 flex items-center justify-center shrink-0">
                      <ArrowDown className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">10s Clockwise Gravity</p>
                      <p className="text-xs text-slate-400">Rotates Down → Left → Up → Right automatically</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3.5 py-2">
                    <div className="w-10 h-6 flex items-center justify-center shrink-0">
                      <div className="w-6 h-4 rounded bg-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Exit Cannon</p>
                      <p className="text-xs text-slate-400">Enter the intake ring to fire into the next level</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls Strip */}
            <section id="rules" className="border-t border-slate-800/90 pt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
              <div>
                <h2 className="font-semibold text-white mb-1">Steer & Jump</h2>
                <p className="text-slate-400">
                  Use <span className="text-slate-200 font-medium">WASD</span> or <span className="text-slate-200 font-medium">Arrow Keys</span> to steer in any direction, and <span className="text-slate-200 font-medium">Space</span> to pop off surfaces.
                </p>
              </div>
              <div>
                <h2 className="font-semibold text-white mb-1">Peel Off Tape</h2>
                <p className="text-slate-400">
                  Harder levels feature static and patrolling masking/duct tape. Hold a direction or tap <span className="text-slate-200 font-medium">Space</span> to tear loose.
                </p>
              </div>
              <div>
                <h2 className="font-semibold text-white mb-1">Chain Rebounds</h2>
                <p className="text-slate-400">
                  Combine elastic cushions and bumpers with the 10-second gravity clock to reach shielded cannons.
                </p>
              </div>
            </section>
          </div>
        ) : (
          <div className="w-full max-w-[1000px] flex flex-col items-center gap-3">
            {/* Level subtitle & live micro-stats line */}
            <div className="w-full flex flex-wrap items-center justify-between gap-2 px-1 text-xs sm:text-sm text-slate-400">
              <p className="truncate">{currentLevel.subtitle}</p>
              <div className="flex items-center gap-3 font-mono-tabular whitespace-nowrap shrink-0">
                <span>Bounces: {hud.bounces}</span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span>Tape Escapes: {hud.tapeEscapes}</span>
              </div>
            </div>

            {/* Arena Canvas Container */}
            <div className="relative w-full aspect-[960/560] rounded-xl overflow-hidden border border-slate-800 bg-[#0F172A] shadow-2xl">
              <canvas
                ref={canvasRef}
                tabIndex={0}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerEnd}
                onPointerCancel={handleCanvasPointerEnd}
                className="w-full h-full block outline-none touch-none cursor-crosshair"
              />

              {/* Subtle Level Transition Banner when cannon blasts into next level */}
              {transitionBanner && (
                <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-lg bg-[#0B1120]/90 border border-slate-700 text-sm font-semibold text-white whitespace-nowrap">
                  {transitionBanner}
                </div>
              )}

              {/* Pause Overlay */}
              {gameState === 'PAUSED' && (
                <div className="absolute inset-0 bg-[#0B1120]/80 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-[#0F172A] p-6 space-y-5 text-center">
                    <div className="space-y-1">
                      <h2 className="font-display text-2xl font-bold text-white">Paused</h2>
                      <p className="text-sm text-slate-400">
                        Level {String(currentLevel.id).padStart(2, '0')} · {currentLevel.name}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <button
                        onClick={() => {
                          setGameState('PLAYING');
                          focusArena();
                        }}
                        className="w-full py-2.5 px-4 rounded-lg bg-[#FF5E3A] hover:bg-[#ff7050] text-white font-semibold text-sm transition-colors cursor-pointer"
                      >
                        Resume
                      </button>
                      <button
                        onClick={restartLevel}
                        className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
                      >
                        Restart Level
                      </button>
                      <button
                        onClick={() => setShowLevelSelect(true)}
                        className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium text-sm transition-colors cursor-pointer"
                      >
                        Select Level
                      </button>
                      <button
                        onClick={() => setGameState('TITLE_MENU')}
                        className="w-full py-2 px-4 text-slate-400 hover:text-white text-sm transition-colors cursor-pointer"
                      >
                        Back to Title
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Campaign Victory Overlay */}
              {gameState === 'VICTORY' && (
                <div className="absolute inset-0 bg-[#0B1120]/88 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="w-full max-w-md rounded-xl border border-slate-700 bg-[#0F172A] p-7 space-y-6 text-center">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                        All {LEVELS.length} Cannons Cleared
                      </p>
                      <h2 className="font-display text-3xl font-extrabold text-white">
                        Campaign Complete
                      </h2>
                      <p className="text-sm text-slate-400">
                        You mastered elastic walls, clockwise gravity shifts, and adhesive tape traps.
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 py-4 border-y border-slate-800">
                      <div>
                        <p className="text-xs text-slate-400">Total Time</p>
                        <p className="font-mono-tabular text-lg font-bold text-white mt-0.5">
                          {formatTime(runStats.totalTime)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Elastic Bounces</p>
                        <p className="font-mono-tabular text-lg font-bold text-[#FF5E3A] mt-0.5">
                          {runStats.totalBounces}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Tape Escapes</p>
                        <p className="font-mono-tabular text-lg font-bold text-amber-400 mt-0.5">
                          {runStats.totalTapeEscapes}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => startGame(0)}
                        className="flex-1 py-2.5 px-4 rounded-lg bg-[#FF5E3A] hover:bg-[#ff7050] text-white font-semibold text-sm transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Play Again
                      </button>
                      <button
                        onClick={() => setShowLevelSelect(true)}
                        className="flex-1 py-2.5 px-4 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Select Level
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Controls Helper & Always-Ready On-Screen Controls */}
            <div className="w-full flex flex-col md:flex-row items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-400 text-center md:text-left">
                Move: <span className="text-slate-200">WASD / Arrows / Drag Arena</span>
                <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                Jump / Peel Tape: <span className="text-slate-200">Space</span>
                <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                Restart: <span className="text-slate-200">R</span>
                <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                Pause: <span className="text-slate-200">Esc</span>
              </p>

              {/* Always-ready clickable/touch directional pad + Jump/Peel */}
              <div className="flex items-center gap-3 select-none">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onPointerDown={() => setTouchInput('left', true)}
                    onPointerUp={() => setTouchInput('left', false)}
                    onPointerLeave={() => setTouchInput('left', false)}
                    onPointerCancel={() => setTouchInput('left', false)}
                    aria-label="Move Left"
                    className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 flex items-center justify-center text-slate-200 cursor-pointer touch-none"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => setTouchInput('up', true)}
                    onPointerUp={() => setTouchInput('up', false)}
                    onPointerLeave={() => setTouchInput('up', false)}
                    onPointerCancel={() => setTouchInput('up', false)}
                    aria-label="Move Up"
                    className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 flex items-center justify-center text-slate-200 cursor-pointer touch-none"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => setTouchInput('down', true)}
                    onPointerUp={() => setTouchInput('down', false)}
                    onPointerLeave={() => setTouchInput('down', false)}
                    onPointerCancel={() => setTouchInput('down', false)}
                    aria-label="Move Down"
                    className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 flex items-center justify-center text-slate-200 cursor-pointer touch-none"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => setTouchInput('right', true)}
                    onPointerUp={() => setTouchInput('right', false)}
                    onPointerLeave={() => setTouchInput('right', false)}
                    onPointerCancel={() => setTouchInput('right', false)}
                    aria-label="Move Right"
                    className="w-10 h-10 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 flex items-center justify-center text-slate-200 cursor-pointer touch-none"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onPointerDown={() => triggerTouchJump(true)}
                  onPointerUp={() => triggerTouchJump(false)}
                  onPointerLeave={() => triggerTouchJump(false)}
                  onPointerCancel={() => triggerTouchJump(false)}
                  className="px-4 h-10 rounded-lg bg-[#FF5E3A] hover:bg-[#ff7050] active:bg-[#e54d2b] text-white text-sm font-semibold cursor-pointer touch-none whitespace-nowrap"
                >
                  {hud.stuckInTape ? 'Peel' : 'Jump'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Level Select Modal */}
      {showLevelSelect && (
        <div className="fixed inset-0 z-50 bg-[#0B1120]/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-[#0F172A] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Select Level</h2>
                <p className="text-sm text-slate-400">
                  {completedCount} of {LEVELS.length} cannons cleared
                </p>
              </div>
              <button
                onClick={() => setShowLevelSelect(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-medium cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {LEVELS.map((lvl, idx) => {
                const info = progress[lvl.id];
                const isCurrent = idx === levelIdx && gameState !== 'TITLE_MENU';
                return (
                  <button
                    key={lvl.id}
                    onClick={() => startGame(idx)}
                    className={`text-left p-4 rounded-lg border transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                      isCurrent
                        ? 'border-[#FF5E3A] bg-slate-800/80'
                        : 'border-slate-800 bg-slate-900/70 hover:border-slate-600 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono-tabular font-semibold text-slate-300">
                          Level {String(lvl.id).padStart(2, '0')}
                        </span>
                        {lvl.tapes.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-400">
                              {lvl.tapes.length} Tape{lvl.tapes.length > 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                        {lvl.tapes.some((t) => t.spinSpeed) && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-300">Spinning</span>
                          </>
                        )}
                        {lvl.id >= 11 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#FF5E3A]">Expert</span>
                          </>
                        )}
                      </div>
                      <p className="font-semibold text-white mt-0.5 truncate">{lvl.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{lvl.subtitle}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {info?.completed ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <Check className="w-4 h-4 text-emerald-400" />
                          {info.bestTime != null && (
                            <span className="font-mono-tabular text-xs text-slate-300">
                              {formatTime(info.bestTime)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Play</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
