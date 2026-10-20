/**
 * Pure state machine gesture detector for IRLSurfer Web Runtime.
 * Exact mathematical and state port of irlsurfer/detector.py.
 */

import { DEFAULT_GESTURE_CONFIG, GestureConfig } from './config';
import { Frame } from './landmarks';

export enum GestureEvent {
  LANE_LEFT = 'LANE_LEFT',
  LANE_RIGHT = 'LANE_RIGHT',
  JUMP = 'JUMP',
  DUCK = 'DUCK',
  HOVERBOARD = 'HOVERBOARD',
}

export enum DetectorState {
  CALIBRATING = 'CALIBRATING',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
}

export class GestureDetector {
  readonly config: GestureConfig;
  state: DetectorState = DetectorState.CALIBRATING;
  private _previousState: DetectorState = DetectorState.CALIBRATING;

  // Baseline calibration values
  baseX: number = 0.5;
  baseY: number = 0.5;
  baseSw: number = 0.2;

  // Calibration accumulation
  private _calibStartTime: number | null = null;
  private _calibXSamples: number[] = [];
  private _calibYSamples: number[] = [];
  private _calibSwSamples: number[] = [];

  // Tracking state
  currentLane: number = 0; // -1: left, 0: center, +1: right
  lastDy: number = 0.0;
  lastVelY: number = 0.0;
  private _lastTimestamp: number | null = null;

  // Cooldown & hold timers
  private _lastJumpTime: number = -1e9;
  private _lastDuckTime: number = -1e9;
  private _lastHoverboardTime: number = -1e9;
  private _wristTouchStartTime: number | null = null;
  private _hoverboardFiredForTouch: boolean = false;

  constructor(config?: Partial<GestureConfig>) {
    this.config = {
      ...DEFAULT_GESTURE_CONFIG,
      ...config,
    };
  }

  get calibrationProgress(): number {
    if (this.state !== DetectorState.CALIBRATING || this._calibStartTime === null) {
      return this.state === DetectorState.CALIBRATING ? 0 : 1.0;
    }
    const lastTime = this._lastTimestamp ?? this._calibStartTime;
    const elapsed = lastTime - this._calibStartTime;
    return Math.min(1.0, Math.max(0.0, elapsed / this.config.calibration_seconds));
  }

  pause(): void {
    if (this.state !== DetectorState.PAUSED) {
      this._previousState = this.state;
      this.state = DetectorState.PAUSED;
    }
  }

  resume(): void {
    if (this.state === DetectorState.PAUSED) {
      this.state = this._previousState;
    }
  }

  recalibrate(): void {
    this.state = DetectorState.CALIBRATING;
    this._calibStartTime = null;
    this._calibXSamples = [];
    this._calibYSamples = [];
    this._calibSwSamples = [];
    this.currentLane = 0;
    this._wristTouchStartTime = null;
    this._hoverboardFiredForTouch = false;
  }

  processFrame(frame: Frame): GestureEvent[] {
    if (this.state === DetectorState.PAUSED) {
      return [];
    }

    // Validate landmark visibility and torso integrity
    if (!frame.isValid(this.config.min_visibility)) {
      this._wristTouchStartTime = null;
      this._hoverboardFiredForTouch = false;
      return [];
    }

    // Mirror horizontal coordinate: physical step right moves right
    const mirroredX = 1.0 - frame.centerX;
    const rawY = frame.centerY;
    const rawSw = frame.shoulderWidth;

    if (this.state === DetectorState.CALIBRATING) {
      return this._handleCalibration(mirroredX, rawY, rawSw, frame.timestamp);
    }

    return this._handleActive(frame, mirroredX, rawY, frame.timestamp);
  }

  private _handleCalibration(
    mirroredX: number,
    rawY: number,
    rawSw: number,
    timestamp: number,
  ): GestureEvent[] {
    if (this._calibStartTime === null) {
      this._calibStartTime = timestamp;
    }

    this._calibXSamples.push(mirroredX);
    this._calibYSamples.push(rawY);
    this._calibSwSamples.push(rawSw);
    this._lastTimestamp = timestamp;

    const elapsed = timestamp - this._calibStartTime;
    if (elapsed >= this.config.calibration_seconds && this._calibXSamples.length >= 2) {
      this.baseX =
        this._calibXSamples.reduce((a, b) => a + b, 0) / this._calibXSamples.length;
      this.baseY =
        this._calibYSamples.reduce((a, b) => a + b, 0) / this._calibYSamples.length;
      this.baseSw =
        this._calibSwSamples.reduce((a, b) => a + b, 0) / this._calibSwSamples.length;

      if (this.baseSw <= 1e-4) {
        this.baseSw = 0.2;
      }

      this.currentLane = 0;
      this.lastDy = 0.0;
      this.lastVelY = 0.0;
      this._lastTimestamp = timestamp;
      this.state = DetectorState.ACTIVE;
    }

    return [];
  }

