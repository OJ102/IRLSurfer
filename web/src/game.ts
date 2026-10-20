/**
 * HTML5 Canvas 3-Lane Synthwave / Cyberpunk Arcade Runner.
 * Zero external asset dependencies: Pure Canvas 2D neon vector graphics,
 * Web Audio synthesized sound effects, smooth lerp interpolation,
 * obstacle avoidance (jump, duck, dodge), collectibles, combo streaks,
 * and hoverboard shield with punchy "Game Juice".
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

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  life: number;
  maxLife: number;
  scale: number;
  vy: number;
}

export interface GameOptions {
  soundEnabled?: boolean;
}

export class GameState {
  score: number = 0;
  highScore: number = 0;
  coins: number = 0;
  speed: number = 0.55; // Track speed multiplier
  speedMultiplier: number = 1.0;
  isGameOver: boolean = false;
  isPaused: boolean = false;
  isNewHighScore: boolean = false;

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

  // Dynamic Combo System & Juice Stats
  combo: number = 1;
  comboTimer: number = 0;
  maxCombo: number = 1;
  jumpsPerformed: number = 0;
  ducksPerformed: number = 0;
  obstaclesCleared: number = 0;
  screenShake: number = 0; // 0 to 1 intensity

  // Entities
  obstacles: Obstacle[] = [];
  coinsList: Coin[] = [];
  particles: Particle[] = [];
  floatingTexts: FloatingText[] = [];

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

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.5, Math.min(2.5, multiplier));
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
      this.isNewHighScore = true;
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
    this.isNewHighScore = false;
    this.targetLane = 0;
    this.currentLaneX = 0;
    this.isJumping = false;
    this.jumpY = 0;
    this.jumpVelocity = 0;
    this.isDucking = false;
    this.duckTimer = 0;
    this.isHoverboardActive = false;
    this.hoverboardRemainingSec = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.maxCombo = 1;
    this.jumpsPerformed = 0;
    this.ducksPerformed = 0;
    this.obstaclesCleared = 0;
    this.screenShake = 0;
    this.obstacles = [];
    this.coinsList = [];
    this.particles = [];
    this.floatingTexts = [];
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
      this.jumpsPerformed++;
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
    this.ducksPerformed++;
  }

  activateHoverboard(): void {
    if (this.isGameOver || this.isPaused) return;
    this.isHoverboardActive = true;
    this.hoverboardRemainingSec = this.HOVERBOARD_DURATION;
    this.spawnFloatingText('⚡ SHIELD ACTIVATED ⚡', 0, -50, '#00ffff', 18);
  }

  addCombo(amount: number = 1): void {
    this.combo += amount;
    this.comboTimer = 3.5; // 3.5s window
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    if (this.combo >= 2) {
      const colors = ['#00ffff', '#ffe600', '#ff00aa', '#00ff66'];
      const color = colors[(this.combo - 2) % colors.length];
      this.spawnFloatingText(`COMBO x${this.combo}!`, 0, -80, color, 20);
    }
  }

  spawnFloatingText(
    text: string,
    x: number,
    y: number,
    color: string = '#ffffff',
    fontSize: number = 16,
  ): void {
    this.floatingTexts.push({
      id: this._nextEntityId++,
      text,
      x,
      y,
      color,
      fontSize,
      life: 0,
      maxLife: 0.9,
      scale: 1.3,
      vy: 45,
    });
  }

  update(dt: number): {
    collision: boolean;
    shieldAbsorbed: boolean;
    coinCollected: boolean;
  } {
    if (this.isGameOver || this.isPaused) {
      this.screenShake = 0;
      return { collision: false, shieldAbsorbed: false, coinCollected: false };
    }

    // Clamp dt to prevent physics explosion on background tab switch
    const clampedDt = Math.min(dt, 0.1);

    // Increase score based on speed, combo, and time
    this.score += clampedDt * 10 * (1 + this.speed) * this.speedMultiplier;
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

    // 5. Combo Timer Decay
    if (this.comboTimer > 0) {
      this.comboTimer -= clampedDt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
        this.comboTimer = 0;
      }
    }

    // 6. Screen Shake Decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - clampedDt * 3.5);
    }

    // 7. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * clampedDt * this.speedMultiplier;
      p.y += p.vy * clampedDt * this.speedMultiplier;
      p.life += clampedDt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    // 8. Update Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= ft.vy * clampedDt;
      ft.life += clampedDt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 9. Spawn Obstacles and Coins
    this._spawnTimer += clampedDt * (0.8 + this.speed) * this.speedMultiplier;
    if (this._spawnTimer >= 1.5) {
      this._spawnTimer = 0;
      this.spawnWave();
    }

    // 10. Update Obstacles and check collisions
    let shieldAbsorbed = false;
    let collision = false;

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.z += clampedDt * (0.45 + this.speed * 0.4) * this.speedMultiplier;

      // Check collision zone (player is at z around 0.82 - 0.96)
      if (!obs.cleared && obs.z >= 0.82 && obs.z <= 0.96) {
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
              this.screenShake = 0.8;
              this.createShieldAbsorptionParticles();
              this.spawnFloatingText('🛡️ SHIELD DEFLECT!', 0, -60, '#00ffff', 18);
            } else {
              collision = true;
              this.isGameOver = true;
              this.screenShake = 0;
              this.combo = 1;
              this.comboTimer = 0;
              this.saveHighScore();
            }
          }
        }
      }

      // Safely cleared past player
      if (!obs.cleared && obs.z > 0.98) {
        obs.cleared = true;
        this.obstaclesCleared++;
        this.addCombo(1);
        if (obs.type === ObstacleType.LOW_HURDLE) {
          this.score += 30 * this.combo;
          this.spawnFloatingText('NICE JUMP! +30', 0, -60, '#00ffff', 16);
        } else if (obs.type === ObstacleType.HIGH_BEAM) {
          this.score += 30 * this.combo;
          this.spawnFloatingText('PERFECT DUCK! +30', 0, -60, '#ff00aa', 16);
        } else if (obs.type === ObstacleType.TALL_BLOCK) {
          this.score += 40 * this.combo;
          this.spawnFloatingText('CLEARED! +40', 0, -60, '#ffe600', 16);
        }
      }

      // Remove obstacles that moved past player
      if (obs.z > 1.1) {
        this.obstacles.splice(i, 1);
      }
    }

    // 11. Update Coins and Collectibles
    let coinCollected = false;
    for (let i = this.coinsList.length - 1; i >= 0; i--) {
      const coin = this.coinsList[i];
      coin.z += clampedDt * (0.45 + this.speed * 0.4) * this.speedMultiplier;

      if (!coin.collected && coin.z >= 0.80 && coin.z <= 0.96) {
        const laneDist = Math.abs(this.currentLaneX - coin.lane);
        // Can collect if on ground or low jump
        if (laneDist < 0.5 && this.jumpY < 0.5) {
          coin.collected = true;
          coinCollected = true;
          this.coins += 1;
          this.addCombo(1);
          const bonus = 50 * this.combo;
          this.score += bonus;
          this.createCoinParticles(coin.lane);
          this.spawnFloatingText(`+${bonus}`, (coin.lane - this.currentLaneX) * 110, -45, '#ffe600', 17);
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
    for (let i = 0; i < 45; i++) {
      const angle = (i / 45) * Math.PI * 2;
      const speed = 160 + Math.random() * 220;
      this.particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      });
    }
  }

  createCoinParticles(lane: Lane): void {
    const colors = ['#ffe600', '#ffffff', '#ffaa00'];
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 90;
      this.particles.push({
        x: lane * 100,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2.5 + Math.random() * 3,
        life: 0,
        maxLife: 0.38,
      });
    }
  }

  createConfetti(): void {
    const colors = ['#00ffff', '#ff007f', '#ffe600', '#00ff66', '#ffffff'];
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 260;
      this.particles.push({
        x: 0,
        y: -100,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.8,
      });
    }
  }
}

/**
 * Web Audio Synthesized Sound Effects (Punchy Arcade Synthwave Audio)
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  enabled: boolean = true;

  private initCtx(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.14);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Suppress audio error
    }
  }

  playDuck(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.16);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // Suppress audio error
    }
  }

  playWhoosh(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, now);
      filter.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
      filter.frequency.exponentialRampToValueAtTime(120, now + 0.14);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Suppress audio error
    }
  }

  playCoin(combo: number = 1): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Pentatonic pitch scale ascending with combo streak
      const pentatonic = [
        523.25, 587.33, 659.25, 783.99, 880.0,
        1046.5, 1174.66, 1318.51, 1567.98, 1760.0
      ];
      const baseIdx = (Math.max(1, combo) - 1) % pentatonic.length;
      const baseFreq = pentatonic[baseIdx];
      const nextFreq = pentatonic[(baseIdx + 2) % pentatonic.length];

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(baseFreq, now);
      osc2.frequency.setValueAtTime(nextFreq, now + 0.05);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.12);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.22);
    } catch {
      // Suppress audio error
    }
  }

  playShieldAbsorb(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.32);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch {
      // Suppress audio error
    }
  }

  playGameOver(): void {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      // Heavy synth bass impact on collision
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.45);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Suppress audio error
    }
  }
}

/**
 * Arcade Runner Canvas Renderer and Game Controller.
 */
