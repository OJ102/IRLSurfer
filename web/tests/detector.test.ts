import { describe, it, expect, beforeEach } from 'vitest';
import {
  GestureDetector,
  DetectorState,
  DistanceStatus,
  GestureEvent,
} from '../src/detector';
import { Frame, Landmark } from '../src/landmarks';

function createDummyFrame(
  timestamp: number,
  centerX: number = 0.5,
  centerY: number = 0.5,
  shoulderWidth: number = 0.2,
  leftWrist?: Landmark,
  rightWrist?: Landmark,
  minVisibility: number = 1.0,
): Frame {
  const halfSw = shoulderWidth / 2;
  const leftShoulder: Landmark = {
    x: centerX + halfSw,
    y: centerY - 0.1,
    z: 0.0,
    visibility: minVisibility,
  };
  const rightShoulder: Landmark = {
    x: centerX - halfSw,
    y: centerY - 0.1,
    z: 0.0,
    visibility: minVisibility,
  };
  const leftHip: Landmark = {
    x: centerX + halfSw,
    y: centerY + 0.1,
    z: 0.0,
    visibility: minVisibility,
  };
  const rightHip: Landmark = {
    x: centerX - halfSw,
    y: centerY + 0.1,
    z: 0.0,
    visibility: minVisibility,
  };

  const defLeftWrist: Landmark = leftWrist ?? {
    x: centerX + 0.3,
    y: centerY + 0.2,
    z: 0.0,
    visibility: minVisibility,
  };
  const defRightWrist: Landmark = rightWrist ?? {
    x: centerX - 0.3,
    y: centerY + 0.2,
    z: 0.0,
    visibility: minVisibility,
  };

  return new Frame(
    timestamp,
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    defLeftWrist,
    defRightWrist,
    null,
  );
}

