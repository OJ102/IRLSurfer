/**
 * HTML5 Canvas 3-Lane Synthwave Arcade Runner.
 * Zero external asset dependencies: Pure Canvas 2D neon vector graphics,
 * Web Audio synthesized sound effects, smooth lerp interpolation,
 * obstacle avoidance (jump, duck, dodge), collectibles, and hoverboard shield.
 */

export type Lane = -1 | 0 | 1;

export enum ObstacleType {
  HIGH_BEAM = 'HIGH_BEAM',   // Must duck under
  LOW_HURDLE = 'LOW_HURDLE', // Must jump over
  TALL_BLOCK = 'TALL_BLOCK', // Must dodge to another lane
}

export interface Obstacle {
  id: number;
  lane: Lane;
  type: ObstacleType;
  z: number; // 0 (horizon) to 1.0 (player position)
  cleared: boolean;
}

export interface Coin {
  id: number;
  lane: Lane;
  z: number;
  collected: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface GameOptions {
  soundEnabled?: boolean;
}

export class GameState {
  score: number = 0;
  highScore: number = 0;
  coins: number = 0;
  speed: number = 0.5; // Track speed multiplier
  isGameOver: boolean = false;
  isPaused: boolean = false;

  // Player state
  targetLane: Lane = 0;
  currentLaneX: number = 0; // Continuous x for smooth lerp (-1 to 1)

  // Vertical movement (Jump)
  isJumping: boolean = false;
  jumpY: number = 0; // 0 to 1 elevation
  jumpVelocity: number = 0;

  // Duck movement
  isDucking: boolean = false;
  duckTimer: number = 0; // seconds remaining

  // Hoverboard Shield
  isHoverboardActive: boolean = false;
  hoverboardRemainingSec: number = 0;

  // Entities
  obstacles: Obstacle[] = [];
  coinsList: Coin[] = [];
  particles: Particle[] = [];

  // Internal counters
  private _nextEntityId = 1;
  private _spawnTimer = 0;

  // Constants
  readonly JUMP_INITIAL_VELOCITY = 2.4;
  readonly GRAVITY = -6.5;
  readonly DUCK_DURATION = 0.8;
  readonly HOVERBOARD_DURATION = 10.0;
  readonly LERP_SPEED = 14.0; // Lerp rate per second

  constructor() {
    this.loadHighScore();
  }

