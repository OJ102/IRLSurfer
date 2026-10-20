/**
 * HTML5 Canvas 3-Lane California Beach Surfer Arcade Runner.
 * Venice Beach & Pacific Coast Highway aesthetic:
 * Sun-bleached wooden boardwalk pier, rolling Pacific turquoise waves,
 * distant warm coastal cliffs & fan palm trees, warm golden California sun,
 * retro wood-grain longboard with water spray droplets, beach obstacles,
 * sparkling golden starfish, and mellow beach chimes / ocean whooshes.
 */

export type Lane = -1 | 0 | 1;

export enum ObstacleType {
  HIGH_BEAM = 'HIGH_BEAM',   // Must duck under (Surf Shack canopy awning)
  LOW_HURDLE = 'LOW_HURDLE', // Must jump over (Driftwood log / Beach volleyball net)
  TALL_BLOCK = 'TALL_BLOCK', // Must dodge to another lane (Lifeguard tower / Surfboard rack)
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
  speed: number = 0.55;
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

  // Duck movement (Surf Tuck)
  isDucking: boolean = false;
  duckTimer: number = 0;

  // Super-Surf Wave Shield
  isHoverboardActive: boolean = false;
  hoverboardRemainingSec: number = 0;

  // Dynamic Combo System & Juice Stats
  combo: number = 1;
  comboTimer: number = 0;
  maxCombo: number = 1;
  jumpsPerformed: number = 0;
  ducksPerformed: number = 0;
  obstaclesCleared: number = 0;
  screenShake: number = 0;

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
  readonly LERP_SPEED = 14.0;

  onRestart?: () => void;

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
      // LocalStorage unavailable in sandbox
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
    this.onRestart?.();
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
      // Fast fall when tucking in air
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
    this.spawnFloatingText('☀️ SUPER-SURF WAVE SHIELD! ☀️', 0, -50, '#fbbf24', 18);
  }

  addCombo(amount: number = 1): void {
    this.combo += amount;
    this.comboTimer = 3.5;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    if (this.combo >= 2) {
      const colors = ['#38bdf8', '#fbbf24', '#f97316', '#34d399'];
      const color = colors[(this.combo - 2) % colors.length];
      this.spawnFloatingText(`SWELL x${this.combo}!`, 0, -80, color, 20);
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
    const clampedDt = Math.max(0.0, Math.min(dt, 0.1));

    // Update Particles (celebratory confetti & sea spray) even during game over / pause
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * clampedDt * this.speedMultiplier;
      p.y += p.vy * clampedDt * this.speedMultiplier;
      p.life += clampedDt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    // Update Floating Texts (fadeouts & celebratory popups) even during game over / pause
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= ft.vy * clampedDt;
      ft.life += clampedDt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }

    if (this.isGameOver || this.isPaused) {
      this.screenShake = 0;
      return { collision: false, shieldAbsorbed: false, coinCollected: false };
    }

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

    // 3. Duck Timer (Surf Tuck)
    if (this.isDucking) {
      this.duckTimer -= clampedDt;
      if (this.duckTimer <= 0) {
        this.isDucking = false;
        this.duckTimer = 0;
      }
    }

    // 4. Super-Surf Shield Timer
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

    // 7. Spawn Obstacles and Coins
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
              if (!this.isDucking) {
                hit = true;
              }
              break;
            case ObstacleType.LOW_HURDLE:
              if (!this.isJumping || this.jumpY < 0.22) {
                hit = true;
              }
              break;
            case ObstacleType.TALL_BLOCK:
              hit = true;
              break;
          }

          if (hit) {
            if (this.isHoverboardActive) {
              this.isHoverboardActive = false;
              this.hoverboardRemainingSec = 0;
              obs.cleared = true;
              shieldAbsorbed = true;
              this.screenShake = 0.5;
              this.createShieldAbsorptionParticles();
              this.spawnFloatingText('🌊 SWELL DEFLECT!', 0, -60, '#38bdf8', 18);
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
          this.spawnFloatingText('CLEAN LEAP! +30', 0, -60, '#38bdf8', 16);
        } else if (obs.type === ObstacleType.HIGH_BEAM) {
          this.score += 30 * this.combo;
          this.spawnFloatingText('PERFECT TUCK! +30', 0, -60, '#fbbf24', 16);
        } else if (obs.type === ObstacleType.TALL_BLOCK) {
          this.score += 40 * this.combo;
          this.spawnFloatingText('SWEET CARVE! +40', 0, -60, '#f97316', 16);
        }
      }

      if (obs.z > 1.1) {
        this.obstacles.splice(i, 1);
      }
    }

    // 11. Update Coins (Golden Starfish)
    let coinCollected = false;
    for (let i = this.coinsList.length - 1; i >= 0; i--) {
      const coin = this.coinsList[i];
      coin.z += clampedDt * (0.45 + this.speed * 0.4) * this.speedMultiplier;

      if (!coin.collected && coin.z >= 0.80 && coin.z <= 0.96) {
        const laneDist = Math.abs(this.currentLaneX - coin.lane);
        if (laneDist < 0.5 && this.jumpY < 0.5) {
          coin.collected = true;
          coinCollected = true;
          this.coins += 1;
          this.addCombo(1);
          const bonus = 50 * this.combo;
          this.score += bonus;
          this.createCoinParticles(coin.lane);
          this.spawnFloatingText(`+${bonus}`, (coin.lane - this.currentLaneX) * 110, -45, '#fbbf24', 17);
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
    const colors = ['#bae6fd', '#38bdf8', '#fbbf24', '#ffffff', '#fed7aa'];
    for (let i = 0; i < 45; i++) {
      const angle = (i / 45) * Math.PI * 2;
      const speed = 140 + Math.random() * 180;
      this.particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3.5,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      });
    }
  }

  createCoinParticles(lane: Lane): void {
    const colors = ['#fbbf24', '#fef08a', '#ffffff', '#f59e0b'];
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 80;
      this.particles.push({
        x: lane * 100,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2.5 + Math.random() * 2.5,
        life: 0,
        maxLife: 0.38,
      });
    }
  }

  createConfetti(): void {
    const colors = ['#38bdf8', '#fbbf24', '#f97316', '#34d399', '#fed7aa', '#ffffff'];
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 110 + Math.random() * 220;
      this.particles.push({
        x: 0,
        y: -100,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.8,
      });
    }
  }
}

