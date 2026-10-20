/**
 * Landmark and Frame data structures for IRLSurfer Web Runtime.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface LandmarkDict {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface FrameDict {
  timestamp: number;
  left_shoulder: LandmarkDict;
  right_shoulder: LandmarkDict;
  left_hip: LandmarkDict;
  right_hip: LandmarkDict;
  left_wrist: LandmarkDict;
  right_wrist: LandmarkDict;
  nose?: LandmarkDict | null;
}

export class Frame {
  readonly timestamp: number;
  readonly leftShoulder: Landmark;
  readonly rightShoulder: Landmark;
  readonly leftHip: Landmark;
  readonly rightHip: Landmark;
  readonly leftWrist: Landmark;
  readonly rightWrist: Landmark;
  readonly nose: Landmark | null;

  constructor(
    timestamp: number,
    leftShoulder: Landmark,
    rightShoulder: Landmark,
    leftHip: Landmark,
    rightHip: Landmark,
    leftWrist: Landmark,
    rightWrist: Landmark,
    nose: Landmark | null = null,
  ) {
    this.timestamp = timestamp;
    this.leftShoulder = leftShoulder;
    this.rightShoulder = rightShoulder;
    this.leftHip = leftHip;
    this.rightHip = rightHip;
    this.leftWrist = leftWrist;
    this.rightWrist = rightWrist;
    this.nose = nose;
  }

  /**
   * 2D Euclidean distance between left and right shoulders.
   */
  get shoulderWidth(): number {
    return Math.hypot(
      this.leftShoulder.x - this.rightShoulder.x,
      this.leftShoulder.y - this.rightShoulder.y,
    );
  }

  /**
   * Average x coordinate of shoulders and hips.
   */
  get centerX(): number {
    return (
      (this.leftShoulder.x +
        this.rightShoulder.x +
        this.leftHip.x +
        this.rightHip.x) /
      4.0
    );
  }

  /**
   * Average y coordinate of shoulders and hips.
   */
  get centerY(): number {
    return (
      (this.leftShoulder.y +
        this.rightShoulder.y +
        this.leftHip.y +
        this.rightHip.y) /
      4.0
    );
  }

  /**
   * Check if essential torso landmarks meet visibility threshold and geometry is valid.
   */
  isValid(minVisibility = 0.5): boolean {
    const coreLandmarks = [
      this.leftShoulder,
      this.rightShoulder,
      this.leftHip,
      this.rightHip,
    ];
    return (
      coreLandmarks.every((lm) => (lm.visibility ?? 1.0) >= minVisibility) &&
      this.shoulderWidth > 1e-4
    );
  }

  /**
   * Create a Frame instance from a dictionary representation.
   */
  static fromDict(data: FrameDict): Frame {
    const toLandmark = (raw: LandmarkDict): Landmark => ({
      x: Number(raw.x),
      y: Number(raw.y),
      z: Number(raw.z ?? 0.0),
      visibility: Number(raw.visibility ?? 1.0),
    });

    return new Frame(
      Number(data.timestamp),
      toLandmark(data.left_shoulder),
      toLandmark(data.right_shoulder),
      toLandmark(data.left_hip),
      toLandmark(data.right_hip),
      toLandmark(data.left_wrist),
      toLandmark(data.right_wrist),
      data.nose ? toLandmark(data.nose) : null,
    );
  }

  /**
   * Create a Frame instance from MediaPipe Pose landmarks list.
   *
   * MediaPipe Pose indices:
   * 0: NOSE
   * 11: LEFT_SHOULDER
   * 12: RIGHT_SHOULDER
   * 15: LEFT_WRIST
   * 16: RIGHT_WRIST
   * 23: LEFT_HIP
   * 24: RIGHT_HIP
   */
  static fromMediaPipe(rawLandmarks: Landmark[], timestamp: number): Frame {
    const getLm = (idx: number): Landmark => {
      const item = rawLandmarks[idx];
      if (!item) {
        return { x: 0, y: 0, z: 0, visibility: 0 };
      }
      return {
        x: Number(item.x),
        y: Number(item.y),
        z: Number(item.z ?? 0.0),
        visibility: Number(item.visibility ?? 1.0),
      };
    };

    return new Frame(
      timestamp,
      getLm(11),
      getLm(12),
      getLm(23),
      getLm(24),
      getLm(15),
      getLm(16),
      rawLandmarks.length > 0 ? getLm(0) : null,
    );
  }
}