  private _handleActive(
    frame: Frame,
    mirroredX: number,
    rawY: number,
    timestamp: number,
  ): GestureEvent[] {
    const events: GestureEvent[] = [];

    // Displacements normalized by baseline shoulder width
    const dx = (mirroredX - this.baseX) / this.baseSw;
    // Upward motion: y decreases, so baseY - rawY > 0 (jump)
    // Downward motion: y increases, so baseY - rawY < 0 (duck)
    const dy = (this.baseY - rawY) / this.baseSw;

    // Compute vertical velocity
    const dt =
      this._lastTimestamp !== null ? timestamp - this._lastTimestamp : 0.0;
    const velY = dt > 1e-4 ? (dy - this.lastDy) / dt : 0.0;

    this.lastDy = dy;
    this.lastVelY = velY;
    this._lastTimestamp = timestamp;

    // 1. Lane detection with hysteresis
    const laneEvents = this._updateLane(dx);
    for (const ev of laneEvents) {
      events.push(ev);
    }

    // 2. Jump detection
    if (
      dy >= this.config.jump_dy_thresh &&
      velY >= this.config.jump_vel_thresh &&
      timestamp - this._lastJumpTime >= this.config.jump_cooldown_sec
    ) {
      events.push(GestureEvent.JUMP);
      this._lastJumpTime = timestamp;
    }
    // 3. Duck detection
    else if (
      dy <= this.config.duck_dy_thresh &&
      velY <= this.config.duck_vel_thresh &&
      timestamp - this._lastDuckTime >= this.config.duck_cooldown_sec
    ) {
      events.push(GestureEvent.DUCK);
      this._lastDuckTime = timestamp;
    }

    // 4. Hoverboard detection (wrists together hold)
    const hoverboardEvent = this._checkHoverboard(frame, timestamp);
    if (hoverboardEvent !== null) {
      events.push(hoverboardEvent);
    }

    // 5. Dynamic recenter: slow baseline drift when stationary in center lane
    const isIdleInCenter =
      this.currentLane === 0 &&
      Math.abs(dx) < this.config.exit_lane_thresh &&
      Math.abs(dy) < this.config.jump_dy_thresh * 0.5 &&
      Math.abs(velY) < this.config.jump_vel_thresh * 0.5;

    if (isIdleInCenter) {
      const alpha = this.config.recenter_alpha;
      this.baseX = (1.0 - alpha) * this.baseX + alpha * mirroredX;
      this.baseY = (1.0 - alpha) * this.baseY + alpha * rawY;
    }

    return events;
  }

  private _updateLane(dx: number): GestureEvent[] {
    const events: GestureEvent[] = [];

    if (this.currentLane === 0) {
      if (dx >= this.config.enter_lane_thresh) {
        this.currentLane = 1;
        events.push(GestureEvent.LANE_RIGHT);
      } else if (dx <= -this.config.enter_lane_thresh) {
        this.currentLane = -1;
        events.push(GestureEvent.LANE_LEFT);
      }
    } else if (this.currentLane === 1) {
      if (dx <= this.config.exit_lane_thresh) {
        if (dx <= -this.config.enter_lane_thresh) {
          this.currentLane = -1;
          events.push(GestureEvent.LANE_LEFT);
          events.push(GestureEvent.LANE_LEFT);
        } else {
          this.currentLane = 0;
          events.push(GestureEvent.LANE_LEFT);
        }
      }
    } else if (this.currentLane === -1) {
      if (dx >= -this.config.exit_lane_thresh) {
        if (dx >= this.config.enter_lane_thresh) {
          this.currentLane = 1;
          events.push(GestureEvent.LANE_RIGHT);
          events.push(GestureEvent.LANE_RIGHT);
        } else {
          this.currentLane = 0;
          events.push(GestureEvent.LANE_RIGHT);
        }
      }
    }

    return events;
  }

  private _checkHoverboard(frame: Frame, timestamp: number): GestureEvent | null {
    const minVis = this.config.min_visibility;
    if (
      (frame.leftWrist.visibility ?? 1.0) < minVis ||
      (frame.rightWrist.visibility ?? 1.0) < minVis
    ) {
      this._wristTouchStartTime = null;
      this._hoverboardFiredForTouch = false;
      return null;
    }

    const dist = Math.hypot(
      frame.leftWrist.x - frame.rightWrist.x,
      frame.leftWrist.y - frame.rightWrist.y,
    );
    const threshold = this.config.hoverboard_dist_thresh * this.baseSw;

    if (dist <= threshold) {
      if (this._wristTouchStartTime === null) {
        this._wristTouchStartTime = timestamp;
      }

      const holdTime = timestamp - this._wristTouchStartTime;
      const cooldownOk =
        timestamp - this._lastHoverboardTime >= this.config.hoverboard_cooldown_sec;

      if (
        holdTime >= this.config.hoverboard_hold_sec &&
        !this._hoverboardFiredForTouch &&
        cooldownOk
      ) {
        this._lastHoverboardTime = timestamp;
        this._hoverboardFiredForTouch = true;
        return GestureEvent.HOVERBOARD;
      }
    } else {
      this._wristTouchStartTime = null;
      this._hoverboardFiredForTouch = false;
    }

    return null;
  }
}