/**
 * Web Audio Synthesized Sound Effects (Gentle, Mellow Beach Chimes & Ocean Waves)
 */
export class SoundEffects {
  private ctx: AudioContext | null = null;
  enabled: boolean = true;

  get isMuted(): boolean {
    return !this.enabled;
  }

  set isMuted(value: boolean) {
    this.enabled = !value;
  }

  toggleMute(): boolean {
    this.enabled = !this.enabled;
    return this.isMuted;
  }

  resume(): void {
    this.initCtx();
  }

  initCtx(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      // Gentle mellow rising sunny chime
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(329.63, now); // E4
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.16); // E5
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
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
      // Soft mellow acoustic swoop
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.16);
      gain.gain.setValueAtTime(0.12, now);
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
      // Gentle ocean breeze / surf carving whoosh
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(260, now);
      filter.frequency.exponentialRampToValueAtTime(750, now + 0.08);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.18);
      filter.Q.setValueAtTime(1.5, now);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
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

      // Warm sunny beach marimba chime (Pentatonic G Major scale)
      const pentatonic = [
        392.0, 440.0, 493.88, 587.33, 659.25,
        783.99, 880.0, 987.77, 1174.66, 1318.51,
      ];
      const baseIdx = (Math.max(1, combo) - 1) % pentatonic.length;
      const f1 = pentatonic[baseIdx];
      const f2 = pentatonic[(baseIdx + 2) % pentatonic.length];

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(f1, now);
      osc2.frequency.setValueAtTime(f2, now + 0.04);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.16);
      osc2.start(now + 0.04);
      osc2.stop(now + 0.24);
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
      // Resonant warm ocean chime with gentle bell decay
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(261.63, now + 0.35);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
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
      // Gentle mellow ocean wave swell receding
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.45);
      gain.gain.setValueAtTime(0.2, now);
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
 * California Beach Surfer Canvas Renderer and Game Controller.
 */
export class RunnerGame {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly state: GameState;
  readonly sounds: SoundEffects;

  readonly virtualWidth: number = 800;
  readonly virtualHeight: number = 600;
  private dpr: number = 1;

  speedMultiplier: number = 1.0;

  get isMuted(): boolean {
    return this.sounds.isMuted;
  }

  set isMuted(value: boolean) {
    this.sounds.isMuted = value;
  }

  toggleMute(): boolean {
    return this.sounds.toggleMute();
  }

  resumeAudio(): void {
    this.sounds.resume();
  }

  get onRestart(): (() => void) | undefined {
    return this.state.onRestart;
  }

  set onRestart(callback: (() => void) | undefined) {
    this.state.onRestart = callback;
  }

  restart(): void {
    this.state.restart();
  }

  private _animationFrameId: number | null = null;
  private _lastTimestamp: number = 0;
  private _trackOffset: number = 0;
  private _birds: Array<{ x: number; y: number; speed: number; size: number; phase: number }> = [];

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

