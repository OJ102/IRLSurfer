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
    // 1. Rich Pacific Golden Hour Gradient:
    // Deep Pacific oceanic blue -> vibrant coastal azure -> golden peach -> sunset yellow
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#0284c7');     // Deep Pacific blue
    skyGrad.addColorStop(0.38, '#38bdf8');  // Coastal sky azure
    skyGrad.addColorStop(0.72, '#fed7aa');  // Golden peach
    skyGrad.addColorStop(1.0, '#fef08a');   // Sunset golden yellow
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // 2. Radiant California Sun with layered soft corona & specular glow
    const sunX = vanishX + Math.sin(now * 0.0002) * 20;
    const sunY = horizonY - 16;
    const sunRadius = 28;

    ctx.save();
    // Wide warm ambient corona
    const outerCorona = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 110);
    outerCorona.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
    outerCorona.addColorStop(0.35, 'rgba(254, 215, 170, 0.28)');
    outerCorona.addColorStop(0.75, 'rgba(245, 158, 11, 0.1)');
    outerCorona.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = outerCorona;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 110, 0, Math.PI * 2);
    ctx.fill();

    // Mid warm radiant corona
    const midCorona = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 55);
    midCorona.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    midCorona.addColorStop(0.4, 'rgba(254, 240, 138, 0.6)');
    midCorona.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = midCorona;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 55, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright golden sun core
    const sunCoreGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
    sunCoreGrad.addColorStop(0, '#ffffff');
    sunCoreGrad.addColorStop(0.45, '#fef08a');
    sunCoreGrad.addColorStop(0.85, '#fbbf24');
    sunCoreGrad.addColorStop(1.0, '#f59e0b');
    ctx.fillStyle = sunCoreGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Distant warm coastal mountain ridges (Malibu / Big Sur coastline)
    const distantParallax = -this.state.currentLaneX * 12;
    ctx.save();

    // Far mountain bluffs (soft warm terra-cotta with atmospheric haze)
    ctx.fillStyle = '#9a3412';
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(0, horizonY - 26);
    ctx.quadraticCurveTo(w * 0.16 + distantParallax * 0.7, horizonY - 50, w * 0.34 + distantParallax * 0.7, horizonY - 28);
    ctx.quadraticCurveTo(w * 0.52 + distantParallax * 0.7, horizonY - 44, w * 0.70 + distantParallax * 0.7, horizonY - 22);
    ctx.quadraticCurveTo(w * 0.86 + distantParallax * 0.7, horizonY - 46, w + 40, horizonY - 20);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();

    // Mid-ground coastal cliffs
    ctx.fillStyle = '#78350f';
    ctx.globalAlpha = 0.52;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(0, horizonY - 14);
    ctx.quadraticCurveTo(w * 0.22 + distantParallax, horizonY - 30, w * 0.44 + distantParallax, horizonY - 12);
    ctx.quadraticCurveTo(w * 0.76 + distantParallax, horizonY - 32, w, horizonY - 10);
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 4. Swaying California fan palm trees along the coastline
    this.drawPalmTrees(ctx, w, horizonY, distantParallax, now);

    // 5. Gentle soaring seabirds / pelicans with natural wing physics
    this.drawSeabirds(ctx, w, horizonY, now);

    // 6. Horizon line with warm ocean shimmer
    ctx.save();
    const shimmerGrad = ctx.createLinearGradient(0, horizonY, w, horizonY);
    shimmerGrad.addColorStop(0, 'rgba(254, 240, 138, 0.2)');
    shimmerGrad.addColorStop(0.5, 'rgba(254, 240, 138, 0.85)');
    shimmerGrad.addColorStop(1, 'rgba(254, 240, 138, 0.2)');
    ctx.strokeStyle = shimmerGrad;
    ctx.lineWidth = 1.6;
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
      { x: w * 0.07, height: 42, lean: -0.15 },
      { x: w * 0.15, height: 32, lean: 0.1 },
      { x: w * 0.85, height: 36, lean: -0.12 },
      { x: w * 0.93, height: 46, lean: 0.18 },
    ];

    for (const palm of palmPositions) {
      const px = palm.x + parallax * 1.4;
      const py = horizonY;
      const sway = Math.sin(now * 0.0016 + palm.x) * 4;

      // Curved wooden palm trunk
      ctx.strokeStyle = '#5c320d';
      ctx.lineWidth = 3.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py);
      const midX = px + palm.lean * 12 + sway * 0.4;
      const topX = px + palm.lean * 24 + sway;
      const topY = py - palm.height;
      ctx.quadraticCurveTo(midX, py - palm.height * 0.55, topX, topY);
      ctx.stroke();

      // Palm fronds crown (Deep Pacific emerald / warm palm green)
      ctx.lineWidth = 2.0;
      const frondAngles = [-1.0, -0.65, -0.3, 0.0, 0.35, 0.7, 1.05];
      for (const fa of frondAngles) {
        ctx.strokeStyle = Math.abs(fa) > 0.5 ? '#15803d' : '#166534';
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        const fLen = 16;
        const fx = topX + fa * fLen;
        const fy = topY + (1 - Math.abs(fa) * 0.35) * (Math.abs(fa) > 0.6 ? 7 : -5);
        ctx.quadraticCurveTo(topX + fa * (fLen * 0.55), topY - 7, fx, fy);
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
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (const bird of this._birds) {
      const bx = (bird.x * w) % (w + 40) - 20;
      const by = horizonY * bird.y;
      const wingSway = Math.sin(now * 0.0055 + bird.phase) * (bird.size * 0.38);

      ctx.beginPath();
      ctx.moveTo(bx - bird.size, by + wingSway);
      ctx.quadraticCurveTo(bx - bird.size * 0.5, by - wingSway * 0.7, bx, by);
      ctx.quadraticCurveTo(bx + bird.size * 0.5, by - wingSway * 0.7, bx + bird.size, by + wingSway);
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
    // 1. Deep Layered Pacific Ocean:
    // Pacific oceanic blue -> turquoise swells -> beach sea-glass teal
    const oceanGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    oceanGrad.addColorStop(0, '#0c4a6e');  // Deep Pacific horizon
    oceanGrad.addColorStop(0.45, '#0284c7'); // Rich Pacific azure
    oceanGrad.addColorStop(1.0, '#0f766e');  // Coastal sea-glass teal
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // 2. Glowing Golden Specular Sunbeam Refractions on Ocean
    const sunX = vanishX + Math.sin(now * 0.0002) * 20;
    ctx.save();
    for (let r = 0; r < 8; r++) {
      const rZ = 0.08 + r * 0.11;
      const ry = this.getTrackY(rZ, h, horizonY);
      const rSway = Math.sin(now * 0.003 + r * 1.5) * (14 * rZ);
      const rWidth = (35 + r * 20) * rZ;

      const glintGrad = ctx.createLinearGradient(sunX + rSway - rWidth, ry, sunX + rSway + rWidth, ry);
      glintGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
      glintGrad.addColorStop(0.5, `rgba(254, 240, 138, ${0.45 * (1 - rZ * 0.4)})`);
      glintGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = glintGrad;
      ctx.fillRect(sunX + rSway - rWidth, ry - 1.5, rWidth * 2, 3);
    }
    ctx.restore();

    // 3. Animated Translucent Ocean Wave Swells with Seafoam Crests
    ctx.save();
    for (let wave = 0; wave < 7; wave++) {
      const waveZ = ((wave * 0.14 + now * 0.00028) % 1.0);
      if (waveZ < 0.04) continue;
      const waveY = this.getTrackY(waveZ, h, horizonY);
      const waveAlpha = Math.sin(waveZ * Math.PI) * 0.55;

      // Swell body & white foam crest
      ctx.strokeStyle = `rgba(240, 253, 250, ${waveAlpha})`;
      ctx.lineWidth = Math.max(1.8, 5 * waveZ);

      // Left ocean wave swell
      const lLeft = 0;
      const lRight = this.getTrackX(-1.5, waveZ, w, vanishX);
      if (lRight > lLeft) {
        ctx.beginPath();
        const crestOffset = Math.sin(now * 0.0035 + wave * 1.2) * (10 * waveZ);
        ctx.moveTo(lLeft, waveY + crestOffset);
        ctx.quadraticCurveTo(lRight * 0.5, waveY - 6 * waveZ + crestOffset, lRight, waveY);
        ctx.stroke();

        // Seafoam spray specks
        if (waveZ > 0.3) {
          ctx.fillStyle = `rgba(255, 255, 255, ${waveAlpha * 0.8})`;
          for (let s = 0; s < 3; s++) {
            const sx = lLeft + (lRight - lLeft) * (0.3 + s * 0.25);
            const sy = waveY - 4 * waveZ + crestOffset + Math.sin(now * 0.008 + s) * 3;
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1, 2.5 * waveZ), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Right ocean wave swell
      const rLeft = this.getTrackX(1.5, waveZ, w, vanishX);
      const rRight = w;
      if (rRight > rLeft) {
        ctx.beginPath();
        const crestOffset = Math.cos(now * 0.0035 + wave * 1.2) * (10 * waveZ);
        ctx.moveTo(rLeft, waveY);
        ctx.quadraticCurveTo(rLeft + (rRight - rLeft) * 0.5, waveY - 6 * waveZ + crestOffset, rRight, waveY + crestOffset);
        ctx.stroke();

        // Seafoam spray specks
        if (waveZ > 0.3) {
          ctx.fillStyle = `rgba(255, 255, 255, ${waveAlpha * 0.8})`;
          for (let s = 0; s < 3; s++) {
            const sx = rLeft + (rRight - rLeft) * (0.2 + s * 0.28);
            const sy = waveY - 4 * waveZ + crestOffset + Math.cos(now * 0.008 + s) * 3;
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1, 2.5 * waveZ), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();

    // 4. Sun-bleached Wooden Boardwalk Pier with Realistic Plank Variations
    const leftEdgeTop = this.getTrackX(-1.5, 0, w, vanishX);
    const leftEdgeBottom = this.getTrackX(-1.5, 1, w, vanishX);
    const rightEdgeTop = this.getTrackX(1.5, 0, w, vanishX);
    const rightEdgeBottom = this.getTrackX(1.5, 1, w, vanishX);

    // Warm wooden plank boardwalk base fill
    const pierGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    pierGrad.addColorStop(0, '#78431b');   // Warm oak at horizon
    pierGrad.addColorStop(0.5, '#ad753b'); // Sun-bleached teak
    pierGrad.addColorStop(1.0, '#cda06a'); // Golden bleached wood foreground
    ctx.beginPath();
    ctx.moveTo(leftEdgeTop, horizonY);
    ctx.lineTo(rightEdgeTop, horizonY);
    ctx.lineTo(rightEdgeBottom, h);
    ctx.lineTo(leftEdgeBottom, h);
    ctx.closePath();
    ctx.fillStyle = pierGrad;
    ctx.fill();

    // 5. Individual Timber Planks with Tonal Variation, Seams & Nail Rivets
    ctx.save();
    const numPlanks = 22;
    const plankTones = ['#b47e43', '#8c5828', '#cda06a', '#a16834'];

    for (let i = 0; i < numPlanks; i++) {
      const zNorm = ((i + this._trackOffset) % numPlanks) / numPlanks;
      if (zNorm < 0.03 || zNorm > 0.98) continue;
      const nextZ = Math.min(0.99, zNorm + 0.95 / numPlanks);

      const py1 = this.getTrackY(zNorm, h, horizonY);
      const py2 = this.getTrackY(nextZ, h, horizonY);
      const plx1 = this.getTrackX(-1.5, zNorm, w, vanishX);
      const prx1 = this.getTrackX(1.5, zNorm, w, vanishX);
      const plx2 = this.getTrackX(-1.5, nextZ, w, vanishX);
      const prx2 = this.getTrackX(1.5, nextZ, w, vanishX);

      // Plank body with subtle tonal variation
      ctx.fillStyle = plankTones[i % plankTones.length];
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.moveTo(plx1, py1);
      ctx.lineTo(prx1, py1);
      ctx.lineTo(prx2, py2);
      ctx.lineTo(plx2, py2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Deep plank seam shadow line
      ctx.strokeStyle = 'rgba(45, 25, 10, 0.55)';
      ctx.lineWidth = Math.max(1, 3 * zNorm);
      ctx.beginPath();
      ctx.moveTo(plx1, py1);
      ctx.lineTo(prx1, py1);
      ctx.stroke();

      // Top bevel specular highlight line
      ctx.strokeStyle = 'rgba(255, 248, 220, 0.25)';
      ctx.lineWidth = Math.max(0.6, 1.5 * zNorm);
      ctx.beginPath();
      ctx.moveTo(plx1, py1 - Math.max(0.8, 1.8 * zNorm));
      ctx.lineTo(prx1, py1 - Math.max(0.8, 1.8 * zNorm));
      ctx.stroke();

      // Iron nail rivets on both plank edges
      if (zNorm > 0.2) {
        const rivetRadius = Math.max(1, 2.2 * zNorm);
        const lOffset = (prx1 - plx1) * 0.04;
        const rOffset = (prx1 - plx1) * 0.96;

        // Dark iron rivet
        ctx.fillStyle = '#291e13';
        ctx.beginPath();
        ctx.arc(plx1 + lOffset, py1 + (py2 - py1) * 0.5, rivetRadius, 0, Math.PI * 2);
        ctx.arc(plx1 + rOffset, py1 + (py2 - py1) * 0.5, rivetRadius, 0, Math.PI * 2);
        ctx.fill();

        // Rivet specular metallic glint
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(plx1 + lOffset - 0.5, py1 + (py2 - py1) * 0.5 - 0.5, rivetRadius * 0.4, 0, Math.PI * 2);
        ctx.arc(plx1 + rOffset - 0.5, py1 + (py2 - py1) * 0.5 - 0.5, rivetRadius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 6. Clean White Painted Lane Marks (Soft weathered paint)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
    ctx.lineWidth = 2.4;
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

    // 7. Pier Timber Pilings with Weathered Caps & Nautical Hanging Rope Rails
    for (const laneDiv of [-1.5, 1.5]) {
      const topX = this.getTrackX(laneDiv, 0, w, vanishX);
      const bottomX = this.getTrackX(laneDiv, 1, w, vanishX);

      // Outer border timber curb
      ctx.strokeStyle = '#4a2810';
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(bottomX, h);
      ctx.stroke();

      // Pier wooden posts and hanging nautical rope swag
      const numPosts = 10;
      const postCoords: Array<{ x: number; y: number; h: number; w: number; z: number }> = [];

      for (let p = 0; p < numPosts; p++) {
        const postZ = ((p + this._trackOffset * 0.5) % numPosts) / numPosts;
        if (postZ < 0.08 || postZ > 0.98) continue;
        const postX = this.getTrackX(laneDiv, postZ, w, vanishX);
        const postY = this.getTrackY(postZ, h, horizonY);
        const postH = Math.max(6, 28 * postZ);
        const postW = Math.max(2.5, 7 * postZ);
        postCoords.push({ x: postX, y: postY, h: postH, w: postW, z: postZ });
      }

      // Sort posts by depth
      postCoords.sort((a, b) => a.z - b.z);

      // Draw nautical hanging rope swag between consecutive pilings
      ctx.strokeStyle = '#d4a373';
      for (let k = 0; k < postCoords.length - 1; k++) {
        const p1 = postCoords[k];
        const p2 = postCoords[k + 1];
        if (p2.z - p1.z > 0.3) continue;

        ctx.lineWidth = Math.max(1, 2.4 * p1.z);
        ctx.beginPath();
        const topY1 = p1.y - p1.h * 0.75;
        const topY2 = p2.y - p2.h * 0.75;
        const midRopeX = (p1.x + p2.x) * 0.5;
        const midRopeY = (topY1 + topY2) * 0.5 + Math.max(2, 6 * p1.z); // Catenary sag
        ctx.moveTo(p1.x, topY1);
        ctx.quadraticCurveTo(midRopeX, midRopeY, p2.x, topY2);
        ctx.stroke();
      }

      // Draw timber pilings
      for (const p of postCoords) {
        // Timber post
        ctx.fillStyle = '#5c320d';
        ctx.fillRect(p.x - p.w * 0.5, p.y - p.h, p.w, p.h);

        // Weathered white painted cap
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(p.x - p.w * 0.5, p.y - p.h, p.w, Math.max(2.2, 6.5 * p.z));

        // Iron piling band
        ctx.fillStyle = '#291e13';
        ctx.fillRect(p.x - p.w * 0.5, p.y - p.h * 0.78, p.w, Math.max(1, 2 * p.z));
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
      const groundY = this.getTrackY(coin.z, h, horizonY);
      const floatOffset = Math.sin(now * 0.005 + coin.id * 1.5) * (4 * coin.z);
      const cy = groundY - 20 * coin.z + floatOffset;
      const radius = Math.max(4.5, 17 * coin.z);

      // 3D spin rotation
      const spinAngle = now * 0.0045 + coin.id * 1.2;
      const cosSpin = Math.cos(spinAngle);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.18, Math.abs(cosSpin)), 1.0);

      // Ambient occlusion drop shadow on boardwalk
      ctx.fillStyle = 'rgba(60, 35, 15, 0.45)';
      this.drawStarShape(ctx, 4 * coin.z, radius * 1.05, radius * 0.5);
      ctx.fill();

      // Shaded 3D golden starfish body
      const starGrad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
      starGrad.addColorStop(0, '#fef08a'); // Warm golden center
      starGrad.addColorStop(0.5, '#fbbf24');
      starGrad.addColorStop(1.0, '#d97706'); // Deep amber edges
      ctx.fillStyle = starGrad;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10 * coin.z;
      this.drawStarShape(ctx, 0, radius, radius * 0.48);
      ctx.fill();

      // Raised arm ridges & center disc
      ctx.fillStyle = '#fef08a';
      ctx.shadowBlur = 0;
      this.drawStarShape(ctx, 0, radius * 0.58, radius * 0.28);
      ctx.fill();

      // Center starfish nodule
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, 2.5 * coin.z), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Animated specular glint sparkles
      const sparkleAngle = now * 0.004 + coin.id;
      const sRadius = radius * 1.25;
      for (let s = 0; s < 3; s++) {
        const a = sparkleAngle + (s * Math.PI * 2) / 3;
        const sx = cx + Math.cos(a) * sRadius * 0.8;
        const sy = cy + Math.sin(a) * sRadius * 0.5;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
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
          const beamY = groundY - Math.max(24, 70 * obs.z);
          const awningH = Math.max(8, 26 * obs.z);

          // Support bamboo/weathered cedar poles with rope bindings
          ctx.strokeStyle = '#78350f';
          ctx.lineWidth = Math.max(1.8, 4 * obs.z);
          ctx.beginPath();
          ctx.moveTo(cx - width * 0.5, groundY);
          ctx.lineTo(cx - width * 0.5, beamY);
          ctx.moveTo(cx + width * 0.5, groundY);
          ctx.lineTo(cx + width * 0.5, beamY);
          ctx.stroke();

          // Rope bindings on poles
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = Math.max(1, 2 * obs.z);
          for (const px of [cx - width * 0.5, cx + width * 0.5]) {
            ctx.beginPath();
            ctx.moveTo(px - 3 * obs.z, beamY + 6 * obs.z);
            ctx.lineTo(px + 3 * obs.z, beamY + 6 * obs.z);
            ctx.stroke();
          }

          // Striped beach canopy awning (Pacific Coral & Vintage Cream)
          const numStripes = 6;
          const stripeW = width / numStripes;
          for (let s = 0; s < numStripes; s++) {
            ctx.fillStyle = s % 2 === 0 ? '#f97316' : '#fffbeb';
            const sx = cx - width * 0.5 + s * stripeW;
            ctx.fillRect(sx, beamY, stripeW, awningH);

            // Scalloped bottom fringe on awning
            ctx.beginPath();
            ctx.arc(sx + stripeW * 0.5, beamY + awningH, stripeW * 0.45, 0, Math.PI);
            ctx.fill();
          }

          // Weathered timber hanging "SURF SHACK" wooden sign
          const signH = Math.max(6, 18 * obs.z);
          const signY = beamY + awningH + 4 * obs.z;
          const signW = width * 0.82;

          // Iron chain links holding the sign
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = Math.max(1, 1.8 * obs.z);
          ctx.beginPath();
          ctx.moveTo(cx - signW * 0.35, beamY + awningH);
          ctx.lineTo(cx - signW * 0.35, signY);
          ctx.moveTo(cx + signW * 0.35, beamY + awningH);
          ctx.lineTo(cx + signW * 0.35, signY);
          ctx.stroke();

          // Timber board
          ctx.fillStyle = '#92400e';
          this.drawRoundedRect(ctx, cx - signW * 0.5, signY, signW, signH, 3);
          ctx.fill();
          ctx.strokeStyle = '#5c320d';
          ctx.lineWidth = 1.2;
          this.drawRoundedRect(ctx, cx - signW * 0.5, signY, signW, signH, 3);
          ctx.stroke();

          // "SURF SHACK ▼ DUCK ▼" tag
          if (obs.z > 0.32) {
            ctx.fillStyle = '#fef08a';
            ctx.font = `bold ${Math.floor(10.5 * obs.z)}px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('SURF SHACK ▼ DUCK ▼', cx, signY + signH * 0.72);
          }
          break;
        }

        case ObstacleType.LOW_HURDLE: {
          // Sun-bleached driftwood log & beach volleyball net (Must jump over)
          const hurdleH = Math.max(8, 29 * obs.z);

          // Weathered volleyball driftwood posts on sides
          ctx.fillStyle = '#6b421a';
          const postW = Math.max(2.5, 6 * obs.z);
          ctx.fillRect(cx - width * 0.5, groundY - hurdleH - 5 * obs.z, postW, hurdleH + 5 * obs.z);
          ctx.fillRect(cx + width * 0.5 - postW, groundY - hurdleH - 5 * obs.z, postW, hurdleH + 5 * obs.z);

          // Flutter ribbons on top of posts
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.moveTo(cx - width * 0.5, groundY - hurdleH - 5 * obs.z);
          ctx.lineTo(cx - width * 0.5 - 6 * obs.z, groundY - hurdleH - 8 * obs.z);
          ctx.lineTo(cx - width * 0.5, groundY - hurdleH - 2 * obs.z);
          ctx.fill();

          // Beach Volleyball Net Mesh with translucent braided netting
          ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
          ctx.fillRect(cx - width * 0.5 + postW, groundY - hurdleH, width - postW * 2, hurdleH * 0.78);

          // Net mesh crosslines
          ctx.strokeStyle = 'rgba(203, 213, 225, 0.65)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          const meshSpacing = Math.max(4, 8 * obs.z);
          for (let mx = cx - width * 0.45; mx < cx + width * 0.45; mx += meshSpacing) {
            ctx.moveTo(mx, groundY - hurdleH);
            ctx.lineTo(mx, groundY - hurdleH * 0.22);
          }
          ctx.stroke();

          // Top tape banner in warm coastal coral
          ctx.fillStyle = '#fb7185';
          ctx.fillRect(cx - width * 0.5, groundY - hurdleH - 2 * obs.z, width, Math.max(2.5, 5.5 * obs.z));

          // Driftwood log on boardwalk base
          ctx.fillStyle = '#854d0e';
          this.drawRoundedRect(ctx, cx - width * 0.48, groundY - 6.5 * obs.z, width * 0.96, 6.5 * obs.z, 3);
          ctx.fill();

          if (obs.z > 0.32) {
            ctx.fillStyle = '#fef08a';
            ctx.font = `bold ${Math.floor(10.5 * obs.z)}px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('▲ LEAP ▲', cx, groundY - hurdleH - 9);
          }
          break;
        }

        case ObstacleType.TALL_BLOCK: {
          // Lifeguard Rescue Stand & Vintage Surfboards (Must switch lane)
          const blockH = Math.max(18, 82 * obs.z);

          // Elevated Lifeguard observation tower (Santa Monica white clapboard with Pacific blue trim)
          ctx.fillStyle = '#f8fafc';
          this.drawRoundedRect(ctx, cx - width * 0.44, groundY - blockH, width * 0.88, blockH, 4);
          ctx.fill();

          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = Math.max(1.5, 3 * obs.z);
          this.drawRoundedRect(ctx, cx - width * 0.44, groundY - blockH, width * 0.88, blockH, 4);
          ctx.stroke();

          // Lifeguard tower window with sky reflection
          const winW = width * 0.5;
          const winH = blockH * 0.28;
          ctx.fillStyle = '#38bdf8';
          this.drawRoundedRect(ctx, cx - winW * 0.5, groundY - blockH * 0.88, winW, winH, 2);
          ctx.fill();

          // Red Lifeguard Cross
          const crossSize = Math.max(4, 15 * obs.z);
          const crossY = groundY - blockH * 0.42;
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(cx - crossSize * 0.5, crossY - crossSize * 0.16, crossSize, crossSize * 0.32);
          ctx.fillRect(cx - crossSize * 0.16, crossY - crossSize * 0.5, crossSize * 0.32, crossSize);

          // Orange rescue can / torpedo buoy hanging on right side
          ctx.fillStyle = '#f97316';
          this.drawRoundedRect(ctx, cx + width * 0.32, groundY - blockH * 0.65, Math.max(3, 7 * obs.z), Math.max(6, 16 * obs.z), 2);
          ctx.fill();

          // Leaning colorful retro surfboards against the tower
          const boardW = Math.max(3, 8 * obs.z);
          const boardH = blockH * 0.72;

          // Left surfboard (Pacific Teal with gold stripe)
          ctx.fillStyle = '#0d9488';
          ctx.beginPath();
          ctx.ellipse(cx - width * 0.26, groundY - boardH * 0.5, boardW, boardH * 0.5, -0.16, 0, Math.PI * 2);
          ctx.fill();

          // Right surfboard (California Coral)
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.ellipse(cx + width * 0.22, groundY - boardH * 0.48, boardW, boardH * 0.48, 0.16, 0, Math.PI * 2);
          ctx.fill();

          if (obs.z > 0.32) {
            ctx.fillStyle = '#0369a1';
            ctx.font = `bold ${Math.floor(11 * obs.z)}px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('CARVE ◀▶', cx, groundY - blockH - 8);
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

    // 1. Natural Soft Ground Shadow Below Board (Scales and softens gracefully when jumping)
    const shadowScale = 1.0 - Math.min(0.65, this.state.jumpY * 0.6);
    const shadowWidth = (w * 0.13) * shadowScale;
    ctx.fillStyle = `rgba(35, 20, 10, ${0.45 * shadowScale})`;
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

    // 3. Natural Ocean Water Spray & Wave Foam Droplets Trailing Behind the Tail
    this.drawWaterSpray(ctx, now);

    // 4. Handcrafted Retro California Longboard:
    // Natural wood-grain deck, mahogany stringer, coastal dual stripes, black wax pad
    const boardWidth = w * 0.098;
    const boardHeight = 11;

    // Outer longboard hull (warm teak/balsa wood finish)
    const woodGrad = ctx.createLinearGradient(-boardWidth * 0.5, 0, boardWidth * 0.5, 0);
    woodGrad.addColorStop(0, '#a16834');
    woodGrad.addColorStop(0.5, '#cda06a'); // Golden balsa center
    woodGrad.addColorStop(1, '#a16834');
    ctx.fillStyle = woodGrad;
    ctx.strokeStyle = '#5c320d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, boardWidth * 0.5, boardHeight * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Classic dark mahogany / koa stringer line down center
    ctx.strokeStyle = '#3d1d06';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-boardWidth * 0.46, 0);
    ctx.lineTo(boardWidth * 0.46, 0);
    ctx.stroke();

    // Clean coastal dual racing stripes (Pacific Teal & California Coral)
    ctx.fillStyle = '#0d9488'; // Pacific teal
    ctx.fillRect(-boardWidth * 0.20, -3.5, boardWidth * 0.12, 7);
    ctx.fillStyle = '#fb7185'; // Soft coral
    ctx.fillRect(boardWidth * 0.08, -3.5, boardWidth * 0.12, 7);

    // Black surf wax traction deck pad on tail
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    this.drawRoundedRect(ctx, -boardWidth * 0.38, -3, boardWidth * 0.14, 6, 2);
    ctx.fill();

    // 5. Surfer Avatar (Kinematics: relaxed surf stance, low aerodynamic surf tuck when ducking)
    const isDucking = this.state.isDucking;
    const bodyHeight = isDucking ? 24 : 52;

    // Surfer body & Pacific blue rashguard with clean side panels
    ctx.fillStyle = '#0284c7'; // Pacific blue
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.lineTo(10, -5);
    ctx.lineTo(7, -5 - bodyHeight * 0.65);
    ctx.lineTo(-7, -5 - bodyHeight * 0.65);
    ctx.closePath();
    ctx.fill();

    // White rashguard side racing accents
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-9, -5);
    ctx.lineTo(-6.5, -5 - bodyHeight * 0.65);
    ctx.moveTo(9, -5);
    ctx.lineTo(6.5, -5 - bodyHeight * 0.65);
    ctx.stroke();

    // Surfer head & sun-bleached hair
    const headY = -5 - bodyHeight;
    ctx.fillStyle = '#fed7aa'; // Sun-kissed skin tone
    ctx.beginPath();
    ctx.arc(0, headY + 8, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Sun-bleached blonde surf hair with coastal wind sway
    const hairSway = Math.sin(now * 0.008) * 1.5;
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0 + hairSway, headY + 4, 7.2, Math.PI, Math.PI * 2);
    ctx.fill();

    // Sleek surf sunglasses
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-5, headY + 6.5, 10, 3);

    // 6. Super-Surf Wave Shield (Hoverboard Shield): Radiant golden sun & ocean water aura
    if (this.state.isHoverboardActive) {
      const shieldRadius = Math.max(36, w * 0.088);
      const pulse = 1.0 + Math.sin(now * 0.007) * 0.08;
      const curRadius = shieldRadius * pulse;

      ctx.save();
      // Soft radiant golden sun aura
      const auraGrad = ctx.createRadialGradient(0, -20, 5, 0, -20, curRadius);
      auraGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
      auraGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.32)');
      auraGrad.addColorStop(1, 'rgba(254, 215, 170, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, -20, curRadius, 0, Math.PI * 2);
      ctx.fill();

      // Shimmering sea-glass turquoise ring
      ctx.strokeStyle = '#14b8a6';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, -20, curRadius * 0.88, 0, Math.PI * 2);
      ctx.stroke();

      // Glistening water droplets orbiting
      for (let d = 0; d < 6; d++) {
        const da = now * 0.003 + (d * Math.PI) / 3;
        const dx = Math.cos(da) * curRadius * 0.88;
        const dy = -20 + Math.sin(da) * curRadius * 0.88;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 6;
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
    // Realistic foaming sea spray trails fanning out from the longboard tail
    for (let s = 0; s < 9; s++) {
      const t = (now * 0.006 + s * 0.36) % 1.0;
      const sprayY = 6 + t * 26;
      const spread = 9 + t * 28;
      const alpha = (1.0 - t) * 0.72;

      ctx.fillStyle = `rgba(240, 253, 250, ${alpha})`;
      // Left spray droplet
      ctx.beginPath();
      ctx.arc(-spread, sprayY, 2 + t * 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Right spray droplet
      ctx.beginPath();
      ctx.arc(spread, sprayY, 2 + t * 2.2, 0, Math.PI * 2);
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
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 8;
      ctx.font = `bold ${Math.floor(ft.fontSize * popScale)}px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, px + ft.x, py + ft.y);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawHUD(ctx: CanvasRenderingContext2D, w: number): void {
    ctx.save();

    // Floating Frosted Sea-Glass Top Header Bar
    const hudW = w - 32;
    const hudH = 50;
    const hudX = 16;
    const hudY = 12;

    ctx.fillStyle = 'rgba(8, 19, 37, 0.88)';
    this.drawRoundedRect(ctx, hudX, hudY, hudW, hudH, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.2)';
    ctx.shadowBlur = 10;
    this.drawRoundedRect(ctx, hudX, hudY, hudW, hudH, 12);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dynamic Spacing Calculation with modern typography
    ctx.font = 'bold 18px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
    const scoreText = `SCORE: ${Math.floor(this.state.score)}`;
    const scoreWidth = ctx.measureText ? ctx.measureText(scoreText).width : 100;
    const scoreX = hudX + 18;

    // Score display
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText(scoreText, scoreX, hudY + 31);

    // Starfish collectibles (dynamically placed past score)
    const starfishText = `★ STARFISH: ${this.state.coins}`;
    const starfishWidth = ctx.measureText ? ctx.measureText(starfishText).width : 120;
    const starfishX = scoreX + scoreWidth + 24;

    ctx.fillStyle = '#fbbf24';
    ctx.fillText(starfishText, starfishX, hudY + 31);

    // Speed multiplier pill badge (anchored on right)
    const speedText = `${this.speedMultiplier.toFixed(1)}x CRUISE`;
    const pillW = 98;
    const pillH = 26;
    const pillX = hudX + hudW - pillW - 14;
    const pillY = hudY + 12;

    ctx.fillStyle = 'rgba(14, 28, 48, 0.8)';
    this.drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 8);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    this.drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 8);
    ctx.stroke();

    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 11px "Outfit", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(speedText, pillX + pillW / 2, pillY + 17);

    // High score (anchored left of speed pill)
    ctx.font = 'bold 18px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
    const bestText = `BEST: ${this.state.highScore}`;
    const bestWidth = ctx.measureText ? ctx.measureText(bestText).width : 85;
    const bestX = pillX - 18;

    ctx.fillStyle = '#fed7aa';
    ctx.textAlign = 'right';
    ctx.fillText(bestText, bestX, hudY + 31);

    // Dynamic Center Area for Swell Streak Badge or Super-Surf Bar
    const centerStart = starfishX + starfishWidth + 14;
    const centerEnd = bestX - bestWidth - 14;
    const centerAvailable = centerEnd - centerStart;

    // Dynamic Swell Streak Pill Badge
    if (this.state.combo > 1 && !this.state.isHoverboardActive && centerAvailable > 70) {
      const comboW = Math.min(110, centerAvailable);
      const comboH = 28;
      const comboX = centerStart + (centerAvailable - comboW) / 2;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
      this.drawRoundedRect(ctx, comboX, hudY + 11, comboW, comboH, 8);
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.4;
      this.drawRoundedRect(ctx, comboX, hudY + 11, comboW, comboH, 8);
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 12px "Outfit", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`SWELL x${this.state.combo}!`, comboX + comboW / 2, hudY + 29);
    }

    // Super-Surf Wave Shield status bar
    if (this.state.isHoverboardActive) {
      const remainingPct = this.state.hoverboardRemainingSec / this.state.HOVERBOARD_DURATION;
      const barW = Math.min(145, Math.max(80, centerAvailable > 80 ? centerAvailable : 145));
      const barX = centerAvailable > 80 ? centerStart + (centerAvailable - barW) / 2 : w / 2 - barW / 2;
      ctx.fillStyle = 'rgba(8, 19, 37, 0.85)';
      this.drawRoundedRect(ctx, barX, hudY + 13, barW, 24, 6);
      ctx.fill();

      ctx.fillStyle = '#0284c7';
      this.drawRoundedRect(ctx, barX + 2, hudY + 15, Math.max(0, (barW - 4) * remainingPct), 20, 4);
      ctx.fill();

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.2;
      this.drawRoundedRect(ctx, barX, hudY + 13, barW, 24, 6);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "Outfit", "Plus Jakarta Sans", sans-serif';
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
    ctx.fillStyle = 'rgba(6, 14, 26, 0.88)';
    ctx.fillRect(0, 0, w, h);

    // Sea-Glass Card in center
    const cardW = Math.min(520, w * 0.85);
    const cardH = Math.min(420, h * 0.8);
    const cardX = w * 0.5 - cardW * 0.5;
    const cardY = h * 0.5 - cardH * 0.5;

    ctx.fillStyle = 'rgba(10, 22, 38, 0.96)';
    this.drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.fill();

    const isRecord = this.state.isNewHighScore;
    ctx.strokeStyle = isRecord ? '#fbbf24' : '#f59e0b';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = isRecord ? 'rgba(251, 191, 36, 0.5)' : 'rgba(245, 158, 11, 0.35)';
    ctx.shadowBlur = 16;
    this.drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Header Title
    ctx.textAlign = 'center';
    if (isRecord) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 28px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('🏆 NEW BEACH RECORD! 🏆', w / 2, cardY + 54);
    } else {
      ctx.fillStyle = '#f97316';
      ctx.font = 'bold 28px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('SUNSET RUN SUMMARY', w / 2, cardY + 54);
    }

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 28, cardY + 76);
    ctx.lineTo(cardX + cardW - 28, cardY + 76);
    ctx.stroke();

    // Run Summary Grid with refined coastal typography
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 16px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`FINAL SCORE: ${Math.floor(this.state.score)}`, w / 2, cardY + 115);
    ctx.fillText(`STARFISH COLLECTED: ${this.state.coins}`, w / 2, cardY + 155);
    ctx.fillText(`MAX SWELL STREAK: x${this.state.maxCombo}`, w / 2, cardY + 195);
    ctx.fillText(`OBSTACLES CLEARED: ${this.state.obstaclesCleared}`, w / 2, cardY + 235);
    ctx.fillText(`LEAPS / TUCKS: ${this.state.jumpsPerformed} / ${this.state.ducksPerformed}`, w / 2, cardY + 275);

    // Replay Prompt with smooth breathing pulse
    const pulse = Math.sin(performance.now() * 0.006) * 0.25 + 0.75;
    ctx.fillStyle = `rgba(56, 189, 248, ${pulse})`;
    ctx.font = 'bold 15px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('PRESS SPACE OR JUMP TO CATCH THE NEXT WAVE', w / 2, cardY + cardH - 36);

    ctx.restore();
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
  }
}

export const GameRunner = RunnerGame;
export type GameRunner = RunnerGame;
