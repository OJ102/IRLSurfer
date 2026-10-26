/**
 * Camera HUD and Pose Skeleton Overlay.
 * Visualizes real-time body tracking, calibration status, and detected gestures
 * with California coastal aesthetics, sea-glass panels,
 * and high-contrast ergonomic skeleton rendering.
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
        this.lastBannerText = '◀ CARVE LEFT';
        break;
      case GestureEvent.LANE_RIGHT:
        this.lastBannerText = 'CARVE RIGHT ▶';
        break;
      case GestureEvent.JUMP:
        this.lastBannerText = '▲ RIDE SWELL (JUMP) ▲';
        break;
      case GestureEvent.DUCK:
        this.lastBannerText = '▼ SURF TUCK (DUCK) ▼';
        break;
      case GestureEvent.HOVERBOARD:
        this.lastBannerText = '☀️ SUPER-SURF WAVE SHIELD ☀️';
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
      // Placeholder oceanic backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#060e1a');
      bgGrad.addColorStop(1, '#0c1c30');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Semi-transparent deep coastal tint for high contrast and calm visual tone
    ctx.fillStyle = 'rgba(6, 14, 26, 0.15)';
    ctx.fillRect(0, 0, w, h);

    // Coastal corner reticle brackets with precision ticks
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

    // 5. Draw Gesture Banner Notification with smooth fadeout
    if (this.bannerAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(1.0, this.bannerAlpha);

      const bannerW = Math.min(w - 32, 420);
      const bannerH = 46;
      const bannerX = (w - bannerW) / 2;
      const bannerY = h - 60;

      // Sea-glass card
      ctx.fillStyle = 'rgba(8, 19, 37, 0.92)';
      this.drawRoundedRect(ctx, bannerX, bannerY, bannerW, bannerH, 12);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(56, 189, 248, 0.4)';
      ctx.shadowBlur = 12;
      this.drawRoundedRect(ctx, bannerX, bannerY, bannerW, bannerH, 12);
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
      ctx.shadowBlur = 6;
      ctx.font = 'bold 16px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.lastBannerText, w / 2, bannerY + 28);
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
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 2;
    const bracketLen = 22;
    const inset = 14;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(inset, inset + bracketLen);
    ctx.lineTo(inset, inset);
    ctx.lineTo(inset + bracketLen, inset);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(w - inset - bracketLen, inset);
    ctx.lineTo(w - inset, inset);
    ctx.lineTo(w - inset, inset + bracketLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(inset, h - inset - bracketLen);
    ctx.lineTo(inset, h - inset);
    ctx.lineTo(inset + bracketLen, h - inset);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(w - inset - bracketLen, h - inset);
    ctx.lineTo(w - inset, h - inset);
    ctx.lineTo(w - inset, h - inset - bracketLen);
    ctx.stroke();

    // Subtle corner accent dots (each dot is its own path so the
    // arcs are never joined into one filled polygon over the feed)
    ctx.fillStyle = '#14b8a6';
    const dotDist = inset + 4;
    const dotCenters: [number, number][] = [
      [dotDist, dotDist],
      [w - dotDist, dotDist],
      [dotDist, h - dotDist],
      [w - dotDist, h - dotDist],
    ];
    for (const [cx, cy] of dotCenters) {
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    w: number,
    h: number,
  ): void {
    const getCoords = (idx: number): { x: number; y: number } | null => {
      const lm = landmarks[idx];
      if (!lm || (lm.visibility ?? 1.0) < 0.4) return null;
      return {
        x: (1.0 - lm.x) * w,
        y: lm.y * h,
      };
    };

    const connections: [number, number][] = [
      [11, 12], // Shoulders
      [12, 24], // Right torso
      [24, 23], // Hips
      [23, 11], // Left torso
      [11, 13], // Left upper arm
      [13, 15], // Left forearm
      [12, 14], // Right upper arm
      [14, 16], // Right forearm
    ];

    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
    ctx.shadowBlur = 10;
    ctx.lineCap = 'round';

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

    // Inner bright bone highlight
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
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

    // Key joint points with warm coastal accents
    const keyJoints = [11, 12, 23, 24, 13, 14, 15, 16];
    for (const j of keyJoints) {
      const p = getCoords(j);
      if (p) {
        const isWrist = j === 15 || j === 16;
        const isElbow = j === 13 || j === 14;

        if (isWrist) {
          // Luminous golden wrists (Gesture triggers)
          ctx.fillStyle = '#fbbf24';
          ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
          ctx.fill();

          // Concentric outer ring
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isElbow) {
          // Seafoam elbow joints
          ctx.fillStyle = '#34d399';
          ctx.shadowColor = 'rgba(52, 211, 153, 0.6)';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Coral shoulder & hip anchors
          ctx.fillStyle = '#fb7185';
          ctx.shadowColor = 'rgba(251, 113, 133, 0.6)';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8.5, 0, Math.PI * 2);
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

    // Top status pill (Frosted Sea-glass styling)
    const state = detector.state;
    let badgeColor = '#34d399';
    let text = 'SURFER ACTIVE';

    if (state === DetectorState.CALIBRATING) {
      if (
        detector.lastDistanceStatus === DistanceStatus.TOO_CLOSE ||
        detector.lastDistanceStatus === DistanceStatus.TOO_FAR
      ) {
        badgeColor = '#fbbf24';
        text = 'CALIBRATION PAUSED: DISTANCE';
      } else {
        badgeColor = '#fbbf24';
        text = 'CALIBRATING READY STANCE...';
      }
    } else if (state === DetectorState.PAUSED) {
      badgeColor = '#f87171';
      text = 'CONTROLLER PAUSED';
    }

    const pillX = 10;
    const pillY = 10;
    const pillW = w - 20;
    const pillH = 42;

    // Background card
    ctx.fillStyle = 'rgba(8, 19, 37, 0.72)';
    this.drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 10);
    ctx.fill();

    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = badgeColor;
    ctx.shadowBlur = 8;
    this.drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Status dot indicator
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.arc(pillX + 16, pillY + 18, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Status label
    ctx.fillStyle = badgeColor;
    ctx.font = 'bold 11px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text, pillX + 27, pillY + 22);

    // Speed Multiplier pill badge
    const speed = detector.speedMultiplier ?? 1.0;
    const speedBadgeText = `${speed.toFixed(1)}x CRUISE`;
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 11px "Outfit", monospace';
    const textMetrics = ctx.measureText(text);
    const speedX = pillX + 27 + textMetrics.width + 12;
    ctx.fillText(speedBadgeText, speedX, pillY + 22);

    // Active lane indicator (right-aligned)
    if (state === DetectorState.ACTIVE) {
      let laneText = 'LANE: CENTER';
      if (detector.currentLane === -1) laneText = 'LANE: LEFT';
      if (detector.currentLane === 1) laneText = 'LANE: RIGHT';

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'right';
      ctx.font = 'bold 11px "Outfit", "Plus Jakarta Sans", sans-serif';
      ctx.fillText(laneText, pillX + pillW - 14, pillY + 22);
    }

    // Distance Status in center
    const distStatus = detector.lastDistanceStatus;
    let distColor = '#94a3b8';
    let distText = 'STAND IN FRAME';
    if (distStatus === DistanceStatus.OPTIMAL) {
      distColor = '#34d399';
      distText = 'DISTANCE OPTIMAL';
    } else if (distStatus === DistanceStatus.TOO_CLOSE) {
      distColor = '#f87171';
      distText = 'STEP BACK';
    } else if (distStatus === DistanceStatus.TOO_FAR) {
      distColor = '#fbbf24';
      distText = 'STEP CLOSER';
    }

    ctx.fillStyle = distColor;
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px "Outfit", "Plus Jakarta Sans", monospace';
    ctx.fillText(distText, w / 2, pillY + 18);

    // Horizontal precision shoulder-width meter
    const meterW = Math.min(120, Math.max(60, w * 0.24));
    const meterH = 4;
    const meterX = (w - meterW) / 2;
    const meterY = pillY + 28;

    // Track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    this.drawRoundedRect(ctx, meterX, meterY, meterW, meterH, 2);
    ctx.fill();

    // Optimal bracket zone
    const rangeMax = 0.60;
    const optX1 = meterX + (detector.config.min_shoulder_width / rangeMax) * meterW;
    const optX2 = meterX + (detector.config.max_shoulder_width / rangeMax) * meterW;
    ctx.fillStyle = 'rgba(52, 211, 153, 0.55)';
    this.drawRoundedRect(ctx, optX1, meterY, Math.max(1, optX2 - optX1), meterH, 2);
    ctx.fill();

    // Current shoulder-width indicator dot
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
          ? '#34d399'
          : sw > detector.config.max_shoulder_width
            ? '#f87171'
            : '#fbbf24';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(curX, meterY + meterH / 2, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Calibration Progress Bar under pill
    if (state === DetectorState.CALIBRATING) {
      const progress = detector.calibrationProgress;
      const barW = pillW - 24;
      const barY = pillY + pillH + 4;
      ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
      this.drawRoundedRect(ctx, pillX + 12, barY, barW, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = 'rgba(251, 191, 36, 0.5)';
      ctx.shadowBlur = 6;
      this.drawRoundedRect(ctx, pillX + 12, barY, Math.max(4, barW * progress), 5, 2.5);
      ctx.fill();
      ctx.shadowBlur = 0;
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
    const alertColor = isTooClose ? '#f87171' : '#fbbf24';

    ctx.save();
    const boxW = Math.min(w - 32, 420);
    const boxH = 82;
    const x = (w - boxW) / 2;
    const y = (h - boxH) / 2;

    // Sea-glass card background
    ctx.fillStyle = 'rgba(8, 19, 37, 0.94)';
    this.drawRoundedRect(ctx, x, y, boxW, boxH, 14);
    ctx.fill();

    // Alert border with soft glow
    ctx.strokeStyle = alertColor;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = alertColor;
    ctx.shadowBlur = 10;
    this.drawRoundedRect(ctx, x, y, boxW, boxH, 14);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Title
    ctx.fillStyle = alertColor;
    ctx.font = 'bold 13px "Outfit", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, w / 2, y + 32);

    // Instruction
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Outfit", "Plus Jakarta Sans", monospace';
    ctx.fillText(instruction, w / 2, y + 58);

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
