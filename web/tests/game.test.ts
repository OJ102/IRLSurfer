import { describe, it, expect, beforeEach } from 'vitest';
import { GameState, ObstacleType } from '../src/game';

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
});