    this.resize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.resize());
    }

    this.initSeabirds();
    this.bindKeyboard();
    this.bindCanvasEvents();
  }

  resize(): void {
    this.dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    if (this.canvas) {
      this.canvas.width = Math.round(this.virtualWidth * this.dpr);
      this.canvas.height = Math.round(this.virtualHeight * this.dpr);
    }
  }

  private initSeabirds(): void {
    for (let i = 0; i < 4; i++) {
      this._birds.push({
        x: (i * 0.28) % 1.0,
        y: 0.05 + (i * 0.04),
        speed: 0.025 + (i * 0.01),
        size: 5 + i * 2,
        phase: i * 1.5,
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
    const rawDt = (now - this._lastTimestamp) / 1000.0;
    const dt = Math.max(0.0, Math.min(rawDt, 0.1));
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

    if (!this.state.isGameOver && !this.state.isPaused) {
      this._trackOffset =
        (this._trackOffset +
          dt * (1.2 + this.state.speed * 1.5) * this.speedMultiplier) %
        1.0;
    }

    // Update seabirds
    for (const bird of this._birds) {
      bird.x = (bird.x + dt * bird.speed) % 1.2;
    }

    this.render();
    this._animationFrameId = requestAnimationFrame(this.loop);
  }

  render(): void {
    const ctx = this.ctx;
    const w = this.virtualWidth;
    const h = this.virtualHeight;
    const now = performance.now();

    ctx.save();
    if (this.dpr !== 1 && typeof ctx.scale === 'function') {
      ctx.scale(this.dpr, this.dpr);
    }

    // Subtle natural camera sway on shield deflect
    if (!this.state.isGameOver && !this.state.isPaused && this.state.screenShake > 0 && typeof ctx.translate === 'function') {
      const shakeMag = Math.min(4, this.state.screenShake * 4);
      const sx = (Math.random() - 0.5) * shakeMag;
      const sy = (Math.random() - 0.5) * shakeMag;
      ctx.translate(sx, sy);
    }

    // Horizon line at 30% from top
    const horizonY = h * 0.30;
    const vanishX = w * 0.5;

    // 1. Warm Golden Hour California Sky, Mountains, Palms & Sun
    this.drawSky(ctx, w, horizonY, vanishX, now);

    // 2. Pacific Ocean Waves on the sides & Sun-Bleached Wooden Pier Boardwalk
    this.drawTrack(ctx, w, h, horizonY, vanishX, now);

    // 3. Sparkling Golden Starfish Collectibles
    this.drawCoins(ctx, w, h, horizonY, vanishX, now);

    // 4. Beach Obstacles (Driftwood hurdle, Surf Shack awning, Lifeguard tower)
    this.drawObstacles(ctx, w, h, horizonY, vanishX, now);

    // 5. Retro Wood-Grain Longboard Surfer & Water Spray
    this.drawPlayer(ctx, w, h, horizonY, vanishX, now);

    // 6. Natural Ocean Spray Particles
    this.drawParticles(ctx, w, h, horizonY, vanishX);

    // 7. Floating Beach Popups
    this.drawFloatingTexts(ctx, w, h, horizonY, vanishX);

    // 8. Frosted Sea-Glass Glassmorphic Scoreboard HUD
    this.drawHUD(ctx, w);

    // 9. Sunset Run Summary Overlay
    if (this.state.isGameOver) {
      this.drawGameOver(ctx, w, h);
    }

    ctx.restore();
  }

  private drawSky(
    ctx: CanvasRenderingContext2D,
    w: number,
    horizonY: number,
    vanishX: number,
    now: number,
  ): void {
    // 1. Warm Golden Hour / Pacific Sky Gradient:
    // Pacific blue sky (#38bdf8) down to warm golden peach (#fed7aa) and sunset yellow (#fef08a)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#0284c7');     // Deep Pacific blue
    skyGrad.addColorStop(0.35, '#38bdf8');  // Warm coastal sky
    skyGrad.addColorStop(0.72, '#fed7aa');  // Warm golden peach
    skyGrad.addColorStop(1.0, '#fef08a');   // Sunset golden yellow
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // 2. Warm, gentle California Sun with soft natural lens flare & corona
    const sunX = vanishX + Math.sin(now * 0.0002) * 20;
    const sunY = horizonY - 14;
    const sunRadius = 26;

    ctx.save();
    // Outer warm corona halo
    const coronaGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 95);
    coronaGrad.addColorStop(0, 'rgba(254, 240, 138, 0.7)');
    coronaGrad.addColorStop(0.4, 'rgba(254, 215, 170, 0.35)');
    coronaGrad.addColorStop(1, 'rgba(254, 215, 170, 0)');
    ctx.fillStyle = coronaGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 95, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright golden sun
    const sunCoreGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
    sunCoreGrad.addColorStop(0, '#ffffff');
    sunCoreGrad.addColorStop(0.5, '#fef08a');
    sunCoreGrad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = sunCoreGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Distant warm coastal mountain cliffs (Malibu / Big Sur coastline)
    const distantParallax = -this.state.currentLaneX * 10;
    ctx.save();
    ctx.fillStyle = '#b45309'; // Warm golden-brown cliff base
    ctx.globalAlpha = 0.38;

    // Mountain silhouettes in background
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(0, horizonY - 22);
    ctx.quadraticCurveTo(w * 0.15 + distantParallax, horizonY - 45, w * 0.32 + distantParallax, horizonY - 24);
    ctx.quadraticCurveTo(w * 0.48 + distantParallax, horizonY - 38, w * 0.65 + distantParallax, horizonY - 20);
    ctx.quadraticCurveTo(w * 0.82 + distantParallax, horizonY - 40, w + 40, horizonY - 18);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();

    // Mid-ground coastal bluffs
    ctx.fillStyle = '#92400e';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(0, horizonY - 12);
    ctx.quadraticCurveTo(w * 0.22 + distantParallax * 1.3, horizonY - 26, w * 0.42 + distantParallax * 1.3, horizonY - 10);
    ctx.quadraticCurveTo(w * 0.75 + distantParallax * 1.3, horizonY - 28, w, horizonY - 8);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 4. Swaying California fan palm trees along the coast
    this.drawPalmTrees(ctx, w, horizonY, distantParallax, now);

    // 5. Gentle soaring seabirds / pelicans
    this.drawSeabirds(ctx, w, horizonY, now);

    // 6. Horizon line with warm ocean shimmer
    ctx.save();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();
    ctx.restore();
  }

  private drawPalmTrees(
    ctx: CanvasRenderingContext2D,
    w: number,
    horizonY: number,
    parallax: number,
    now: number,
  ): void {
    ctx.save();
    const palmPositions = [
      { x: w * 0.08, height: 38 },
      { x: w * 0.16, height: 30 },
      { x: w * 0.84, height: 34 },
      { x: w * 0.92, height: 42 },
    ];

    for (const palm of palmPositions) {
      const px = palm.x + parallax * 1.5;
      const py = horizonY;
      const sway = Math.sin(now * 0.0018 + palm.x) * 3;

      // Slender curved trunk
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + sway * 0.5, py - palm.height * 0.5, px + sway, py - palm.height);
      ctx.stroke();

      // Palm fronds crown
      const topX = px + sway;
      const topY = py - palm.height;
      ctx.strokeStyle = '#15803d'; // Warm palm green
      ctx.lineWidth = 1.8;

      const fronds = [-0.9, -0.5, -0.15, 0.2, 0.6, 0.95];
      for (const f of fronds) {
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        const fLen = 14;
        const fx = topX + f * fLen;
        const fy = topY + (1 - Math.abs(f) * 0.4) * (Math.abs(f) > 0.6 ? 5 : -4);
        ctx.quadraticCurveTo(topX + f * (fLen * 0.6), topY - 5, fx, fy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawSeabirds(
    ctx: CanvasRenderingContext2D,
    w: number,
    horizonY: number,
    now: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    for (const bird of this._birds) {
      const bx = (bird.x * w) % (w + 40) - 20;
      const by = horizonY * bird.y;
      const wingSway = Math.sin(now * 0.006 + bird.phase) * (bird.size * 0.35);

      ctx.beginPath();
      ctx.moveTo(bx - bird.size, by + wingSway);
      ctx.quadraticCurveTo(bx - bird.size * 0.5, by - wingSway * 0.6, bx, by);
      ctx.quadraticCurveTo(bx + bird.size * 0.5, by - wingSway * 0.6, bx + bird.size, by + wingSway);
      ctx.stroke();
    }
    ctx.restore();
  }

  private getTrackX(lane: number, z: number, w: number, vanishX: number): number {
    const bottomTrackHalfWidth = w * 0.42;
    const topTrackHalfWidth = w * 0.045;
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
    now: number,
  ): void {
    // 1. Pacific Ocean Waves on the sides:
    // Gentle deep Pacific turquoise ocean waves on the sides with white foam crests
    const oceanGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    oceanGrad.addColorStop(0, '#0369a1');  // Deep Pacific turquoise
    oceanGrad.addColorStop(0.5, '#0284c7');
    oceanGrad.addColorStop(1.0, '#0f766e'); // Coastal teal near beach
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Animated ocean wave foam swells on the sides
    ctx.save();
    for (let wave = 0; wave < 6; wave++) {
      const waveZ = ((wave * 0.16 + now * 0.0003) % 1.0);
      const waveY = this.getTrackY(waveZ, h, horizonY);
      const waveAlpha = Math.sin(waveZ * Math.PI) * 0.45;

      ctx.strokeStyle = `rgba(240, 253, 250, ${waveAlpha})`;
      ctx.lineWidth = Math.max(1.5, 4 * waveZ);

      // Left ocean wave swell
      const lLeft = 0;
      const lRight = this.getTrackX(-1.5, waveZ, w, vanishX);
      if (lRight > lLeft) {
        ctx.beginPath();
        const crestOffset = Math.sin(now * 0.004 + wave) * 8;
        ctx.moveTo(lLeft, waveY + crestOffset);
        ctx.quadraticCurveTo(lRight * 0.5, waveY - 4 * waveZ + crestOffset, lRight, waveY);
        ctx.stroke();
      }

      // Right ocean wave swell
      const rLeft = this.getTrackX(1.5, waveZ, w, vanishX);
      const rRight = w;
      if (rRight > rLeft) {
        ctx.beginPath();
        const crestOffset = Math.cos(now * 0.004 + wave) * 8;
        ctx.moveTo(rLeft, waveY);
        ctx.quadraticCurveTo(rLeft + (rRight - rLeft) * 0.5, waveY - 4 * waveZ + crestOffset, rRight, waveY + crestOffset);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 2. Sun-bleached wooden boardwalk / coastal pier with warm teak & oak planks
    const leftEdgeTop = this.getTrackX(-1.5, 0, w, vanishX);
    const leftEdgeBottom = this.getTrackX(-1.5, 1, w, vanishX);
    const rightEdgeTop = this.getTrackX(1.5, 0, w, vanishX);
    const rightEdgeBottom = this.getTrackX(1.5, 1, w, vanishX);

    // Warm wooden plank surface fill
    const pierGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    pierGrad.addColorStop(0, '#8c5828');   // Warm oak at horizon
    pierGrad.addColorStop(0.6, '#b47e43'); // Sun-bleached teak
    pierGrad.addColorStop(1.0, '#cda06a'); // Golden bleached wood foreground
    ctx.beginPath();
    ctx.moveTo(leftEdgeTop, horizonY);
    ctx.lineTo(rightEdgeTop, horizonY);
    ctx.lineTo(rightEdgeBottom, h);
    ctx.lineTo(leftEdgeBottom, h);
    ctx.closePath();
    ctx.fillStyle = pierGrad;
    ctx.fill();

    // 3. Wooden boardwalk planks & wood grain seams
    ctx.save();
    const numPlanks = 20;
    for (let i = 0; i < numPlanks; i++) {
      const zNorm = ((i + this._trackOffset) % numPlanks) / numPlanks;
      if (zNorm < 0.04 || zNorm > 0.98) continue;
      const py = this.getTrackY(zNorm, h, horizonY);
      const plx = this.getTrackX(-1.5, zNorm, w, vanishX);
      const prx = this.getTrackX(1.5, zNorm, w, vanishX);

      // Plank seam shadow
      ctx.strokeStyle = 'rgba(67, 40, 16, 0.45)';
      ctx.lineWidth = Math.max(1, 2.8 * zNorm);
      ctx.beginPath();
      ctx.moveTo(plx, py);
      ctx.lineTo(prx, py);
      ctx.stroke();

      // Subtle warm wood grain highlight
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.22)';
      ctx.lineWidth = Math.max(0.7, 1.4 * zNorm);
      ctx.beginPath();
      ctx.moveTo(plx, py - Math.max(1, 2 * zNorm));
      ctx.lineTo(prx, py - Math.max(1, 2 * zNorm));
      ctx.stroke();
    }

    // 4. Clean white painted lane lines (clean, soft weathered paint, NO glowing laser rails)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([14, 18]);
    for (const laneDiv of [-0.5, 0.5]) {
      const topX = this.getTrackX(laneDiv, 0, w, vanishX);
      const bottomX = this.getTrackX(laneDiv, 1, w, vanishX);
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(bottomX, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 5. Pier edge posts and weathered wooden pilings along the boardwalk borders
    for (const laneDiv of [-1.5, 1.5]) {
      const topX = this.getTrackX(laneDiv, 0, w, vanishX);
      const bottomX = this.getTrackX(laneDiv, 1, w, vanishX);

      // Outer border curb
      ctx.strokeStyle = '#5c3d1e';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(bottomX, h);
      ctx.stroke();

      // Pier wooden posts spaced along edges
      const numPosts = 10;
      for (let p = 0; p < numPosts; p++) {
        const postZ = ((p + this._trackOffset * 0.5) % numPosts) / numPosts;
        if (postZ < 0.08 || postZ > 0.98) continue;
        const postX = this.getTrackX(laneDiv, postZ, w, vanishX);
        const postY = this.getTrackY(postZ, h, horizonY);
        const postH = Math.max(6, 26 * postZ);
        const postW = Math.max(2, 6 * postZ);

        // Wooden post
        ctx.fillStyle = '#6b421a';
        ctx.fillRect(postX - postW * 0.5, postY - postH, postW, postH);

        // Weathered white cap on pier post
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(postX - postW * 0.5, postY - postH, postW, Math.max(2, 6 * postZ));
      }
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
      const radius = Math.max(4, 16 * coin.z);

      // 3D spin rotation
      const spinAngle = now * 0.005 + coin.id * 1.2;
      const cosSpin = Math.cos(spinAngle);

      // Golden Starfish shape
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.2, Math.abs(cosSpin)), 1.0);

      // Warm golden drop shadow on boardwalk
      ctx.fillStyle = '#b45309';
      this.drawStarShape(ctx, 1.5, radius, radius * 0.48);
      ctx.fill();

      // Sparkling golden starfish body
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10 * coin.z;
      this.drawStarShape(ctx, 0, radius, radius * 0.48);
      ctx.fill();

      // Inner starfish core & warm highlight
      ctx.fillStyle = '#fef08a';
      this.drawStarShape(ctx, 0, radius * 0.6, radius * 0.28);
      ctx.fill();
      ctx.restore();

      // Gentle golden glint sparkle
      const sparkleAngle = now * 0.004 + coin.id;
      const sRadius = radius * 1.3;
      for (let s = 0; s < 3; s++) {
        const a = sparkleAngle + (s * Math.PI * 2) / 3;
        const sx = cx + Math.cos(a) * sRadius * 0.8;
        const sy = cy + Math.sin(a) * sRadius * 0.5;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, 2 * coin.z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawStarShape(
    ctx: CanvasRenderingContext2D,
    offsetY: number,
    outerR: number,
    innerR: number,
  ): void {
    ctx.beginPath();
    const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r + offsetY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private drawObstacles(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizonY: number,
    vanishX: number,
    _now: number,
  ): void {
    ctx.save();
    for (const obs of this.state.obstacles) {
      if (obs.cleared || obs.z < 0.02 || obs.z > 1.05) continue;

      const cx = this.getTrackX(obs.lane, obs.z, w, vanishX);
      const groundY = this.getTrackY(obs.z, h, horizonY);
      const width = Math.max(10, (w * 0.24) * obs.z);

      switch (obs.type) {
        case ObstacleType.HIGH_BEAM: {
          // Beach Canopy Umbrella Awning / Hanging "SURF SHACK" sign (Must duck)
          const beamY = groundY - Math.max(24, 68 * obs.z);
          const awningH = Math.max(8, 24 * obs.z);

          // Support bamboo/wooden side poles
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = Math.max(1.5, 3.5 * obs.z);
          ctx.beginPath();
          ctx.moveTo(cx - width * 0.5, groundY);
          ctx.lineTo(cx - width * 0.5, beamY);
          ctx.moveTo(cx + width * 0.5, groundY);
          ctx.lineTo(cx + width * 0.5, beamY);
          ctx.stroke();

          // Striped beach canopy awning (Coral & Warm Cream stripes)
          const numStripes = 6;
          const stripeW = width / numStripes;
          for (let s = 0; s < numStripes; s++) {
            ctx.fillStyle = s % 2 === 0 ? '#f97316' : '#fffbeb';
            ctx.fillRect(cx - width * 0.5 + s * stripeW, beamY, stripeW, awningH);
          }

          // Weathered hanging "SURF SHACK" wooden sign
          const signH = Math.max(6, 16 * obs.z);
          const signY = beamY + awningH;
          ctx.fillStyle = '#b45309';
          ctx.fillRect(cx - width * 0.4, signY, width * 0.8, signH);
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(cx - width * 0.4, signY, width * 0.8, signH);

          // "SURF SHACK" / "▼ DUCK ▼" tag
          if (obs.z > 0.35) {
            ctx.fillStyle = '#fffbeb';
            ctx.font = `bold ${Math.floor(10 * obs.z)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('SURF SHACK ▼ DUCK ▼', cx, signY + signH * 0.75);
          }
          break;
        }

        case ObstacleType.LOW_HURDLE: {
          // Sun-bleached driftwood log & beach volleyball net (Must jump over)
          const hurdleH = Math.max(8, 28 * obs.z);

          // Wooden volleyball posts on sides
          ctx.fillStyle = '#78350f';
          const postW = Math.max(2, 5 * obs.z);
          ctx.fillRect(cx - width * 0.5, groundY - hurdleH - 4 * obs.z, postW, hurdleH + 4 * obs.z);
          ctx.fillRect(cx + width * 0.5 - postW, groundY - hurdleH - 4 * obs.z, postW, hurdleH + 4 * obs.z);

          // Beach Volleyball Net Mesh with warm coral top tape
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.fillRect(cx - width * 0.5 + postW, groundY - hurdleH, width - postW * 2, hurdleH * 0.75);

          // Net mesh crosslines
          ctx.strokeStyle = 'rgba(203, 213, 225, 0.6)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          const meshSpacing = Math.max(4, 8 * obs.z);
          for (let mx = cx - width * 0.45; mx < cx + width * 0.45; mx += meshSpacing) {
            ctx.moveTo(mx, groundY - hurdleH);
            ctx.lineTo(mx, groundY - hurdleH * 0.25);
          }
          ctx.stroke();

          // Top tape in warm coastal coral
          ctx.fillStyle = '#f97316';
          ctx.fillRect(cx - width * 0.5, groundY - hurdleH - 2 * obs.z, width, Math.max(2, 5 * obs.z));

          // Driftwood log on boardwalk base
          ctx.fillStyle = '#a16207';
          ctx.beginPath();
          ctx.roundRect
            ? ctx.roundRect(cx - width * 0.48, groundY - 6 * obs.z, width * 0.96, 6 * obs.z, 3)
            : ctx.rect(cx - width * 0.48, groundY - 6 * obs.z, width * 0.96, 6 * obs.z);
          ctx.fill();

          if (obs.z > 0.35) {
            ctx.fillStyle = '#fef08a';
            ctx.font = `bold ${Math.floor(10 * obs.z)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('▲ JUMP ▲', cx, groundY - hurdleH - 8);
          }
          break;
        }

        case ObstacleType.TALL_BLOCK: {
          // Lifeguard Tower Barricade & Colorful Vintage Surfboards (Must switch lane)
          const blockH = Math.max(18, 80 * obs.z);

          // Lifeguard station booth (warm coastal wood & white trim)
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = Math.max(1.5, 3 * obs.z);
          ctx.fillRect(cx - width * 0.45, groundY - blockH, width * 0.9, blockH);
          ctx.strokeRect(cx - width * 0.45, groundY - blockH, width * 0.9, blockH);

          // Red Lifeguard Cross / Rescue Buoy
          const crossSize = Math.max(4, 14 * obs.z);
          const crossY = groundY - blockH * 0.65;
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(cx - crossSize * 0.5, crossY - crossSize * 0.16, crossSize, crossSize * 0.32);
          ctx.fillRect(cx - crossSize * 0.16, crossY - crossSize * 0.5, crossSize * 0.32, crossSize);

          // Leaning colorful retro surfboards against barricade
          const boardW = Math.max(3, 8 * obs.z);
          const boardH = blockH * 0.75;
          // Left surfboard (Teal)
          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.ellipse(cx - width * 0.25, groundY - boardH * 0.5, boardW, boardH * 0.5, -0.15, 0, Math.PI * 2);
          ctx.fill();
          // Right surfboard (Coral/Yellow)
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.ellipse(cx + width * 0.25, groundY - boardH * 0.5, boardW, boardH * 0.5, 0.15, 0, Math.PI * 2);
          ctx.fill();

          if (obs.z > 0.35) {
            ctx.fillStyle = '#0369a1';
            ctx.font = `bold ${Math.floor(11 * obs.z)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('CARVE ◀▶', cx, groundY - blockH - 7);
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

    // Jump offset (clean vertical lift)
    const jumpOffsetPx = this.state.jumpY * (h * 0.3);
    const py = groundY - jumpOffsetPx;

    ctx.save();

    // 1. Natural soft ground shadow below longboard (scales down & softens when jumping)
    const shadowScale = 1.0 - Math.min(0.65, this.state.jumpY * 0.6);
    const shadowWidth = (w * 0.13) * shadowScale;
    ctx.fillStyle = `rgba(30, 20, 10, ${0.45 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(px, groundY, shadowWidth * 0.6, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Smooth Banking when carving into turns (like carving a wave)
    const laneDiff = this.state.targetLane - this.state.currentLaneX;
    const bankAngle = laneDiff * 0.35;

    if (ctx.translate && ctx.rotate) {
      ctx.translate(px, py);
      ctx.rotate(bankAngle);
    }

    // 3. Natural ocean water spray & wave foam droplets trailing behind the board
    this.drawWaterSpray(ctx, now);

    // 4. Retro California Longboard Surfboard:
    // Natural wood-grain finish with clean coastal stripes (teal & coral)
    const boardWidth = w * 0.098;
    const boardHeight = 10;

    // Outer longboard hull (natural warm wood grain)
    ctx.fillStyle = '#b47e43'; // Teak/oak wood finish
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, boardWidth * 0.5, boardHeight * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Natural wood stringer line down the center
    ctx.strokeStyle = '#5c320d';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-boardWidth * 0.45, 0);
    ctx.lineTo(boardWidth * 0.45, 0);
    ctx.stroke();

    // Clean coastal stripes (Teal & Coral)
    ctx.fillStyle = '#06b6d4'; // Pacific teal
    ctx.fillRect(-boardWidth * 0.18, -3, boardWidth * 0.12, 6);
    ctx.fillStyle = '#f97316'; // California coral
    ctx.fillRect(boardWidth * 0.06, -3, boardWidth * 0.12, 6);

    // 5. Surfer Avatar (Kinematics: relaxed surf stance, low aerodynamic surf tuck when ducking)
    const isDucking = this.state.isDucking;
    const bodyHeight = isDucking ? 24 : 52;

    // Surfer body & boardshorts / rashguard (Teal & white)
    ctx.fillStyle = '#0284c7'; // Pacific blue rashguard
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.lineTo(10, -5);
    ctx.lineTo(7, -5 - bodyHeight * 0.65);
    ctx.lineTo(-7, -5 - bodyHeight * 0.65);
    ctx.closePath();
    ctx.fill();

    // Surfer head & sun-bleached hair
    const headY = -5 - bodyHeight;
    ctx.fillStyle = '#fed7aa'; // Sun-kissed skin tone
    ctx.beginPath();
    ctx.arc(0, headY + 8, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Sun-bleached blonde surf hair
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, headY + 4, 7, Math.PI, Math.PI * 2);
    ctx.fill();

    // Surfer sunglasses
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-5, headY + 6, 10, 3);

    // 6. Super-Surf Mode (Hoverboard Shield): Radiant golden sun & ocean water aura
    if (this.state.isHoverboardActive) {
      const shieldRadius = Math.max(34, w * 0.085);
      const pulse = 1.0 + Math.sin(now * 0.007) * 0.07;
      const curRadius = shieldRadius * pulse;

      ctx.save();
      // Soft radiant golden sun aura
      const auraGrad = ctx.createRadialGradient(0, -20, 5, 0, -20, curRadius);
      auraGrad.addColorStop(0, 'rgba(254, 240, 138, 0.4)');
      auraGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.3)');
      auraGrad.addColorStop(1, 'rgba(254, 215, 170, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, -20, curRadius, 0, Math.PI * 2);
      ctx.fill();

      // Glistening ocean water ring with droplets
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -20, curRadius * 0.88, 0, Math.PI * 2);
      ctx.stroke();

      // Glistening droplets orbiting
      for (let d = 0; d < 6; d++) {
        const da = now * 0.003 + (d * Math.PI) / 3;
        const dx = Math.cos(da) * curRadius * 0.88;
        const dy = -20 + Math.sin(da) * curRadius * 0.88;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  private drawWaterSpray(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    // Dual ocean wave foam spray trailing behind the longboard tail
    for (let s = 0; s < 8; s++) {
      const t = (now * 0.006 + s * 0.4) % 1.0;
      const sprayY = 6 + t * 24;
      const spread = 8 + t * 26;
      const alpha = (1.0 - t) * 0.7;

      ctx.fillStyle = `rgba(240, 253, 250, ${alpha})`;
      // Left spray droplet
      ctx.beginPath();
      ctx.arc(-spread, sprayY, 2 + t * 2, 0, Math.PI * 2);
      ctx.fill();
      // Right spray droplet
      ctx.beginPath();
      ctx.arc(spread, sprayY, 2 + t * 2, 0, Math.PI * 2);
      ctx.fill();
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
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 6;
      ctx.font = `bold ${Math.floor(ft.fontSize * popScale)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, px + ft.x, py + ft.y);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawHUD(ctx: CanvasRenderingContext2D, w: number): void {
    ctx.save();

    // Frosted Sea-Glass Top Header Bar
    const hudW = w - 32;
    const hudH = 50;
    const hudX = 16;
    const hudY = 12;

    ctx.fillStyle = 'rgba(11, 23, 40, 0.85)';
    ctx.fillRect(hudX, hudY, hudW, hudH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hudX, hudY, hudW, hudH);

    // Dynamic Spacing Calculation
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    const scoreText = `SCORE: ${Math.floor(this.state.score)}`;
    const scoreWidth = ctx.measureText ? ctx.measureText(scoreText).width : 100;
    const scoreX = hudX + 16;

    // Score display
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(scoreText, scoreX, hudY + 31);

    // Starfish collectibles (dynamically placed past score)
    const starfishText = `★ STARFISH: ${this.state.coins}`;
    const starfishWidth = ctx.measureText ? ctx.measureText(starfishText).width : 115;
    const starfishX = scoreX + scoreWidth + 24;

    ctx.fillStyle = '#fbbf24';
    ctx.fillText(starfishText, starfishX, hudY + 31);

    // Speed multiplier pill badge (anchored on right)
    const speedText = `${this.speedMultiplier.toFixed(1)}x CRUISE`;
    const pillW = 95;
    const pillH = 24;
    const pillX = hudX + hudW - pillW - 12;
    const pillY = hudY + 13;
    ctx.fillStyle = 'rgba(14, 27, 45, 0.7)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(pillX, pillY, pillW, pillH);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(speedText, pillX + pillW / 2, pillY + 16);

    // High score (anchored left of speed pill)
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    const bestText = `BEST: ${this.state.highScore}`;
    const bestWidth = ctx.measureText ? ctx.measureText(bestText).width : 85;
    const bestX = pillX - 16;

    ctx.fillStyle = '#fed7aa';
    ctx.textAlign = 'right';
    ctx.fillText(bestText, bestX, hudY + 31);

    // Dynamic Center Area for Swell Streak Badge or Super-Surf Bar
    const centerStart = starfishX + starfishWidth + 14;
    const centerEnd = bestX - bestWidth - 14;
    const centerAvailable = centerEnd - centerStart;

    // Dynamic Swell Streak Pill Badge
    if (this.state.combo > 1 && !this.state.isHoverboardActive && centerAvailable > 70) {
      const comboW = Math.min(105, centerAvailable);
      const comboH = 26;
      const comboX = centerStart + (centerAvailable - comboW) / 2;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.fillRect(comboX, hudY + 12, comboW, comboH);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(comboX, hudY + 12, comboW, comboH);

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`SWELL x${this.state.combo}!`, comboX + comboW / 2, hudY + 29);
    }

    // Super-Surf Wave Shield status bar
    if (this.state.isHoverboardActive) {
      const remainingPct = this.state.hoverboardRemainingSec / this.state.HOVERBOARD_DURATION;
      const barW = Math.min(140, Math.max(80, centerAvailable > 80 ? centerAvailable : 140));
      const barX = centerAvailable > 80 ? centerStart + (centerAvailable - barW) / 2 : w / 2 - barW / 2;
      ctx.fillStyle = 'rgba(9, 19, 33, 0.7)';
      ctx.fillRect(barX, hudY + 14, barW, 22);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(barX + 2, hudY + 16, Math.max(0, (barW - 4) * remainingPct), 18);
      ctx.strokeStyle = '#fbbf24';
      ctx.strokeRect(barX, hudY + 14, barW, 22);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SUPER-SURF ACTIVE', barX + barW / 2, hudY + 29);
    }

    ctx.restore();
  }

  private drawGameOver(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    ctx.save();
    // Frosted dark coastal backdrop
    ctx.fillStyle = 'rgba(11, 21, 35, 0.86)';
    ctx.fillRect(0, 0, w, h);

    // Sea-Glass Card in center
    const cardW = Math.min(520, w * 0.85);
    const cardH = Math.min(420, h * 0.8);
    const cardX = w * 0.5 - cardW * 0.5;
    const cardY = h * 0.5 - cardH * 0.5;

    ctx.fillStyle = 'rgba(14, 27, 45, 0.95)';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = this.state.isNewHighScore ? '#fbbf24' : '#f97316';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    // Header Title
    ctx.textAlign = 'center';
    if (this.state.isNewHighScore) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
      ctx.fillText('🏆 NEW BEACH RECORD! 🏆', w / 2, cardY + 50);
    } else {
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
      ctx.fillText('WIPEOUT - RUN SUMMARY', w / 2, cardY + 50);
    }

    // Run Summary Grid
    ctx.fillStyle = '#f8fafc';
    ctx.font = '17px system-ui, -apple-system, sans-serif';
    ctx.fillText(`FINAL SCORE: ${Math.floor(this.state.score)}`, w / 2, cardY + 105);
    ctx.fillText(`STARFISH COLLECTED: ${this.state.coins}`, w / 2, cardY + 145);
    ctx.fillText(`MAX SWELL STREAK: x${this.state.maxCombo}`, w / 2, cardY + 185);
    ctx.fillText(`OBSTACLES CLEARED: ${this.state.obstaclesCleared}`, w / 2, cardY + 225);
    ctx.fillText(`LEAPS / TUCKS: ${this.state.jumpsPerformed} / ${this.state.ducksPerformed}`, w / 2, cardY + 265);

    // Replay Prompt
    const pulse = Math.sin(performance.now() * 0.007) * 0.25 + 0.75;
    ctx.fillStyle = `rgba(56, 189, 248, ${pulse})`;
    ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
    ctx.fillText('PRESS SPACE OR JUMP TO CATCH THE NEXT WAVE', w / 2, cardY + cardH - 35);

    ctx.restore();
  }
}

export const GameRunner = RunnerGame;
export type GameRunner = RunnerGame;