describe('GestureDetector Unit Tests', () => {
  let detector: GestureDetector;

  beforeEach(() => {
    detector = new GestureDetector();
  });

  it('starts in CALIBRATING state and transitions to ACTIVE after calibration_seconds', () => {
    expect(detector.state).toBe(DetectorState.CALIBRATING);
    expect(detector.calibrationProgress).toBe(0);

    // Feed 1 second of frames at 30 fps
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const evs = detector.processFrame(createDummyFrame(t, 0.5, 0.5, 0.2));
      expect(evs).toEqual([]);
    }
    expect(detector.state).toBe(DetectorState.CALIBRATING);
    expect(detector.calibrationProgress).toBeCloseTo(0.5, 1);

    // Feed up to 2.1 seconds
    for (let i = 31; i <= 65; i++) {
      const t = i / 30;
      detector.processFrame(createDummyFrame(t, 0.5, 0.5, 0.2));
    }
    expect(detector.state).toBe(DetectorState.ACTIVE);
    expect(detector.calibrationProgress).toBe(1.0);
    // Note: mirrored_x = 1.0 - 0.5 = 0.5
    expect(detector.baseX).toBeCloseTo(0.5, 2);
    expect(detector.baseY).toBeCloseTo(0.5, 2);
    expect(detector.baseSw).toBeCloseTo(0.2, 2);
  });

  it('handles pause, resume, and recalibrate correctly', () => {
    // Calibrate
    for (let i = 0; i <= 65; i++) {
      detector.processFrame(createDummyFrame(i / 30, 0.5, 0.5, 0.2));
    }
    expect(detector.state).toBe(DetectorState.ACTIVE);

    detector.pause();
    expect(detector.state).toBe(DetectorState.PAUSED);
    // Frames processed during pause return empty
    expect(detector.processFrame(createDummyFrame(3.0, 0.2, 0.5, 0.2))).toEqual([]);

    detector.resume();
    expect(detector.state).toBe(DetectorState.ACTIVE);

    detector.recalibrate();
    expect(detector.state).toBe(DetectorState.CALIBRATING);
  });

  it('handles lane hysteresis: center -> right -> center -> left', () => {
    // Calibrate baseline: center_x = 0.5 -> mirrored_x = 0.5, baseSw = 0.2
    for (let i = 0; i <= 65; i++) {
      detector.processFrame(createDummyFrame(i / 30, 0.5, 0.5, 0.2));
    }

    // Step physical right: mirrored_x increases (so center_x decreases)
    // dx = (mirrored_x - 0.5) / 0.2. To reach enter_lane_thresh (0.6), dx >= 0.6 -> mirrored_x >= 0.62 -> center_x <= 0.38
    let evs = detector.processFrame(createDummyFrame(2.5, 0.35, 0.5, 0.2));
    expect(evs).toEqual([GestureEvent.LANE_RIGHT]);
    expect(detector.currentLane).toBe(1);

    // Minor oscillation above exit_lane_thresh (0.4) -> dx = (0.59 - 0.5)/0.2 = 0.45 >= 0.4 -> stays in lane 1
    evs = detector.processFrame(createDummyFrame(2.6, 0.41, 0.5, 0.2));
    expect(evs).toEqual([]);
    expect(detector.currentLane).toBe(1);

    // Return to center: dx drops below exit_lane_thresh (0.4) -> mirrored_x <= 0.57 -> center_x >= 0.43
    evs = detector.processFrame(createDummyFrame(2.7, 0.48, 0.5, 0.2));
    expect(evs).toEqual([GestureEvent.LANE_LEFT]);
    expect(detector.currentLane).toBe(0);

    // Step physical left: mirrored_x decreases -> dx <= -0.6 -> mirrored_x <= 0.38 -> center_x >= 0.62
    evs = detector.processFrame(createDummyFrame(2.8, 0.65, 0.5, 0.2));
    expect(evs).toEqual([GestureEvent.LANE_LEFT]);
    expect(detector.currentLane).toBe(-1);

    // Return to center from left: dx >= -0.4 -> mirrored_x >= 0.42 -> center_x <= 0.58
    evs = detector.processFrame(createDummyFrame(2.9, 0.50, 0.5, 0.2));
    expect(evs).toEqual([GestureEvent.LANE_RIGHT]);
    expect(detector.currentLane).toBe(0);
  });

  it('handles cross-lane sweep directly from left (-1) to right (+1)', () => {
    for (let i = 0; i <= 65; i++) {
      detector.processFrame(createDummyFrame(i / 30, 0.5, 0.5, 0.2));
    }
    // Into left lane
    detector.processFrame(createDummyFrame(2.5, 0.65, 0.5, 0.2));
    expect(detector.currentLane).toBe(-1);

    // Instant sweep all the way to right lane: center_x = 0.35 -> mirrored_x = 0.65 -> dx = 0.75 >= enter_lane_thresh
    const evs = detector.processFrame(createDummyFrame(2.6, 0.35, 0.5, 0.2));
    expect(evs).toEqual([GestureEvent.LANE_RIGHT, GestureEvent.LANE_RIGHT]);
    expect(detector.currentLane).toBe(1);
  });

  it('triggers JUMP with velocity gating and respects cooldown', () => {
    for (let i = 0; i <= 65; i++) {
      detector.processFrame(createDummyFrame(i / 30, 0.5, 0.5, 0.2));
    }

    // Upward motion: y decreases. Base y = 0.5. baseSw = 0.2
    // dy = (baseY - y) / baseSw
    // Frame at t=2.5: center_y = 0.5 (dy = 0)
    detector.processFrame(createDummyFrame(2.5, 0.5, 0.5, 0.2));

    // Jump upward fast: at t=2.55 (dt=0.05), center_y = 0.43
    // dy = (0.5 - 0.43) / 0.2 = 0.35 >= 0.22
    // vel_y = (0.35 - 0) / 0.05 = 7.0 >= 0.60
    let evs = detector.processFrame(createDummyFrame(2.55, 0.5, 0.43, 0.2));
    expect(evs).toEqual([GestureEvent.JUMP]);

    // Second jump inside cooldown (0.5s) must be debounced
    evs = detector.processFrame(createDummyFrame(2.7, 0.5, 0.43, 0.2));
    expect(evs).not.toContain(GestureEvent.JUMP);

    // Return to baseline
    detector.processFrame(createDummyFrame(3.0, 0.5, 0.5, 0.2));

    // After cooldown (> 0.5s, at t=3.15), jump again
    evs = detector.processFrame(createDummyFrame(3.15, 0.5, 0.43, 0.2));
    expect(evs).toEqual([GestureEvent.JUMP]);
  });

  it('triggers DUCK with velocity gating and respects cooldown', () => {
    for (let i = 0; i <= 65; i++) {
      detector.processFrame(createDummyFrame(i / 30, 0.5, 0.5, 0.2));
    }

    detector.processFrame(createDummyFrame(2.5, 0.5, 0.5, 0.2));

    // Duck downward fast: at t=2.55 (dt=0.05), center_y = 0.57
    // dy = (0.5 - 0.57) / 0.2 = -0.35 <= -0.22
    // vel_y = (-0.35 - 0) / 0.05 = -7.0 <= -0.60
    let evs = detector.processFrame(createDummyFrame(2.55, 0.5, 0.57, 0.2));
    expect(evs).toEqual([GestureEvent.DUCK]);

    // Rapid duck inside cooldown
    evs = detector.processFrame(createDummyFrame(2.7, 0.5, 0.57, 0.2));
    expect(evs).not.toContain(GestureEvent.DUCK);
  });

  it('triggers HOVERBOARD on wrist hold and prevents re-trigger until released & cooldown expired', () => {
    for (let i = 0; i <= 65; i++) {
      detector.processFrame(createDummyFrame(i / 30, 0.5, 0.5, 0.2));
    }

    // Baseline sw = 0.2. Hoverboard thresh = 0.45 * 0.2 = 0.09.
    // Wrists close together: distance = 0.04 < 0.09
    const leftW: Landmark = { x: 0.51, y: 0.5, visibility: 1.0 };
    const rightW: Landmark = { x: 0.49, y: 0.5, visibility: 1.0 };

    // Initial touch at t=2.5
    let evs = detector.processFrame(createDummyFrame(2.5, 0.5, 0.5, 0.2, leftW, rightW));
    expect(evs).toEqual([]);

    // Touch held for 0.2s (t=2.7) -> under 0.30s threshold
    evs = detector.processFrame(createDummyFrame(2.7, 0.5, 0.5, 0.2, leftW, rightW));
    expect(evs).toEqual([]);

    // Touch held for 0.35s (t=2.85) -> triggers HOVERBOARD
    evs = detector.processFrame(createDummyFrame(2.85, 0.5, 0.5, 0.2, leftW, rightW));
    expect(evs).toEqual([GestureEvent.HOVERBOARD]);

    // Continued hold does not trigger duplicate events
    evs = detector.processFrame(createDummyFrame(3.0, 0.5, 0.5, 0.2, leftW, rightW));
    expect(evs).toEqual([]);
  });

  it('ignores frames with visibility < min_visibility', () => {
    for (let i = 0; i <= 65; i++) {
      detector.processFrame(createDummyFrame(i / 30, 0.5, 0.5, 0.2));
    }

    // Invalid frame with visibility 0.2
    const evs = detector.processFrame(createDummyFrame(2.5, 0.2, 0.5, 0.2, undefined, undefined, 0.2));
    expect(evs).toEqual([]);
  });

  it('evaluates distance status and guidance message properly', () => {
    expect(detector.lastDistanceStatus).toBe(DistanceStatus.UNKNOWN);
    expect(detector.distanceGuidanceMessage).toBe('NO PERSON DETECTED');

    // Null frame
    expect(detector.getDistanceStatus(null)).toBe(DistanceStatus.UNKNOWN);

    // Invalid visibility
    const invFrame = createDummyFrame(1.0, 0.5, 0.5, 0.2, undefined, undefined, 0.2);
    expect(detector.getDistanceStatus(invFrame)).toBe(DistanceStatus.UNKNOWN);

    // Too far (< 0.14)
    const farFrame = createDummyFrame(1.0, 0.5, 0.5, 0.10);
    expect(detector.getDistanceStatus(farFrame)).toBe(DistanceStatus.TOO_FAR);

    // Too close (> 0.45)
    const closeFrame = createDummyFrame(1.0, 0.5, 0.5, 0.50);
    expect(detector.getDistanceStatus(closeFrame)).toBe(DistanceStatus.TOO_CLOSE);

    // Optimal
    const optFrame = createDummyFrame(1.0, 0.5, 0.5, 0.25);
    expect(detector.getDistanceStatus(optFrame)).toBe(DistanceStatus.OPTIMAL);

    // Messages updated on frame process
    detector.processFrame(closeFrame);
    expect(detector.lastDistanceStatus).toBe(DistanceStatus.TOO_CLOSE);
    expect(detector.distanceGuidanceMessage).toBe('STEP BACK - TOO CLOSE');

    detector.processFrame(farFrame);
    expect(detector.lastDistanceStatus).toBe(DistanceStatus.TOO_FAR);
    expect(detector.distanceGuidanceMessage).toBe('STEP CLOSER - TOO FAR');

    detector.processFrame(optFrame);
    expect(detector.lastDistanceStatus).toBe(DistanceStatus.OPTIMAL);
    expect(detector.distanceGuidanceMessage).toBe('DISTANCE OK');
  });

  it('gates calibration on optimal distance', () => {
    expect(detector.state).toBe(DetectorState.CALIBRATING);
    expect(detector.calibrationProgress).toBe(0.0);

    // Feed TOO_CLOSE frames for 3s
    for (let i = 0; i <= 30; i++) {
      detector.processFrame(createDummyFrame(i * 0.1, 0.5, 0.5, 0.50));
      expect(detector.state).toBe(DetectorState.CALIBRATING);
      expect(detector.calibrationProgress).toBe(0.0);
    }

    // Feed 1s of OPTIMAL frames
    for (let i = 0; i <= 10; i++) {
      detector.processFrame(createDummyFrame(3.0 + i * 0.1, 0.5, 0.5, 0.20));
    }
    expect(detector.state).toBe(DetectorState.CALIBRATING);
    expect(detector.calibrationProgress).toBeGreaterThanOrEqual(0.45);
    expect(detector.calibrationProgress).toBeLessThanOrEqual(0.55);

    // Pause due to distance for 5 seconds
    const progBefore = detector.calibrationProgress;
    for (let i = 0; i <= 50; i++) {
      detector.processFrame(createDummyFrame(4.1 + i * 0.1, 0.5, 0.5, 0.08));
      expect(detector.calibrationProgress).toBe(progBefore);
    }

    // Resume with optimal frames until calibrated
    for (let i = 0; i <= 12; i++) {
      detector.processFrame(createDummyFrame(9.2 + i * 0.1, 0.5, 0.5, 0.20));
    }
    expect(detector.state).toBe(DetectorState.ACTIVE);
    expect(detector.calibrationProgress).toBe(1.0);
  });

  it('handles speed multiplier scaling of velocity thresholds and cooldowns', () => {
    expect(detector.speedMultiplier).toBe(1.0);
    expect(detector.jumpVelThresh).toBe(detector.baseJumpVelThresh);
    expect(detector.duckVelThresh).toBe(detector.baseDuckVelThresh);
    expect(detector.jumpCooldownSec).toBe(detector.baseJumpCooldownSec);

    detector.setSpeedMultiplier(1.5);
    expect(detector.speedMultiplier).toBe(1.5);
    expect(detector.jumpVelThresh).toBeCloseTo(0.60 * 1.5, 4);
    expect(detector.duckVelThresh).toBeCloseTo(-0.60 * 1.5, 4);
    expect(detector.jumpCooldownSec).toBeCloseTo(0.50 / 1.5, 4);

    // Clamping
    detector.setSpeedMultiplier(0.1);
    expect(detector.speedMultiplier).toBe(0.5);
    expect(detector.jumpVelThresh).toBeCloseTo(0.60 * 0.5, 4);

    detector.setSpeedMultiplier(4.0);
    expect(detector.speedMultiplier).toBe(2.5);
    expect(detector.jumpVelThresh).toBeCloseTo(0.60 * 2.5, 4);
  });

  it('resets lane state with resetLane()', () => {
    detector.currentLane = 1;
    detector.resetLane();
    expect(detector.currentLane).toBe(0);

    detector.currentLane = -1;
    detector.resetLane();
    expect(detector.currentLane).toBe(0);
  });

  it('ignores frames when paused and restores on resume', () => {
    detector.state = DetectorState.ACTIVE;
    detector.pause();
    expect(detector.state).toBe(DetectorState.PAUSED);

    const frame = createDummyFrame(10.0, 0.8, 0.5, 0.20);
    const events = detector.processFrame(frame);
    expect(events).toEqual([]);

    detector.resume();
    expect(detector.state).toBe(DetectorState.ACTIVE);
  });
});
