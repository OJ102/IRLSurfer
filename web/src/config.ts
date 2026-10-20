/**
 * Gesture configuration schema and defaults for IRLSurfer Web Runtime.
 */

import rawGesturesJson from '../../config/gestures.json';

export interface GestureConfig {
  calibration_seconds: number;
  enter_lane_thresh: number;
  exit_lane_thresh: number;
  jump_dy_thresh: number;
  jump_vel_thresh: number;
  jump_cooldown_sec: number;
  duck_dy_thresh: number;
  duck_vel_thresh: number;
  duck_cooldown_sec: number;
  hoverboard_dist_thresh: number;
  hoverboard_hold_sec: number;
  hoverboard_cooldown_sec: number;
  recenter_alpha: number;
  min_visibility: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  calibration_seconds: Number(rawGesturesJson.calibration_seconds ?? 2.0),
  enter_lane_thresh: Number(rawGesturesJson.enter_lane_thresh ?? 0.6),
  exit_lane_thresh: Number(rawGesturesJson.exit_lane_thresh ?? 0.4),
  jump_dy_thresh: Number(rawGesturesJson.jump_dy_thresh ?? 0.22),
  jump_vel_thresh: Number(rawGesturesJson.jump_vel_thresh ?? 0.60),
  jump_cooldown_sec: Number(rawGesturesJson.jump_cooldown_sec ?? 0.50),
  duck_dy_thresh: Number(rawGesturesJson.duck_dy_thresh ?? -0.22),
  duck_vel_thresh: Number(rawGesturesJson.duck_vel_thresh ?? -0.60),
  duck_cooldown_sec: Number(rawGesturesJson.duck_cooldown_sec ?? 0.50),
  hoverboard_dist_thresh: Number(rawGesturesJson.hoverboard_dist_thresh ?? 0.45),
  hoverboard_hold_sec: Number(rawGesturesJson.hoverboard_hold_sec ?? 0.30),
  hoverboard_cooldown_sec: Number(rawGesturesJson.hoverboard_cooldown_sec ?? 3.0),
  recenter_alpha: Number(rawGesturesJson.recenter_alpha ?? 0.05),
  min_visibility: Number(rawGesturesJson.min_visibility ?? 0.50),
};
