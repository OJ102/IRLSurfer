/**
 * Camera HUD and Pose Skeleton Overlay.
 * Visualizes real-time body tracking, calibration status, and detected gestures
 * with modern cyberpunk aesthetics, glowing neon skeleton joints, and glassmorphic UI.
 */

import {
  GestureDetector,
  DetectorState,
  DistanceStatus,
  GestureEvent,
} from './detector';
import { Landmark } from './landmarks';

export class CameraHUD {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastBannerText: string = '';
  private bannerAlpha: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context not supported');
    }
    this.ctx = context;
  }

  showGestureBanner(event: GestureEvent): void {
    switch (event) {
      case GestureEvent.LANE_LEFT:
        this.lastBannerText = '◀ LANE LEFT';
        break;
      case GestureEvent.LANE_RIGHT:
        this.lastBannerText = 'LANE RIGHT ▶';
        break;
      case GestureEvent.JUMP:
        this.lastBannerText = '▲ JUMP ▲';
        break;
      case GestureEvent.DUCK:
        this.lastBannerText = '▼ DUCK ▼';
        break;
      case GestureEvent.HOVERBOARD:
        this.lastBannerText = '⚡ HOVERBOARD SHIELD ⚡';
        break;
    }
    this.bannerAlpha = 1.0;
  }

  render(
    video: HTMLVideoElement | null,
    landmarks: Landmark[] | null,
    detector: GestureDetector,
    dt: number,
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw mirrored video feed
    if (video && video.readyState >= 2) {
      ctx.save();
      // Mirror horizontally so moving right moves right on screen
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    } else {
      // Placeholder dark cyberpunk background
      ctx.fillStyle = '#0a0717';
      ctx.fillRect(0, 0, w, h);
    }

    // Semi-transparent dark tint for high contrast
    ctx.fillStyle = 'rgba(8, 5, 18, 0.45)';
    ctx.fillRect(0, 0, w, h);

    // Cyber corner reticle brackets
    this.drawReticleBrackets(ctx, w, h);

    // 2. Draw Skeleton if landmarks available
    if (landmarks && landmarks.length > 0) {
      this.drawSkeleton(ctx, landmarks, w, h);
    }

    // 3. Draw State & Calibration Banner
    this.drawStatus(ctx, detector, w, h, landmarks);

    // 4. Draw Calibration Distance Alert notice if distance non-optimal during calibration
    if (
      detector.state === DetectorState.CALIBRATING &&
      (detector.lastDistanceStatus === DistanceStatus.TOO_CLOSE ||
        detector.lastDistanceStatus === DistanceStatus.TOO_FAR)
    ) {
      this.drawCalibrationDistanceAlert(ctx, detector, w, h);
    }

    // 5. Draw Gesture Banner Notification with smooth fadeout and cyber glow
    if (this.bannerAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.bannerAlpha;
      ctx.fillStyle = 'rgba(14, 9, 28, 0.88)';
      ctx.fillRect(16, h - 56, w - 32, 44);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 12;
      ctx.strokeRect(16, h - 56, w - 32, 44);

      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.lastBannerText, w / 2, h - 28);
      ctx.restore();

      this.bannerAlpha = Math.max(0, this.bannerAlpha - dt * 1.6);
    }
  }

  private drawReticleBrackets(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    const bracketLen = 20;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(12, 12 + bracketLen);
    ctx.lineTo(12, 12);
    ctx.lineTo(12 + bracketLen, 12);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(w - 12 - bracketLen, 12);
    ctx.lineTo(w - 12, 12);
    ctx.lineTo(w - 12, 12 + bracketLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(12, h - 12 - bracketLen);
    ctx.lineTo(12, h - 12);
    ctx.lineTo(12 + bracketLen, h - 12);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(w - 12 - bracketLen, h - 12);
    ctx.lineTo(w - 12, h - 12);
    ctx.lineTo(w - 12, h - 12 - bracketLen);
    ctx.stroke();

    ctx.restore();
  }

  private drawSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    w: number,
    h: number,
  ): void {
    // Note: mirror landmark X to match video mirror (1.0 - x)
    const getCoords = (idx: number): { x: number; y: number } | null => {
      const lm = landmarks[idx];
      if (!lm || (lm.visibility ?? 1.0) < 0.4) return null;
      return {
        x: (1.0 - lm.x) * w,
        y: lm.y * h,
      };
    };

    // Connections:
    // Torso: 11 (L shoulder) - 12 (R shoulder) - 24 (R hip) - 23 (L hip) - 11
    // Arms: 11 - 13 (L elbow) - 15 (L wrist)
    // Arms: 12 - 14 (R elbow) - 16 (R wrist)
    const connections: [number, number][] = [
      [11, 12],
      [12, 24],
      [24, 23],
      [23, 11],
      [11, 13],
      [13, 15],
      [12, 14],
      [14, 16],
    ];

    ctx.save();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;

    for (const [i, j] of connections) {
      const p1 = getCoords(i);
      const p2 = getCoords(j);
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // Key joint points with glowing nodes
    const keyJoints = [11, 12, 23, 24, 15, 16];
    for (const j of keyJoints) {
      const p = getCoords(j);
      if (p) {
        const isWrist = j === 15 || j === 16;
        ctx.fillStyle = isWrist ? '#ffe600' : '#ff00aa';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isWrist ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();

        if (isWrist) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  private drawStatus(
    ctx: CanvasRenderingContext2D,
    detector: GestureDetector,
    w: number,
    _h: number,
    landmarks: Landmark[] | null = null,
  ): void {
    ctx.save();

    // Top status pill (Glassmorphism look)
    const state = detector.state;
    let badgeColor = '#00ffcc';
    let text = 'CONTROLLER: ACTIVE';

    if (state === DetectorState.CALIBRATING) {
      if (
        detector.lastDistanceStatus === DistanceStatus.TOO_CLOSE ||
        detector.lastDistanceStatus === DistanceStatus.TOO_FAR
      ) {
        badgeColor = '#ffaa00';
        text = 'CALIBRATION PAUSED: DISTANCE';
      } else {
        badgeColor = '#ffe600';
        text = 'STAND STILL - CALIBRATING...';
      }
    } else if (state === DetectorState.PAUSED) {
      badgeColor = '#ff0055';
      text = 'CONTROLLER: PAUSED';
    }

    ctx.fillStyle = 'rgba(14, 9, 28, 0.85)';
    ctx.fillRect(8, 8, w - 16, 38);
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = badgeColor;
    ctx.shadowBlur = 8;
    ctx.strokeRect(8, 8, w - 16, 38);

    ctx.fillStyle = badgeColor;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, 16, 26);

    // Speed Multiplier pill badge
    const speed = detector.speedMultiplier ?? 1.0;
    const speedBadgeText = `[${speed.toFixed(1)}x SPEED]`;
    ctx.fillStyle = '#ffe600';
    const textMetrics = ctx.measureText(text);
    ctx.fillText(speedBadgeText, 16 + textMetrics.width + 12, 26);

    // Active lane pill
    if (state === DetectorState.ACTIVE) {
      let laneText = 'LANE: CENTER (0)';
      if (detector.currentLane === -1) laneText = 'LANE: LEFT (-1)';
      if (detector.currentLane === 1) laneText = 'LANE: RIGHT (+1)';

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(laneText, w - 16, 26);
    }

    // Distance Status pill badge in header
    const distStatus = detector.lastDistanceStatus;
    let distColor = '#888888';
    let distText = 'NO PERSON DETECTED';
    if (distStatus === DistanceStatus.OPTIMAL) {
      distColor = '#00ff88';
      distText = 'DISTANCE OK';
    } else if (distStatus === DistanceStatus.TOO_CLOSE) {
      distColor = '#ff3344';
      distText = 'STEP BACK - TOO CLOSE';
    } else if (distStatus === DistanceStatus.TOO_FAR) {
      distColor = '#ffaa00';
      distText = 'STEP CLOSER - TOO FAR';
    }

    ctx.fillStyle = distColor;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(distText, w / 2, 22);

    // Horizontal shoulder-width meter
    const meterW = Math.min(110, Math.max(50, w * 0.22));
    const meterH = 3;
    const meterX = (w - meterW) / 2;
    const meterY = 32;

    // Track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(meterX, meterY, meterW, meterH);

    // Optimal bracket [0.14, 0.45] over [0.0, 0.60]
    const rangeMax = 0.60;
    const optX1 = meterX + (detector.config.min_shoulder_width / rangeMax) * meterW;
    const optX2 = meterX + (detector.config.max_shoulder_width / rangeMax) * meterW;
    ctx.fillStyle = 'rgba(0, 255, 136, 0.4)';
    ctx.fillRect(optX1, meterY, Math.max(1, optX2 - optX1), meterH);

    // Current shoulder-width indicator dot / tick
    if (landmarks && landmarks.length > 12) {
      const l11 = landmarks[11];
      const l12 = landmarks[12];
      if (l11 && l12 && (l11.visibility ?? 1.0) >= 0.4 && (l12.visibility ?? 1.0) >= 0.4) {
        const sw = Math.hypot(l11.x - l12.x, l11.y - l12.y);
        const curRatio = Math.min(1.0, Math.max(0.0, sw / rangeMax));
        const curX = meterX + curRatio * meterW;
        const inOpt =
          sw >= detector.config.min_shoulder_width &&
          sw <= detector.config.max_shoulder_width;
        ctx.fillStyle = inOpt
          ? '#00ff88'
          : sw > detector.config.max_shoulder_width
            ? '#ff3344'
            : '#ffaa00';
        ctx.fillRect(curX - 1.5, meterY - 1, 3, meterH + 2);
      }
    }

    // Calibration Progress Bar
    if (state === DetectorState.CALIBRATING) {
      const progress = detector.calibrationProgress;
      const barW = w - 32;
      ctx.fillStyle = 'rgba(255, 230, 0, 0.2)';
      ctx.fillRect(16, 48, barW, 6);
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(16, 48, barW * progress, 6);
    }

    ctx.restore();
  }

  private drawCalibrationDistanceAlert(
    ctx: CanvasRenderingContext2D,
    detector: GestureDetector,
    w: number,
    h: number,
  ): void {
    const isTooClose = detector.lastDistanceStatus === DistanceStatus.TOO_CLOSE;
    const title = isTooClose
      ? 'CALIBRATION PAUSED: TOO CLOSE'
      : 'CALIBRATION PAUSED: TOO FAR';
    const instruction = isTooClose
      ? 'STEP BACK - MOVE AWAY FROM CAMERA'
      : 'STEP CLOSER - MOVE TOWARDS CAMERA';
    const alertColor = isTooClose ? '#ff3344' : '#ffaa00';

    ctx.save();
    const boxW = Math.min(w - 32, 420);
    const boxH = 80;
    const x = (w - boxW) / 2;
    const y = (h - boxH) / 2;

    // Dark card background
    ctx.fillStyle = 'rgba(15, 10, 20, 0.92)';
    ctx.fillRect(x, y, boxW, boxH);

    // Alert border
    ctx.strokeStyle = alertColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxW, boxH);

    // Title
    ctx.fillStyle = alertColor;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, y + 30);

    // Instruction
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(instruction, w / 2, y + 56);

    ctx.restore();
  }
}