  loadHighScore(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('irlsurfer_high_score');
        if (saved) {
          this.highScore = parseInt(saved, 10) || 0;
        }
      }
    } catch {
      // LocalStorage unavailable in certain sandboxes
    }
  }

  saveHighScore(): void {
    if (this.score > this.highScore) {
      this.highScore = Math.floor(this.score);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('irlsurfer_high_score', this.highScore.toString());
        }
      } catch {
        // Ignore
      }
    }
  }

  restart(): void {
    this.score = 0;
    this.coins = 0;
    this.speed = 0.55;
    this.isGameOver = false;
    this.isPaused = false;
    this.targetLane = 0;
    this.currentLaneX = 0;
    this.isJumping = false;
    this.jumpY = 0;
    this.jumpVelocity = 0;
    this.isDucking = false;
    this.duckTimer = 0;
    this.isHoverboardActive = false;
    this.hoverboardRemainingSec = 0;
    this.obstacles = [];
    this.coinsList = [];
    this.particles = [];
    this._spawnTimer = 0;
  }

  moveLeft(): void {
    if (this.isGameOver || this.isPaused) return;
    if (this.targetLane > -1) {
      this.targetLane = (this.targetLane - 1) as Lane;
    }
  }

  moveRight(): void {
    if (this.isGameOver || this.isPaused) return;
    if (this.targetLane < 1) {
      this.targetLane = (this.targetLane + 1) as Lane;
    }
  }

  jump(): void {
    if (this.isGameOver) {
      this.restart();
      return;
    }
    if (this.isPaused) return;
    if (!this.isJumping) {
      this.isJumping = true;
      this.isDucking = false;
      this.duckTimer = 0;
      this.jumpVelocity = this.JUMP_INITIAL_VELOCITY;
    }
  }

  duck(): void {
    if (this.isGameOver || this.isPaused) return;
    if (this.isJumping) {
      // Fast fall when ducking in air!
      this.jumpVelocity = -4.0;
    }
    this.isDucking = true;
    this.duckTimer = this.DUCK_DURATION;
  }

  activateHoverboard(): void {
    if (this.isGameOver || this.isPaused) return;
    this.isHoverboardActive = true;
    this.hoverboardRemainingSec = this.HOVERBOARD_DURATION;
  }

  update(dt: number): {
    collision: boolean;
    shieldAbsorbed: boolean;
    coinCollected: boolean;
  } {
    if (this.isGameOver || this.isPaused) {
      return { collision: false, shieldAbsorbed: false, coinCollected: false };
    }

    // Clamp dt to prevent explosion on background tab switch
    const clampedDt = Math.min(dt, 0.1);

    // Increase score based on speed and time
    this.score += clampedDt * 10 * (1 + this.speed);
    this.speed = Math.min(1.2, 0.55 + this.score * 0.0003);

    // 1. Horizontal Lane Lerp Interpolation
    const laneDiff = this.targetLane - this.currentLaneX;
    this.currentLaneX += laneDiff * Math.min(1.0, this.LERP_SPEED * clampedDt);

    // 2. Vertical Jump Physics
    if (this.isJumping) {
      this.jumpY += this.jumpVelocity * clampedDt;
      this.jumpVelocity += this.GRAVITY * clampedDt;
      if (this.jumpY <= 0) {
        this.jumpY = 0;
        this.jumpVelocity = 0;
        this.isJumping = false;
      }
    }

    // 3. Duck Timer
    if (this.isDucking) {
      this.duckTimer -= clampedDt;
      if (this.duckTimer <= 0) {
        this.isDucking = false;
        this.duckTimer = 0;
      }
    }

    // 4. Hoverboard Shield Timer
    if (this.isHoverboardActive) {
      this.hoverboardRemainingSec -= clampedDt;
      if (this.hoverboardRemainingSec <= 0) {
        this.isHoverboardActive = false;
        this.hoverboardRemainingSec = 0;
      }
    }

    // 5. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * clampedDt;
      p.y += p.vy * clampedDt;
      p.life += clampedDt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    // 6. Spawn Obstacles and Coins
    this._spawnTimer += clampedDt * (0.8 + this.speed);
    if (this._spawnTimer >= 1.5) {
      this._spawnTimer = 0;
      this.spawnWave();
    }

    // 7. Update Obstacles and check collisions
    let shieldAbsorbed = false;
    let collision = false;

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += clampedDt * (0.45 + this.speed * 0.4);

      // Check collision zone (player is at z around 0.85 - 0.95)
      if (!obs.cleared && obs.z >= 0.82 && obs.z <= 0.96) {
        // Player must be in the same lane
        const laneDist = Math.abs(this.currentLaneX - obs.lane);
        if (laneDist < 0.55) {
          let hit = false;

          switch (obs.type) {
            case ObstacleType.HIGH_BEAM:
              // Safe only if ducking
              if (!this.isDucking) {
                hit = true;
              }
              break;
            case ObstacleType.LOW_HURDLE:
              // Safe only if jumping sufficiently high
              if (!this.isJumping || this.jumpY < 0.22) {
                hit = true;
              }
              break;
            case ObstacleType.TALL_BLOCK:
              // Cannot jump or duck over tall block
              hit = true;
              break;
          }

          if (hit) {
            if (this.isHoverboardActive) {
              // Shield absorbs the crash!
              this.isHoverboardActive = false;
              this.hoverboardRemainingSec = 0;
              obs.cleared = true;
              shieldAbsorbed = true;
              this.createShieldAbsorptionParticles();
            } else {
              collision = true;
              this.isGameOver = true;
              this.saveHighScore();
            }
          }
        }
      }

      // Remove obstacles that moved past player
      if (obs.z > 1.1) {
        this.obstacles.splice(i, 1);
      }
    }

    // 8. Update Coins and Collectibles
    let coinCollected = false;
    for (let i = this.coinsList.length - 1; i >= 0; i--) {
      const coin = this.coinsList[i];
      coin.z += clampedDt * (0.45 + this.speed * 0.4);

      if (!coin.collected && coin.z >= 0.80 && coin.z <= 0.96) {
        const laneDist = Math.abs(this.currentLaneX - coin.lane);
        // Can collect if on ground or low jump
        if (laneDist < 0.5 && this.jumpY < 0.5) {
          coin.collected = true;
          coinCollected = true;
          this.coins += 1;
          this.score += 50;
          this.createCoinParticles(coin.lane);
        }
      }

      if (coin.z > 1.1) {
        this.coinsList.splice(i, 1);
      }
    }

    return { collision, shieldAbsorbed, coinCollected };
  }

  spawnWave(): void {
    const lanes: Lane[] = [-1, 0, 1];
    const chosenLane = lanes[Math.floor(Math.random() * lanes.length)];
    const types = [
      ObstacleType.HIGH_BEAM,
      ObstacleType.LOW_HURDLE,
      ObstacleType.TALL_BLOCK,
    ];
    const type = types[Math.floor(Math.random() * types.length)];

    this.obstacles.push({
      id: this._nextEntityId++,
      lane: chosenLane,
      type,
      z: 0.05,
      cleared: false,
    });

    // Spawn coins in an unoccupied lane
    const availableLanes = lanes.filter((l) => l !== chosenLane);
    const coinLane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
    for (let c = 0; c < 3; c++) {
      this.coinsList.push({
        id: this._nextEntityId++,
        lane: coinLane,
        z: 0.05 + c * 0.06,
        collected: false,
      });
    }
  }

  createShieldAbsorptionParticles(): void {
    const colors = ['#00ffff', '#ffe600', '#ff007f', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const speed = 150 + Math.random() * 200;
      this.particles.push({
        x: 0, // Centered relative to canvas player
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3,
      });
    }
  }

  createCoinParticles(lane: Lane): void {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 80;
      this.particles.push({
        x: lane * 100,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        color: '#ffe600',
        size: 2.5 + Math.random() * 2.5,
        life: 0,
        maxLife: 0.35,
      });
    }
  }
}

