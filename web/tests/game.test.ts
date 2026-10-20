import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameState, ObstacleType, RunnerGame, SoundEffects } from '../src/game';

describe('GameState Logic & Physics Unit Tests', () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState();
  });

  it('initializes in default state', () => {
    expect(state.score).toBe(0);
    expect(state.targetLane).toBe(0);
    expect(state.isGameOver).toBe(false);
    expect(state.isJumping).toBe(false);
    expect(state.isDucking).toBe(false);
    expect(state.isHoverboardActive).toBe(false);
  });

  it('clamps lane movement to [-1, 1]', () => {
    state.moveLeft();
    expect(state.targetLane).toBe(-1);
    state.moveLeft();
    expect(state.targetLane).toBe(-1); // Clamped

    state.moveRight();
    expect(state.targetLane).toBe(0);
    state.moveRight();
    expect(state.targetLane).toBe(1);
    state.moveRight();
    expect(state.targetLane).toBe(1); // Clamped
  });

  it('interpolates lane movement smoothly with lerp', () => {
    state.moveRight(); // targetLane = 1
    expect(state.currentLaneX).toBe(0);

    state.update(0.016); // 1 frame
    expect(state.currentLaneX).toBeGreaterThan(0);
    expect(state.currentLaneX).toBeLessThan(1.0);

    // After enough frames, approaches 1.0
    for (let i = 0; i < 20; i++) {
      state.update(0.016);
    }
    expect(state.currentLaneX).toBeCloseTo(1.0, 1);
  });

  it('handles jump trajectory and lands back on ground', () => {
    state.jump();
    expect(state.isJumping).toBe(true);
    expect(state.jumpVelocity).toBeGreaterThan(0);

    // Ascend
    state.update(0.1);
    expect(state.jumpY).toBeGreaterThan(0);

    // Progress until landing
    for (let i = 0; i < 20; i++) {
      state.update(0.05);
    }
    expect(state.jumpY).toBe(0);
    expect(state.isJumping).toBe(false);
  });

  it('handles ducking duration and fast fall in air', () => {
    state.duck();
    expect(state.isDucking).toBe(true);

    // Duck timer elapses
    for (let i = 0; i < 10; i++) {
      state.update(0.1);
    }
    expect(state.isDucking).toBe(false);

    // Fast fall: jump then duck
    state.jump();
    expect(state.jumpVelocity).toBe(state.JUMP_INITIAL_VELOCITY);
    state.duck();
    expect(state.jumpVelocity).toBeLessThan(0); // Forced fast descent
  });

  it('clears LOW_HURDLE when jumping and collides when not jumping', () => {
    // 1. Not jumping -> hit hurdle
    state.obstacles = [
      {
        id: 1,
        lane: 0,
        type: ObstacleType.LOW_HURDLE,
        z: 0.88,
        cleared: false,
      },
    ];
    let outcome = state.update(0.016);
    expect(outcome.collision).toBe(true);
    expect(state.isGameOver).toBe(true);

    // 2. Jumping -> safely clear hurdle
    state.restart();
    state.jump();
    // Simulate jump to apex
    state.jumpY = 0.5;
    state.obstacles = [
      {
        id: 2,
        lane: 0,
        type: ObstacleType.LOW_HURDLE,
        z: 0.88,
        cleared: false,
      },
    ];
    outcome = state.update(0.016);
    expect(outcome.collision).toBe(false);
    expect(state.isGameOver).toBe(false);
  });

  it('clears HIGH_BEAM when ducking and collides when standing', () => {
    // 1. Standing -> hit beam
    state.obstacles = [
      {
        id: 1,
        lane: 0,
        type: ObstacleType.HIGH_BEAM,
        z: 0.88,
        cleared: false,
      },
    ];
    let outcome = state.update(0.016);
    expect(outcome.collision).toBe(true);
    expect(state.isGameOver).toBe(true);

    // 2. Ducking -> safely clear beam
    state.restart();
    state.duck();
    state.obstacles = [
      {
        id: 2,
        lane: 0,
        type: ObstacleType.HIGH_BEAM,
        z: 0.88,
        cleared: false,
      },
    ];
    outcome = state.update(0.016);
    expect(outcome.collision).toBe(false);
    expect(state.isGameOver).toBe(false);
  });

  it('hoverboard shield absorbs an obstacle collision and protects the player', () => {
    state.activateHoverboard();
    expect(state.isHoverboardActive).toBe(true);

    state.obstacles = [
      {
        id: 1,
        lane: 0,
        type: ObstacleType.TALL_BLOCK,
        z: 0.88,
        cleared: false,
      },
    ];

    const outcome = state.update(0.016);
    expect(outcome.collision).toBe(false);
    expect(outcome.shieldAbsorbed).toBe(true);
    expect(state.isGameOver).toBe(false); // Survived!
    expect(state.isHoverboardActive).toBe(false); // Shield expended
    expect(state.particles.length).toBeGreaterThan(0); // Shockwave particles spawned
  });

  it('collects coins and updates score', () => {
    state.coinsList = [
      {
        id: 1,
        lane: 0,
        z: 0.88,
        collected: false,
      },
    ];

    const initialScore = state.score;
    const outcome = state.update(0.016);
    expect(outcome.coinCollected).toBe(true);
    expect(state.coins).toBe(1);
    expect(state.score).toBeGreaterThan(initialScore + 40);
  });

  describe('Speed Multiplier Controller Tests', () => {
    it('initializes with default speedMultiplier = 1.0 and clamps range to [0.5, 2.5]', () => {
      expect(state.speedMultiplier).toBe(1.0);

      state.setSpeedMultiplier(1.5);
      expect(state.speedMultiplier).toBe(1.5);

      state.setSpeedMultiplier(0.2);
      expect(state.speedMultiplier).toBe(0.5);

      state.setSpeedMultiplier(3.5);
      expect(state.speedMultiplier).toBe(2.5);
    });

    it('scales obstacle and coin forward track scroll speed by speedMultiplier', () => {
      const state1 = new GameState();
      state1.setSpeedMultiplier(1.0);
      state1.obstacles = [
        { id: 1, lane: 0, type: ObstacleType.LOW_HURDLE, z: 0.1, cleared: false },
      ];
      state1.coinsList = [
        { id: 2, lane: 0, z: 0.1, collected: false },
      ];

      const state2 = new GameState();
      state2.setSpeedMultiplier(2.0);
      state2.obstacles = [
        { id: 1, lane: 0, type: ObstacleType.LOW_HURDLE, z: 0.1, cleared: false },
      ];
      state2.coinsList = [
        { id: 2, lane: 0, z: 0.1, collected: false },
      ];

      const dt = 0.05;
      state1.update(dt);
      state2.update(dt);

      const deltaZ1 = state1.obstacles[0].z - 0.1;
      const deltaZ2 = state2.obstacles[0].z - 0.1;
      expect(deltaZ2).toBeCloseTo(deltaZ1 * 2.0, 3);

      const coinDeltaZ1 = state1.coinsList[0].z - 0.1;
      const coinDeltaZ2 = state2.coinsList[0].z - 0.1;
      expect(coinDeltaZ2).toBeCloseTo(coinDeltaZ1 * 2.0, 3);
    });

    it('scales obstacle spawn progression by speedMultiplier', () => {
      const state1 = new GameState();
      state1.setSpeedMultiplier(1.0);
      const state2 = new GameState();
      state2.setSpeedMultiplier(2.0);

      const dt = 0.05;
      state1.update(dt);
      state2.update(dt);

      // Score and spawnTimer progress twice as fast at 2.0x
      expect(state2.score).toBeGreaterThan(state1.score * 1.5);
    });

    it('scales particle movement speed by speedMultiplier', () => {
      const state1 = new GameState();
      state1.setSpeedMultiplier(1.0);
      state1.particles = [
        { x: 0, y: 0, vx: 100, vy: 50, color: '#fff', size: 3, life: 0, maxLife: 1.0 },
      ];

      const state2 = new GameState();
      state2.setSpeedMultiplier(2.0);
      state2.particles = [
        { x: 0, y: 0, vx: 100, vy: 50, color: '#fff', size: 3, life: 0, maxLife: 1.0 },
      ];

      const dt = 0.05;
      state1.update(dt);
      state2.update(dt);

      expect(state2.particles[0].x).toBeCloseTo(state1.particles[0].x * 2.0, 3);
      expect(state2.particles[0].y).toBeCloseTo(state1.particles[0].y * 2.0, 3);
    });

    it('RunnerGame coordinates speedMultiplier with GameState', () => {
      const mockCtx = {
        fillRect: () => {},
        clearRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        ellipse: () => {},
        fillText: () => {},
        measureText: () => ({ width: 50 }),
        save: () => {},
        restore: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D;

      const mockCanvas = {
        width: 800,
        height: 600,
        getContext: () => mockCtx,
      } as unknown as HTMLCanvasElement;

      const game = new RunnerGame(mockCanvas);
      expect(game.speedMultiplier).toBe(1.0);
      expect(game.state.speedMultiplier).toBe(1.0);

      game.setSpeedMultiplier(1.75);
      expect(game.speedMultiplier).toBe(1.75);
      expect(game.state.speedMultiplier).toBe(1.75);

      // Clamping
      game.setSpeedMultiplier(0.1);
      expect(game.speedMultiplier).toBe(0.5);
      expect(game.state.speedMultiplier).toBe(0.5);

      game.setSpeedMultiplier(5.0);
      expect(game.speedMultiplier).toBe(2.5);
      expect(game.state.speedMultiplier).toBe(2.5);
    });

    it('supports audio mute toggling on SoundEffects and RunnerGame', () => {
      const sounds = new SoundEffects();
      expect(sounds.enabled).toBe(true);
      expect(sounds.isMuted).toBe(false);

      const muted = sounds.toggleMute();
      expect(muted).toBe(true);
      expect(sounds.isMuted).toBe(true);
      expect(sounds.enabled).toBe(false);

      sounds.isMuted = false;
      expect(sounds.enabled).toBe(true);

      const mockCtx = {
        fillRect: () => {},
        clearRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        ellipse: () => {},
        fillText: () => {},
        measureText: () => ({ width: 50 }),
        save: () => {},
        restore: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D;

      const mockCanvas = {
        width: 800,
        height: 600,
        getContext: () => mockCtx,
      } as unknown as HTMLCanvasElement;

      const game = new RunnerGame(mockCanvas);
      expect(game.isMuted).toBe(false);
      expect(game.toggleMute()).toBe(true);
      expect(game.isMuted).toBe(true);
    });

    it('unfreezes particles and confetti during game over or pause', () => {
      const state = new GameState();
      state.isGameOver = true;
      state.particles = [
        { x: 0, y: 0, vx: 50, vy: 50, color: '#f00', size: 4, life: 0, maxLife: 1.0 },
      ];
      state.floatingTexts = [
        { id: 1, text: 'NEW BEST!', x: 0, y: 100, color: '#ff0', fontSize: 20, life: 0, maxLife: 1.0, scale: 1, vy: 20 },
      ];

      state.update(0.1);
      expect(state.particles[0].x).toBeGreaterThan(0);
      expect(state.particles[0].life).toBeCloseTo(0.1, 4);
      expect(state.floatingTexts[0].life).toBeCloseTo(0.1, 4);

      state.isGameOver = false;
      state.isPaused = true;
      state.update(0.1);
      expect(state.particles[0].life).toBeCloseTo(0.2, 4);
      expect(state.floatingTexts[0].life).toBeCloseTo(0.2, 4);
    });

    it('clamps negative dt to 0.0 in update', () => {
      const state = new GameState();
      state.score = 100;
      state.update(-0.5);
      expect(state.score).toBe(100); // Does not decrease
    });

    it('invokes onRestart callback on restart and proxies from RunnerGame', () => {
      const state = new GameState();
      const restartSpy = vi.fn();
      state.onRestart = restartSpy;
      state.restart();
      expect(restartSpy).toHaveBeenCalledTimes(1);

      const mockCtx = {
        fillRect: () => {},
        clearRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        ellipse: () => {},
        fillText: () => {},
        measureText: () => ({ width: 50 }),
        save: () => {},
        restore: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D;

      const mockCanvas = {
        width: 800,
        height: 600,
        getContext: () => mockCtx,
      } as unknown as HTMLCanvasElement;

      const game = new RunnerGame(mockCanvas);
      const gameRestartSpy = vi.fn();
      game.onRestart = gameRestartSpy;
      game.restart();
      expect(gameRestartSpy).toHaveBeenCalledTimes(1);
    });

    it('handles Retina scaling and virtual coordinates in RunnerGame', () => {
      const mockCtx = {
        fillRect: () => {},
        clearRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        ellipse: () => {},
        fillText: () => {},
        measureText: () => ({ width: 50 }),
        save: () => {},
        restore: () => {},
        scale: () => {},
        translate: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D;

      const mockCanvas = {
        width: 800,
        height: 600,
        getContext: () => mockCtx,
      } as unknown as HTMLCanvasElement;

      const game = new RunnerGame(mockCanvas);
      expect(game.virtualWidth).toBe(800);
      expect(game.virtualHeight).toBe(600);

      game.resize();
      expect(mockCanvas.width).toBeGreaterThanOrEqual(800);
      expect(mockCanvas.height).toBeGreaterThanOrEqual(600);
    });
  });
});
