import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GestureDetector, DistanceStatus } from '../src/detector';

describe('Centralized Control Hub & Command Dock Tests', () => {
  const htmlPath = path.resolve(__dirname, '../index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  describe('1. Command Dock DOM & Cluster Integrity', () => {
    it('contains #commandDock inside .game-container', () => {
      expect(html).toContain('id="commandDock"');
      expect(html).toContain('class="command-dock"');
      expect(html).toMatch(/<section[^>]*class="[^"]*game-container[^"]*"[\s\S]*?<nav[^>]*id="commandDock"/);
    });

    it('contains Cluster 1: Actions (#btnPause, #btnRestart, #btnMute)', () => {
      expect(html).toContain('dock-cluster-actions');
      expect(html).toContain('id="btnPause"');
      expect(html).toContain('id="btnRestart"');
      expect(html).toContain('id="btnMute"');
    });

    it('contains Cluster 2: Mode Toggle (#btnModeKeyboard, #btnModeWebcam)', () => {
      expect(html).toContain('dock-cluster-mode');
      expect(html).toContain('id="btnModeKeyboard"');
      expect(html).toContain('id="btnModeWebcam"');
    });

    it('contains Cluster 3: Speed Cruise (#btnSpeedDown, #speedValue, #btnSpeedUp, #speedSlider, presets)', () => {
      expect(html).toContain('dock-cluster-speed');
      expect(html).toContain('id="btnSpeedDown"');
      expect(html).toContain('id="speedValue"');
      expect(html).toContain('id="btnSpeedUp"');
      expect(html).toContain('id="speedSlider"');
      expect(html).toContain('data-speed="0.5"');
      expect(html).toContain('data-speed="1.0"');
      expect(html).toContain('data-speed="1.5"');
      expect(html).toContain('data-speed="2.0"');
    });

    it('contains Cluster 4: Vision Center (#visionDistanceBadge, #btnRecalibrate)', () => {
      expect(html).toContain('dock-cluster-vision');
      expect(html).toContain('id="visionDistanceBadge"');
      expect(html).toContain('id="btnRecalibrate"');
    });

    it('contains Cluster 5: Drawer Toggle (#btnToggleDrawer)', () => {
      expect(html).toContain('dock-cluster-drawer');
      expect(html).toContain('id="btnToggleDrawer"');
    });

    it('asserts all required kbd badges exist on dock buttons', () => {
      // P, R, M, 1, 2, [, ], C, ?
      const requiredBadges = ['P', 'R', 'M', '1', '2', '[', ']', 'C', '?'];
      for (const badge of requiredBadges) {
        const pattern = new RegExp(`<kbd[^>]*class="[^"]*kbd-badge[^"]*"[^>]*>${badge === '[' ? '\\[' : (badge === ']' ? '\\]' : (badge === '?' ? '\\?' : badge))}</kbd>`);
        expect(html).toMatch(pattern);
      }
    });

    it('contains the off-canvas slide-out #controlsDrawer and #drawerBackdrop', () => {
      expect(html).toContain('id="controlsDrawer"');
      expect(html).toContain('id="drawerBackdrop"');
      expect(html).toContain('id="drawerClose"');
      expect(html).toContain('Controls &amp; Hotkeys Hub');
      expect(html).toContain('Motion Gestures (Webcam Mode)');
      expect(html).toContain('Master Keyboard Hotkeys');
      expect(html).toContain('Stance &amp; Calibration Tips');
    });
  });

  describe('2. Speed Stepper & Multiplier Parity Logic', () => {
    let detector: GestureDetector;

    beforeEach(() => {
      detector = new GestureDetector();
    });

    it('steps speed down by 0.25x and clamps to 0.5x', () => {
      let speed = 1.0;
      const stepDown = () => Math.max(0.5, Math.min(2.5, Math.round((speed - 0.25) * 100) / 100));

      speed = stepDown();
      expect(speed).toBe(0.75);
      detector.setSpeedMultiplier(speed);
      expect(detector.speedMultiplier).toBe(0.75);

      speed = stepDown();
      expect(speed).toBe(0.5);
      detector.setSpeedMultiplier(speed);
      expect(detector.speedMultiplier).toBe(0.5);

      // Clamping at min 0.5x
      speed = stepDown();
      expect(speed).toBe(0.5);
      detector.setSpeedMultiplier(speed);
      expect(detector.speedMultiplier).toBe(0.5);
    });

    it('steps speed up by 0.25x and clamps to 2.5x', () => {
      let speed = 1.0;
      const stepUp = () => Math.max(0.5, Math.min(2.5, Math.round((speed + 0.25) * 100) / 100));

      speed = stepUp();
      expect(speed).toBe(1.25);
      detector.setSpeedMultiplier(speed);
      expect(detector.speedMultiplier).toBe(1.25);

      speed = 2.25;
      speed = stepUp();
      expect(speed).toBe(2.5);
      detector.setSpeedMultiplier(speed);
      expect(detector.speedMultiplier).toBe(2.5);

      // Clamping at max 2.5x
      speed = stepUp();
      expect(speed).toBe(2.5);
      detector.setSpeedMultiplier(speed);
      expect(detector.speedMultiplier).toBe(2.5);
    });

    it('scales jump and duck thresholds proportionally with speed multiplier', () => {
      const baseJumpVel = detector.baseJumpVelThresh;
      const baseJumpCd = detector.baseJumpCooldownSec;

      detector.setSpeedMultiplier(2.0);
      expect(detector.jumpVelThresh).toBeCloseTo(baseJumpVel * 2.0);
      expect(detector.jumpCooldownSec).toBeCloseTo(baseJumpCd / 2.0);

      detector.setSpeedMultiplier(0.5);
      expect(detector.jumpVelThresh).toBeCloseTo(baseJumpVel * 0.5);
      expect(detector.jumpCooldownSec).toBeCloseTo(baseJumpCd / 0.5);
    });
  });

  describe('3. Game Restart Lane Parity', () => {
    it('resets lane in detector on game restart to prevent desync', () => {
      const detector = new GestureDetector();
      detector.currentLane = 1; // Surfer in right lane
      expect(detector.currentLane).toBe(1);

      detector.resetLane();
      expect(detector.currentLane).toBe(0); // Centered
    });
  });

  describe('4. Distance Guidance Status Parity', () => {
    it('returns correct guidance message for each status enum', () => {
      const detector = new GestureDetector();

      detector.lastDistanceStatus = DistanceStatus.OPTIMAL;
      expect(detector.distanceGuidanceMessage).toBe('DISTANCE OK');

      detector.lastDistanceStatus = DistanceStatus.TOO_CLOSE;
      expect(detector.distanceGuidanceMessage).toBe('STEP BACK - TOO CLOSE');

      detector.lastDistanceStatus = DistanceStatus.TOO_FAR;
      expect(detector.distanceGuidanceMessage).toBe('STEP CLOSER - TOO FAR');

      detector.lastDistanceStatus = DistanceStatus.UNKNOWN;
      expect(detector.distanceGuidanceMessage).toBe('NO PERSON DETECTED');
    });
  });
});