/**
 * Web Audio Synthesized Sound Effects (No audio asset files needed!)
 */
class SoundEffects {
  private ctx: AudioContext | null = null;
  enabled: boolean = true;

  private initCtx(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playJump(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Audio playback silently suppressed
    }
  }

  playDuck(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Audio playback silently suppressed
    }
  }

  playCoin(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.06); // E6
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Audio playback silently suppressed
    }
  }

  playShieldAbsorb(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Audio playback silently suppressed
    }
  }

  playGameOver(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.4);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      // Audio playback silently suppressed
    }
  }
}

/**
 * Arcade Runner Canvas Renderer and Game Controller.
 */
export class GameRunner {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly state: GameState;
  readonly sounds: SoundEffects;

  private _animationFrameId: number | null = null;
  private _lastTimestamp: number = 0;
  private _gridOffset: number = 0;

  constructor(canvas: HTMLCanvasElement, options?: GameOptions) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = context;
    this.state = new GameState();
    this.sounds = new SoundEffects();
    if (options?.soundEnabled !== undefined) {
      this.sounds.enabled = options.soundEnabled;
    }

    this.bindKeyboard();
  }

  private bindKeyboard(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.state.moveLeft();
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.state.moveRight();
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          e.preventDefault();
          this.state.jump();
          this.sounds.playJump();
          break;
        case 'ArrowDown':
        case 'KeyS':
          e.preventDefault();
          this.state.duck();
          this.sounds.playDuck();
          break;
        case 'KeyH':
          this.state.activateHoverboard();
          break;
      }
    });
  }

  start(): void {
    if (this._animationFrameId !== null) return;
    this._lastTimestamp = performance.now();
    this.loop = this.loop.bind(this);
    this._animationFrameId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  private loop(now: number): void {
    const dt = (now - this._lastTimestamp) / 1000.0;
    this._lastTimestamp = now;

    const outcome = this.state.update(dt);
    if (outcome.coinCollected) {
      this.sounds.playCoin();
    }
    if (outcome.shieldAbsorbed) {
      this.sounds.playShieldAbsorb();
    }
    if (outcome.collision) {
      this.sounds.playGameOver();
    }

    this._gridOffset = (this._gridOffset + dt * (1.2 + this.state.speed * 1.5)) % 1.0;

    this.render();
    this._animationFrameId = requestAnimationFrame(this.loop);
  }

  render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background: Cyberpunk dark violet
    ctx.fillStyle = '#0b0818';
    ctx.fillRect(0, 0, w, h);

    // Horizon line at 28% from top
    const horizonY = h * 0.28;
    const vanishX = w * 0.5;

    // 1. Draw Synthwave Retro Sun & Stars
    this.drawSky(ctx, w, horizonY, vanishX);

    // 2. Draw 3D Perspective Track Grid
    this.drawTrack(ctx, w, h, horizonY, vanishX);

    // 3. Draw Collectibles (Coins)
    this.drawCoins(ctx, w, h, horizonY, vanishX);

    // 4. Draw Obstacles
    this.drawObstacles(ctx, w, h, horizonY, vanishX);

    // 5. Draw Player Avatar (Surfboard / Runner)
    this.drawPlayer(ctx, w, h, horizonY, vanishX);

    // 6. Draw Particles
    this.drawParticles(ctx, w, h, horizonY, vanishX);

    // 7. Draw HUD (Score, High Score, Coins, Shield Bar)
    this.drawHUD(ctx, w);

    // 8. Draw Game Over Overlay if dead
    if (this.state.isGameOver) {
      this.drawGameOver(ctx, w, h);
    }
  }

  private drawSky(
    ctx: CanvasRenderingContext2D,
    w: number,
    horizonY: number,
    vanishX: number,
  ): void {
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#04020a');
    skyGrad.addColorStop(0.7, '#1b0a2a');
    skyGrad.addColorStop(1, '#431248');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Neon Retrosun
    const sunRadius = Math.min(w * 0.18, horizonY * 0.7);
    const sunY = horizonY - sunRadius * 0.4;
    const sunGrad = ctx.createLinearGradient(
      vanishX,
      sunY - sunRadius,
      vanishX,
      sunY + sunRadius,
    );
    sunGrad.addColorStop(0, '#ffe600');
    sunGrad.addColorStop(0.5, '#ff007f');
    sunGrad.addColorStop(1, '#7a00ff');

    ctx.save();
    ctx.beginPath();
    ctx.arc(vanishX, sunY, sunRadius, Math.PI, 0, false);
    ctx.fillStyle = sunGrad;
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 25;
    ctx.fill();

    // Horizontal sun laser blinds
    ctx.fillStyle = '#0b0818';
    for (let i = 0; i < 5; i++) {
      const blindY = sunY - sunRadius * 0.1 + i * (sunRadius * 0.12);
      ctx.fillRect(vanishX - sunRadius, blindY, sunRadius * 2, 2.5 + i * 1.2);
    }
    ctx.restore();
  }

  private getTrackX(lane: number, z: number, w: number, vanishX: number): number {
    // Perspective expansion: at z=0 (horizon), width is small; at z=1 (bottom), width is w * 0.85
    const bottomTrackHalfWidth = w * 0.42;
    const topTrackHalfWidth = w * 0.05;
    const trackHalfWidth =
      topTrackHalfWidth + (bottomTrackHalfWidth - topTrackHalfWidth) * z;
    const laneWidth = (trackHalfWidth * 2) / 3;

    return vanishX + lane * laneWidth;
  }

  private getTrackY(z: number, h: number, horizonY: number): number {
    // Non-linear depth for perspective
    const depth = Math.pow(z, 1.8);
    return horizonY + (h - horizonY) * depth;
  }

  private drawTrack(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
  ): void {
    // Track floor background
    const floorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    floorGrad.addColorStop(0, '#120422');
    floorGrad.addColorStop(1, '#06020c');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Track border edges (-1.5 to +1.5 lane boundaries)
    const leftEdgeTop = this.getTrackX(-1.5, 0, w, vanishX);
    const leftEdgeBottom = this.getTrackX(-1.5, 1, w, vanishX);
    const rightEdgeTop = this.getTrackX(1.5, 0, w, vanishX);
    const rightEdgeBottom = this.getTrackX(1.5, 1, w, vanishX);

    // Track surface fill
    ctx.beginPath();
    ctx.moveTo(leftEdgeTop, horizonY);
    ctx.lineTo(rightEdgeTop, horizonY);
    ctx.lineTo(rightEdgeBottom, h);
    ctx.lineTo(leftEdgeBottom, h);
    ctx.closePath();
    ctx.fillStyle = '#160829';
    ctx.fill();

    // Lane divider lines (-0.5 and +0.5) and edges
    ctx.strokeStyle = '#ff00aa';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ff00aa';
    ctx.shadowBlur = 10;

    for (const laneDiv of [-1.5, -0.5, 0.5, 1.5]) {
      const topX = this.getTrackX(laneDiv, 0, w, vanishX);
      const bottomX = this.getTrackX(laneDiv, 1, w, vanishX);
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(bottomX, h);
      ctx.stroke();
    }

    // Receding horizontal speed lines
    const numLines = 14;
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 6;

    for (let i = 0; i < numLines; i++) {
      const zNorm = ((i + this._gridOffset) % numLines) / numLines;
      const y = this.getTrackY(zNorm, h, horizonY);
      const leftX = this.getTrackX(-1.5, zNorm, w, vanishX);
      const rightX = this.getTrackX(1.5, zNorm, w, vanishX);

      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
  }

  private drawCoins(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
  ): void {
    ctx.save();
    for (const coin of this.state.coinsList) {
      if (coin.collected || coin.z < 0.05 || coin.z > 1.05) continue;

      const cx = this.getTrackX(coin.lane, coin.z, w, vanishX);
      const cy = this.getTrackY(coin.z, h, horizonY) - 15 * coin.z;
      const radius = Math.max(3, 14 * coin.z);

      // Gold coin glow
      ctx.fillStyle = '#ffe600';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 12 * coin.z;

      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 0.7, radius, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner coin shine
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 0.3, radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawObstacles(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
  ): void {
    ctx.save();
    for (const obs of this.state.obstacles) {
      if (obs.cleared || obs.z < 0.02 || obs.z > 1.05) continue;

      const cx = this.getTrackX(obs.lane, obs.z, w, vanishX);
      const groundY = this.getTrackY(obs.z, h, horizonY);
      const width = Math.max(8, (w * 0.22) * obs.z);

      switch (obs.type) {
        case ObstacleType.HIGH_BEAM: {
          // Overhead duck laser: floats high above track
          const beamY = groundY - Math.max(18, 55 * obs.z);
          const beamH = Math.max(4, 14 * obs.z);

          // Support side pylons
          ctx.strokeStyle = '#ff0055';
          ctx.lineWidth = Math.max(1, 3 * obs.z);
          ctx.shadowColor = '#ff0055';
          ctx.shadowBlur = 10 * obs.z;

          ctx.beginPath();
          ctx.moveTo(cx - width * 0.5, groundY);
          ctx.lineTo(cx - width * 0.5, beamY);
          ctx.moveTo(cx + width * 0.5, groundY);
          ctx.lineTo(cx + width * 0.5, beamY);
          ctx.stroke();

          // High neon beam
          ctx.fillStyle = '#ff0055';
          ctx.fillRect(cx - width * 0.5, beamY, width, beamH);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - width * 0.45, beamY + beamH * 0.25, width * 0.9, beamH * 0.5);

          // "DUCK" alert tag on high obstacle
          if (obs.z > 0.4) {
            ctx.fillStyle = '#ffea00';
            ctx.font = `bold ${Math.floor(10 * obs.z)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('▼ DUCK ▼', cx, beamY - 4);
          }
          break;
        }

        case ObstacleType.LOW_HURDLE: {
          // Jump over barrier: on track ground
          const hurdleH = Math.max(6, 26 * obs.z);
          ctx.fillStyle = '#00ffff';
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 12 * obs.z;

          // Electric rail hurdle
          ctx.fillRect(cx - width * 0.5, groundY - hurdleH, width, hurdleH);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - width * 0.4, groundY - hurdleH + 2, width * 0.8, hurdleH * 0.35);

          if (obs.z > 0.4) {
            ctx.fillStyle = '#00ffff';
            ctx.font = `bold ${Math.floor(10 * obs.z)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('▲ JUMP ▲', cx, groundY - hurdleH - 4);
          }
          break;
        }

        case ObstacleType.TALL_BLOCK: {
          // Solid blocker cube: covers full height
          const blockH = Math.max(16, 75 * obs.z);
          ctx.fillStyle = '#ff7700';
          ctx.shadowColor = '#ff7700';
          ctx.shadowBlur = 14 * obs.z;

          // Cube body
          ctx.fillRect(cx - width * 0.45, groundY - blockH, width * 0.9, blockH);

          // Diagonal neon hazard stripes
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = Math.max(1, 3 * obs.z);
          ctx.beginPath();
          ctx.moveTo(cx - width * 0.4, groundY - blockH * 0.8);
          ctx.lineTo(cx + width * 0.4, groundY - blockH * 0.3);
          ctx.moveTo(cx - width * 0.4, groundY - blockH * 0.5);
          ctx.lineTo(cx + width * 0.4, groundY);
          ctx.stroke();

          if (obs.z > 0.4) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.floor(11 * obs.z)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('DODGE', cx, groundY - blockH - 5);
          }
          break;
        }
      }
    }
    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
  ): void {
    const playerZ = 0.88;
    const px = this.getTrackX(this.state.currentLaneX, playerZ, w, vanishX);
    const groundY = this.getTrackY(playerZ, h, horizonY);

    // Jump offset (in pixels)
    const jumpOffsetPx = this.state.jumpY * (h * 0.28);
    const py = groundY - jumpOffsetPx;

    ctx.save();

    // Draw shadow on ground beneath player
    const shadowWidth = (w * 0.12) * (1.0 - Math.min(0.6, this.state.jumpY * 0.5));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.ellipse(px, groundY, shadowWidth * 0.6, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hoverboard Shield bubble (Wrists held together)
    if (this.state.isHoverboardActive) {
      const shieldRadius = Math.max(28, w * 0.075);
      const pulse = 1.0 + Math.sin(performance.now() * 0.01) * 0.06;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py - 20, shieldRadius * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 20;
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
      ctx.fill();

      // Inner shield rings
      ctx.beginPath();
      ctx.arc(px, py - 20, shieldRadius * 0.7 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff00aa';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Player Avatar: Cyber Neon Hoverboard + Surfer Figure
    const isDucking = this.state.isDucking;
    const bodyHeight = isDucking ? 24 : 52;
    const boardWidth = w * 0.09;

    // Glowing Neon Hoverboard
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.ellipse(px, py - 2, boardWidth * 0.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Board Thruster Glow
    ctx.fillStyle = '#ff00aa';
    ctx.shadowColor = '#ff00aa';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.ellipse(px, py + 3, boardWidth * 0.25, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Surfer Body (Futuristic Geometric Vector Silhouette)
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;

    // Torso / Suit
    ctx.beginPath();
    ctx.moveTo(px - 10, py - 10);
    ctx.lineTo(px + 10, py - 10);
    ctx.lineTo(px + 6, py - 10 - bodyHeight * 0.7);
    ctx.lineTo(px - 6, py - 10 - bodyHeight * 0.7);
    ctx.closePath();
    ctx.fill();

    // Helmet / Visor
    const headY = py - 10 - bodyHeight;
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(px, headY + 7, 8, 0, Math.PI * 2);
    ctx.fill();

    // Visor glow line
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px - 6, headY + 7);
    ctx.lineTo(px + 6, headY + 7);
    ctx.stroke();

    ctx.restore();
  }

  private drawParticles(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
  ): void {
    const playerZ = 0.88;
    const px = this.getTrackX(0, playerZ, w, vanishX);
    const py = this.getTrackY(playerZ, h, horizonY);

    ctx.save();
    for (const p of this.state.particles) {
      const alpha = 1.0 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px + p.x, py + p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHUD(ctx: CanvasRenderingContext2D, w: number): void {
    ctx.save();

    // Top Header Bar
    ctx.fillStyle = 'rgba(11, 8, 24, 0.75)';
    ctx.fillRect(0, 0, w, 54);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 54);
    ctx.lineTo(w, 54);
    ctx.stroke();

    // Score display
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${Math.floor(this.state.score)}`, 20, 34);

    // Coins
    ctx.fillStyle = '#ffe600';
    ctx.fillText(`★ COINS: ${this.state.coins}`, 220, 34);

    // High score
    ctx.fillStyle = '#ff00aa';
    ctx.textAlign = 'right';
    ctx.fillText(`BEST: ${this.state.highScore}`, w - 20, 34);

    // Hoverboard shield status bar
    if (this.state.isHoverboardActive) {
      const remainingPct = this.state.hoverboardRemainingSec / this.state.HOVERBOARD_DURATION;
      const barW = 160;
      const barX = w / 2 - barW / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(barX, 16, barW, 20);
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(barX + 2, 18, (barW - 4) * remainingPct, 16);
      ctx.strokeStyle = '#00ffff';
      ctx.strokeRect(barX, 16, barW, 20);

      ctx.fillStyle = '#04020a';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SHIELD ACTIVE', w / 2, 30);
    }

    ctx.restore();
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(11, 8, 24, 0.88)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 25;
    ctx.font = 'bold 44px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', w / 2, h * 0.4);

    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.font = '22px "Courier New", monospace';
    ctx.fillText(`FINAL SCORE: ${Math.floor(this.state.score)}`, w / 2, h * 0.5);
    ctx.fillText(`COINS COLLECTED: ${this.state.coins}`, w / 2, h * 0.56);

    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('PRESS SPACE OR JUMP TO RESTART', w / 2, h * 0.7);

    ctx.restore();
  }
}
