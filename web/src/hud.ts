/**
 * Camera HUD and Pose Skeleton Overlay.
 * Visualizes real-time body tracking, calibration status, and detected gestures.
 */

import { GestureDetector, DetectorState, GestureEvent } from './detector';
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
      // Placeholder dark background
      ctx.fillStyle = '#0f0c1b';
      ctx.fillRect(0, 0, w, h);
    }

    // Semi-transparent dark tint for high contrast
    ctx.fillStyle = 'rgba(10, 8, 20, 0.4)';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw Skeleton if landmarks available
    if (landmarks && landmarks.length > 0) {
      this.drawSkeleton(ctx, landmarks, w, h);
    }

    // 3. Draw State & Calibration Banner
    this.drawStatus(ctx, detector, w, h);

    // 4. Draw Gesture Banner Notification with smooth fadeout
    if (this.bannerAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.bannerAlpha;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(10, h - 52, w - 20, 42);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, h - 52, w - 20, 42);

      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 16px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.lastBannerText, w / 2, h - 26);
      ctx.restore();

      this.bannerAlpha = Math.max(0, this.bannerAlpha - dt * 1.5);
    }
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
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 8;

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

    // Key joint points
    const keyJoints = [11, 12, 23, 24, 15, 16];
    for (const j of keyJoints) {
      const p = getCoords(j);
      if (p) {
        const isWrist = j === 15 || j === 16;
        ctx.fillStyle = isWrist ? '#ffe600' : '#ff00aa';
        ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isWrist ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawStatus(
    ctx: CanvasRenderingContext2D,
    detector: GestureDetector,
    w: number,
    _h: number,
  ): void {
    ctx.save();

    // Top status pill
    const state = detector.state;
    let badgeColor = '#00ffcc';
    let text = 'CONTROLLER: ACTIVE';

    if (state === DetectorState.CALIBRATING) {
      badgeColor = '#ffe600';
      text = 'STAND STILL - CALIBRATING...';
    } else if (state === DetectorState.PAUSED) {
      badgeColor = '#ff0055';
      text = 'CONTROLLER: PAUSED';
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(8, 8, w - 16, 32);
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(8, 8, w - 16, 32);

    ctx.fillStyle = badgeColor;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(text, 18, 28);

    // Active lane pill
    if (state === DetectorState.ACTIVE) {
      let laneText = 'LANE: CENTER (0)';
      if (detector.currentLane === -1) laneText = 'LANE: LEFT (-1)';
      if (detector.currentLane === 1) laneText = 'LANE: RIGHT (+1)';

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(laneText, w - 18, 28);
    }

    // Calibration Progress Bar
    if (state === DetectorState.CALIBRATING) {
      const progress = detector.calibrationProgress;
      const barW = w - 32;
      ctx.fillStyle = 'rgba(255, 230, 0, 0.2)';
      ctx.fillRect(16, 44, barW, 6);
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(16, 44, barW * progress, 6);
    }

    ctx.restore();
  }
}