export class RunnerGame {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly state: GameState;
  readonly sounds: SoundEffects;

  speedMultiplier: number = 1.0;

  private _animationFrameId: number | null = null;
  private _lastTimestamp: number = 0;
  private _gridOffset: number = 0;
  private _nebulaStars: Array<{ x: number; y: number; size: number; phase: number; color: string }> = [];

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

    this.initNebulaStars();
    this.bindKeyboard();
    this.bindCanvasEvents();
  }

  private initNebulaStars(): void {
    const starColors = ['#00ffff', '#ff00aa', '#ffe600', '#ffffff'];
    for (let i = 0; i < 70; i++) {
      this._nebulaStars.push({
        x: ((i * 37) % 100) / 100,
        y: ((i * 53) % 100) / 100,
        size: 1 + (i % 3),
        phase: (i * 0.7) % (Math.PI * 2),
        color: starColors[i % starColors.length],
      });
    }
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.5, Math.min(2.5, multiplier));
    this.state.setSpeedMultiplier(this.speedMultiplier);
  }

  private bindKeyboard(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.state.moveLeft();
          this.sounds.playWhoosh();
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.state.moveRight();
          this.sounds.playWhoosh();
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

  private bindCanvasEvents(): void {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
    this.canvas.addEventListener('click', () => {
      if (this.state.isGameOver) {
        this.state.restart();
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
      this.sounds.playCoin(this.state.combo);
    }
    if (outcome.shieldAbsorbed) {
      this.sounds.playShieldAbsorb();
    }
    if (outcome.collision) {
      this.sounds.playGameOver();
      if (this.state.isNewHighScore) {
        this.state.createConfetti();
      }
    }

    this._gridOffset =
      (this._gridOffset +
        dt * (1.2 + this.state.speed * 1.5) * this.speedMultiplier) %
      1.0;

    this.render();
    this._animationFrameId = requestAnimationFrame(this.loop);
  }

  render(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const now = performance.now();

    ctx.save();

    // Subtle screen shake on shield hit (never when game over or paused)
    if (!this.state.isGameOver && !this.state.isPaused && this.state.screenShake > 0 && ctx.translate) {
      const shakeMag = Math.min(5, this.state.screenShake * 5);
      const sx = (Math.random() - 0.5) * shakeMag;
      const sy = (Math.random() - 0.5) * shakeMag;
      ctx.translate(sx, sy);
    }

    // Clear background: Sleek dark midnight
    ctx.fillStyle = '#0a0d17';
    ctx.fillRect(0, 0, w, h);

    // Horizon line at 28% from top
    const horizonY = h * 0.28;
    const vanishX = w * 0.5;

    // 1. Clean, calm horizon & sky (KISS)
    this.drawSky(ctx, w, horizonY, vanishX, now);

    // 2. Crisp, high-readability 3-Lane Track
    this.drawTrack(ctx, w, h, horizonY, vanishX);

    // 4. Draw 3D Spinning Gold Coins
    this.drawCoins(ctx, w, h, horizonY, vanishX, now);

    // 5. Draw Obstacles (Hurdles, High Beams, Cyber Road Blockers)
    this.drawObstacles(ctx, w, h, horizonY, vanishX, now);

    // 6. Draw Player Avatar (Neon Hoverboard Surfer)
    this.drawPlayer(ctx, w, h, horizonY, vanishX, now);

    // 7. Draw Particles
    this.drawParticles(ctx, w, h, horizonY, vanishX);

    // 8. Draw Floating Popups (Game Juice)
    this.drawFloatingTexts(ctx, w, h, horizonY, vanishX);

    // 9. Modern Glassmorphism Scoreboard HUD
    this.drawHUD(ctx, w);

    // 10. Draw Game Over Overlay with Run Summary
    if (this.state.isGameOver) {
      this.drawGameOver(ctx, w, h);
    }

    ctx.restore();
  }

  private drawSky(
    ctx: CanvasRenderingContext2D,
    w: number,
    horizonY: number,
    _vanishX: number,
    _now: number,
  ): void {
    // Clean, calm dark sky gradient (KISS principle)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#0a0d18');
    skyGrad.addColorStop(0.7, '#111726');
    skyGrad.addColorStop(1, '#1b233a');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // Subtle, gentle non-flickering stars
    ctx.save();
    for (const star of this._nebulaStars) {
      const sx = star.x * w;
      const sy = star.y * horizonY * 0.9;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.75, star.size * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Clean, minimalist skyline silhouette (calm dark slate, no flashing lights)
    const distantParallax = -this.state.currentLaneX * 8;
    ctx.save();
    ctx.fillStyle = '#0f1422';
    const buildingCount = 12;
    const bW = (w * 1.2) / buildingCount;
    for (let i = 0; i < buildingCount; i++) {
      const bx = (i - 1) * bW + distantParallax;
      const bH = 25 + ((i * 17) % 45);
      ctx.fillRect(bx, horizonY - bH, bW * 0.88, bH);
    }
    ctx.restore();

    // Subtle clean horizon line
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();
    ctx.restore();
  }

  private getTrackX(lane: number, z: number, w: number, vanishX: number): number {
    const bottomTrackHalfWidth = w * 0.44;
    const topTrackHalfWidth = w * 0.05;
    const trackHalfWidth =
      topTrackHalfWidth + (bottomTrackHalfWidth - topTrackHalfWidth) * z;
    const laneWidth = (trackHalfWidth * 2) / 3;

    return vanishX + lane * laneWidth;
  }

  private getTrackY(z: number, h: number, horizonY: number): number {
    const depth = Math.pow(z, 1.85);
    return horizonY + (h - horizonY) * depth;
  }

  private drawTrack(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
  ): void {
    // Clean track floor: dark asphalt
    const floorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    floorGrad.addColorStop(0, '#101524');
    floorGrad.addColorStop(1, '#0b0e18');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Track boundary points (-1.5 to +1.5 lane width)
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
    ctx.fillStyle = '#161d2f';
    ctx.fill();

    // Clean outer rails (calm cyan accent)
    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    for (const laneDiv of [-1.5, 1.5]) {
      const topX = this.getTrackX(laneDiv, 0, w, vanishX);
      const bottomX = this.getTrackX(laneDiv, 1, w, vanishX);
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(bottomX, h);
      ctx.stroke();
    }

    // Clean inner lane dividers: dashed lines separating the 3 lanes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([12, 16]);
    for (const laneDiv of [-0.5, 0.5]) {
      const topX = this.getTrackX(laneDiv, 0, w, vanishX);
      const bottomX = this.getTrackX(laneDiv, 1, w, vanishX);
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(bottomX, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Subtle forward track ties
    const numTies = 10;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < numTies; i++) {
      const zNorm = ((i + this._gridOffset) % numTies) / numTies;
      if (zNorm < 0.05 || zNorm > 0.98) continue;
      const y = this.getTrackY(zNorm, h, horizonY);
      const leftX = this.getTrackX(-1.5, zNorm, w, vanishX);
      const rightX = this.getTrackX(1.5, zNorm, w, vanishX);

      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawCoins(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
    now: number,
  ): void {
    ctx.save();
    for (const coin of this.state.coinsList) {
      if (coin.collected || coin.z < 0.05 || coin.z > 1.05) continue;

      const cx = this.getTrackX(coin.lane, coin.z, w, vanishX);
      const cy = this.getTrackY(coin.z, h, horizonY) - 18 * coin.z;
      const radius = Math.max(4, 15 * coin.z);

      // 3D rotation spin
      const spinAngle = now * 0.005 + coin.id * 1.2;
      const cosSpin = Math.cos(spinAngle);
      const coinWidth = radius * Math.max(0.15, Math.abs(cosSpin));

      // 3D Coin Edge Shading
      ctx.fillStyle = '#b37700';
      ctx.beginPath();
      ctx.ellipse(cx + 2 * cosSpin, cy, coinWidth, radius, 0, 0, Math.PI * 2);
      ctx.fill();

      // Gold Coin Face
      ctx.fillStyle = '#ffe600';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 14 * coin.z;
      ctx.beginPath();
      ctx.ellipse(cx, cy, coinWidth, radius, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner Coin Core
      ctx.fillStyle = '#fff480';
      ctx.beginPath();
      ctx.ellipse(cx, cy, coinWidth * 0.65, radius * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rotating sparkle rings around coin
      const sparkleAngle = now * 0.004 + coin.id;
      const sRadius = radius * 1.4;
      for (let s = 0; s < 3; s++) {
        const a = sparkleAngle + (s * Math.PI * 2) / 3;
        const sx = cx + Math.cos(a) * sRadius * 0.8;
        const sy = cy + Math.sin(a) * sRadius * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, 2 * coin.z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawObstacles(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
    now: number,
  ): void {
    ctx.save();
    for (const obs of this.state.obstacles) {
      if (obs.cleared || obs.z < 0.02 || obs.z > 1.05) continue;

      const cx = this.getTrackX(obs.lane, obs.z, w, vanishX);
      const groundY = this.getTrackY(obs.z, h, horizonY);
      const width = Math.max(10, (w * 0.24) * obs.z);

      switch (obs.type) {
        case ObstacleType.HIGH_BEAM: {
          // Overhead duck laser gantry
          const beamY = groundY - Math.max(22, 65 * obs.z);
          const beamH = Math.max(5, 16 * obs.z);

          // Support side pylons
          ctx.strokeStyle = '#ff0055';
          ctx.lineWidth = Math.max(1.5, 3.5 * obs.z);
          ctx.shadowColor = '#ff0055';
          ctx.shadowBlur = 10 * obs.z;

          ctx.beginPath();
          ctx.moveTo(cx - width * 0.5, groundY);
          ctx.lineTo(cx - width * 0.5, beamY);
          ctx.moveTo(cx + width * 0.5, groundY);
          ctx.lineTo(cx + width * 0.5, beamY);
          ctx.stroke();

          // High neon beam frame
          ctx.fillStyle = '#ff0055';
          ctx.fillRect(cx - width * 0.5, beamY, width, beamH);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - width * 0.45, beamY + beamH * 0.25, width * 0.9, beamH * 0.5);

          // Warning lasers: Animated vertical laser beams down to track
          ctx.save();
          const laserPulse = (Math.sin(now * 0.012 + obs.id) + 1) * 0.4 + 0.2;
          ctx.strokeStyle = `rgba(255, 0, 85, ${laserPulse})`;
          ctx.lineWidth = Math.max(1, 2 * obs.z);
          ctx.shadowColor = '#ff0055';
          ctx.shadowBlur = 8;
          for (let l = -2; l <= 2; l++) {
            const lx = cx + l * (width * 0.18);
            ctx.beginPath();
            ctx.moveTo(lx, beamY + beamH);
            ctx.lineTo(lx, groundY);
            ctx.stroke();
          }
          ctx.restore();

          // "DUCK" alert tag on high obstacle
          if (obs.z > 0.35) {
            ctx.fillStyle = '#ffe600';
            ctx.font = `bold ${Math.floor(11 * obs.z)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('▼ DUCK ▼', cx, beamY - 6);
          }
          break;
        }

        case ObstacleType.LOW_HURDLE: {
          // Jump over barrier: on track ground with hazard stripes and warning beacon
          const hurdleH = Math.max(8, 28 * obs.z);
          ctx.fillStyle = '#00ffff';
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 14 * obs.z;

          // Electric rail hurdle frame
          ctx.fillRect(cx - width * 0.5, groundY - hurdleH, width, hurdleH);

          // Diagonal Hazard Stripes (Black & Yellow)
          ctx.save();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = Math.max(1.5, 4 * obs.z);
          ctx.beginPath();
          for (let s = -width * 0.45; s < width * 0.45; s += Math.max(8, 16 * obs.z)) {
            ctx.moveTo(cx + s, groundY);
            ctx.lineTo(cx + s + Math.max(5, 10 * obs.z), groundY - hurdleH);
          }
          ctx.stroke();
          ctx.restore();

          // Flashing warning beacon on top
          const beaconFlash = Math.sin(now * 0.015 + obs.id) > 0;
          ctx.fillStyle = beaconFlash ? '#ff0055' : '#ffe600';
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(cx, groundY - hurdleH - 3, Math.max(2, 4 * obs.z), 0, Math.PI * 2);
          ctx.fill();

          if (obs.z > 0.35) {
            ctx.fillStyle = '#00ffff';
            ctx.font = `bold ${Math.floor(11 * obs.z)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('▲ JUMP ▲', cx, groundY - hurdleH - 8);
          }
          break;
        }

        case ObstacleType.TALL_BLOCK: {
          // Cyber Road Blocker / Train with glowing headlights
          const blockH = Math.max(18, 80 * obs.z);
          ctx.fillStyle = '#1c0f33';
          ctx.strokeStyle = '#ff7700';
          ctx.lineWidth = Math.max(1.5, 3 * obs.z);
          ctx.shadowColor = '#ff7700';
          ctx.shadowBlur = 16 * obs.z;

          // Armored hull
          ctx.fillRect(cx - width * 0.45, groundY - blockH, width * 0.9, blockH);
          ctx.strokeRect(cx - width * 0.45, groundY - blockH, width * 0.9, blockH);

          // Glowing Headlights casting forward light beams
          const lightRadius = Math.max(2, 6 * obs.z);
          const leftLightX = cx - width * 0.28;
          const rightLightX = cx + width * 0.28;
          const lightY = groundY - blockH * 0.3;

          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(leftLightX, lightY, lightRadius, 0, Math.PI * 2);
          ctx.arc(rightLightX, lightY, lightRadius, 0, Math.PI * 2);
          ctx.fill();

          // Forward headlight cones
          ctx.save();
          ctx.fillStyle = 'rgba(0, 255, 255, 0.12)';
          ctx.beginPath();
          ctx.moveTo(leftLightX, lightY);
          ctx.lineTo(leftLightX - width * 0.3, groundY + 15 * obs.z);
          ctx.lineTo(leftLightX + width * 0.1, groundY + 15 * obs.z);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(rightLightX, lightY);
          ctx.lineTo(rightLightX - width * 0.1, groundY + 15 * obs.z);
          ctx.lineTo(rightLightX + width * 0.3, groundY + 15 * obs.z);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Front cyber grill & hazard stripes
          ctx.fillStyle = '#ff7700';
          ctx.fillRect(cx - width * 0.35, groundY - blockH * 0.18, width * 0.7, blockH * 0.12);

          if (obs.z > 0.35) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.floor(12 * obs.z)}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText('DODGE ◀▶', cx, groundY - blockH - 7);
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
    now: number,
  ): void {
    const playerZ = 0.88;
    const px = this.getTrackX(this.state.currentLaneX, playerZ, w, vanishX);
    const groundY = this.getTrackY(playerZ, h, horizonY);

    // Jump offset (in pixels)
    const jumpOffsetPx = this.state.jumpY * (h * 0.3);
    const py = groundY - jumpOffsetPx;

    ctx.save();

    // 1. Dynamic ground shadow beneath player (scales down & softens when jumping)
    const shadowScale = 1.0 - Math.min(0.65, this.state.jumpY * 0.6);
    const shadowWidth = (w * 0.13) * shadowScale;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.65 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(px, groundY, shadowWidth * 0.6, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Under-board boost flare when ascending
    if (this.state.isJumping && this.state.jumpVelocity > 0) {
      ctx.save();
      const flareGrad = ctx.createLinearGradient(px, py, px, groundY);
      flareGrad.addColorStop(0, '#00ffff');
      flareGrad.addColorStop(0.5, 'rgba(255, 0, 127, 0.4)');
      flareGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = flareGrad;
      ctx.beginPath();
      ctx.moveTo(px - 14, py + 2);
      ctx.lineTo(px + 14, py + 2);
      ctx.lineTo(px, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 3. Dynamic Board Banking (tilts left/right when changing lanes)
    const laneDiff = this.state.targetLane - this.state.currentLaneX;
    const bankAngle = laneDiff * 0.3;

    if (ctx.translate && ctx.rotate) {
      ctx.translate(px, py);
      ctx.rotate(bankAngle);
    }

    // 4. Dual Particle Thruster Embers trailing behind hoverboard
    const isHighCombo = this.state.combo >= 3;
    const thrusterColor = isHighCombo
      ? `hsl(${(now * 0.5) % 360}, 100%, 65%)`
      : '#00ffff';

    // Left & Right Thruster Flares
    ctx.fillStyle = thrusterColor;
    ctx.shadowColor = thrusterColor;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(-14, 6, 4, 10, 0, 0, Math.PI * 2);
    ctx.ellipse(14, 6, 4, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // High combo rainbow / electric plasma trail
    if (isHighCombo) {
      ctx.save();
      ctx.strokeStyle = thrusterColor;
      ctx.lineWidth = 4;
      ctx.shadowColor = thrusterColor;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(-16, 12);
      ctx.lineTo(-20 + Math.sin(now * 0.05) * 8, 38);
      ctx.moveTo(16, 12);
      ctx.lineTo(20 - Math.sin(now * 0.05) * 8, 38);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Glowing Neon Hoverboard Chassis
    const boardWidth = w * 0.095;
    ctx.fillStyle = '#0a0517';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.ellipse(0, 0, boardWidth * 0.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner board neon deck accent
    ctx.fillStyle = '#ff00aa';
    ctx.shadowColor = '#ff00aa';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(0, 0, boardWidth * 0.28, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 6. Surfer Avatar (Kinematics: Crouch when ducking, upright when jumping/running)
    const isDucking = this.state.isDucking;
    const bodyHeight = isDucking ? 24 : 52;

    // Surfer Suit / Body
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.lineTo(10, -6);
    ctx.lineTo(6, -6 - bodyHeight * 0.7);
    ctx.lineTo(-6, -6 - bodyHeight * 0.7);
    ctx.closePath();
    ctx.fill();

    // Helmet / Visor
    const headY = -6 - bodyHeight;
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(0, headY + 7, 8, 0, Math.PI * 2);
    ctx.fill();

    // Visor glow line
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, headY + 7);
    ctx.lineTo(6, headY + 7);
    ctx.stroke();

    // Ducking: horizontal speed sparks skimming air
    if (isDucking) {
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-boardWidth * 0.55, -2);
      ctx.lineTo(-boardWidth * 0.8, -2);
      ctx.moveTo(boardWidth * 0.55, -2);
      ctx.lineTo(boardWidth * 0.8, -2);
      ctx.stroke();
    }

    // 7. Hoverboard Shield (Shimmering Translucent Hexagonal Energy Bubble)
    if (this.state.isHoverboardActive) {
      const shieldRadius = Math.max(32, w * 0.08);
      const pulse = 1.0 + Math.sin(now * 0.008) * 0.08;
      const curRadius = shieldRadius * pulse;

      ctx.save();
      // Draw Hexagonal energy bubble
      ctx.beginPath();
      for (let s = 0; s < 6; s++) {
        const hexAngle = (s * Math.PI) / 3 + now * 0.002;
        const hx = Math.cos(hexAngle) * curRadius;
        const hy = -20 + Math.sin(hexAngle) * curRadius;
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 24;
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
      ctx.fill();

      // Rotating electric ring around shield
      const ringAngle = now * 0.006;
      ctx.strokeStyle = '#ff00aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -20, curRadius * 0.85, curRadius * 0.45, ringAngle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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

  private drawFloatingTexts(
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
    for (const ft of this.state.floatingTexts) {
      const progress = ft.life / ft.maxLife;
      const alpha = Math.max(0, 1.0 - progress * progress);
      const popScale = 1.0 + 0.3 * Math.exp(-progress * 6);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 12;
      ctx.font = `bold ${Math.floor(ft.fontSize * popScale)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, px + ft.x, py + ft.y);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawHUD(ctx: CanvasRenderingContext2D, w: number): void {
    ctx.save();

    // Glassmorphic Top Header Bar
    const hudW = w - 32;
    const hudH = 52;
    const hudX = 16;
    const hudY = 12;

    ctx.fillStyle = 'rgba(14, 9, 28, 0.85)';
    ctx.fillRect(hudX, hudY, hudW, hudH);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hudX, hudY, hudW, hudH);

    // Score display
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 6;
    ctx.fillText(`SCORE: ${Math.floor(this.state.score)}`, hudX + 16, hudY + 32);

    // Coins
    ctx.fillStyle = '#ffe600';
    ctx.shadowColor = '#ffe600';
    ctx.fillText(`★ COINS: ${this.state.coins}`, hudX + 190, hudY + 32);

    // Dynamic Combo Streak Pill Badge
    if (this.state.combo > 1) {
      const comboX = hudX + 340;
      const comboW = 105;
      const comboH = 28;
      ctx.fillStyle = 'rgba(255, 0, 127, 0.25)';
      ctx.fillRect(comboX, hudY + 12, comboW, comboH);
      ctx.strokeStyle = '#ff00aa';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(comboX, hudY + 12, comboW, comboH);

      ctx.fillStyle = '#ff00aa';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#ff00aa';
      ctx.shadowBlur = 10;
      ctx.fillText(`COMBO x${this.state.combo}!`, comboX + comboW / 2, hudY + 30);
    }

    // High score
    ctx.fillStyle = '#ff00aa';
    ctx.shadowColor = '#ff00aa';
    ctx.textAlign = 'right';
    ctx.fillText(`BEST: ${this.state.highScore}`, hudX + hudW - 140, hudY + 32);

    // Speed multiplier pill badge
    const speedText = `${this.speedMultiplier.toFixed(1)}x SPEED`;
    const pillW = 95;
    const pillH = 26;
    const pillX = hudX + hudW - 110;
    const pillY = hudY + 13;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pillX, pillY, pillW, pillH);
    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(speedText, pillX + pillW / 2, pillY + 17);

    // Hoverboard shield status bar
    if (this.state.isHoverboardActive) {
      const remainingPct = this.state.hoverboardRemainingSec / this.state.HOVERBOARD_DURATION;
      const barW = 140;
      const barX = w / 2 - barW / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(barX, hudY + 14, barW, 24);
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(barX + 2, hudY + 16, (barW - 4) * remainingPct, 20);
      ctx.strokeStyle = '#00ffff';
      ctx.strokeRect(barX, hudY + 14, barW, 24);

      ctx.fillStyle = '#04020a';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SHIELD ACTIVE', w / 2, hudY + 30);
    }

    ctx.restore();
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    ctx.save();
    // Frosted dark backdrop
    ctx.fillStyle = 'rgba(8, 5, 18, 0.88)';
    ctx.fillRect(0, 0, w, h);

    // Glassmorphic Modal Card in center
    const cardW = Math.min(520, w * 0.85);
    const cardH = Math.min(420, h * 0.8);
    const cardX = w * 0.5 - cardW * 0.5;
    const cardY = h * 0.5 - cardH * 0.5;

    ctx.fillStyle = 'rgba(18, 12, 38, 0.95)';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = this.state.isNewHighScore ? '#ffe600' : '#ff007f';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 24;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    // Header Title
    ctx.textAlign = 'center';
    if (this.state.isNewHighScore) {
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.fillText('🏆 NEW HIGH SCORE! 🏆', w / 2, cardY + 50);
    } else {
      ctx.fillStyle = '#ff0055';
      ctx.font = 'bold 34px "Courier New", monospace';
      ctx.fillText('GAME OVER', w / 2, cardY + 50);
    }

    // Run Summary Grid
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText(`FINAL SCORE: ${Math.floor(this.state.score)}`, w / 2, cardY + 105);
    ctx.fillText(`COINS COLLECTED: ${this.state.coins}`, w / 2, cardY + 145);
    ctx.fillText(`MAX COMBO: x${this.state.maxCombo}`, w / 2, cardY + 185);
    ctx.fillText(`OBSTACLES CLEARED: ${this.state.obstaclesCleared}`, w / 2, cardY + 225);
    ctx.fillText(`JUMPS / DUCKS: ${this.state.jumpsPerformed} / ${this.state.ducksPerformed}`, w / 2, cardY + 265);

    // Pulsating Replay Affordance Button
    const pulse = Math.sin(performance.now() * 0.008) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(0, 255, 255, ${pulse})`;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 14;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('PRESS SPACE OR JUMP TO RESTART', w / 2, cardY + cardH - 35);

    ctx.restore();
  }
}

export const GameRunner = RunnerGame;
export type GameRunner = RunnerGame;
