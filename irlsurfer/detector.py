"""Pure state machine gesture detector for IRLSurfer."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

from irlsurfer.landmarks import Frame


class GestureEvent(StrEnum):
    """Gesture events emitted by the detector."""

    LANE_LEFT = "LANE_LEFT"
    LANE_RIGHT = "LANE_RIGHT"
    JUMP = "JUMP"
    DUCK = "DUCK"
    HOVERBOARD = "HOVERBOARD"


class DetectorState(StrEnum):
    """Detector operating states."""

    CALIBRATING = "CALIBRATING"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"


@dataclass(slots=True)
class GestureConfig:
    """Configuration parameters for gesture detection."""

    calibration_seconds: float = 2.0
    enter_lane_thresh: float = 0.6
    exit_lane_thresh: float = 0.4
    jump_dy_thresh: float = 0.22
    jump_vel_thresh: float = 0.60
    jump_cooldown_sec: float = 0.50
    duck_dy_thresh: float = -0.22
    duck_vel_thresh: float = -0.60
    duck_cooldown_sec: float = 0.50
    hoverboard_dist_thresh: float = 0.45
    hoverboard_hold_sec: float = 0.30
    hoverboard_cooldown_sec: float = 3.0
    recenter_alpha: float = 0.05
    min_visibility: float = 0.50

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> GestureConfig:
        """Create config from dictionary."""
        return cls(
            calibration_seconds=float(data.get("calibration_seconds", 2.0)),
            enter_lane_thresh=float(data.get("enter_lane_thresh", 0.6)),
            exit_lane_thresh=float(data.get("exit_lane_thresh", 0.4)),
            jump_dy_thresh=float(data.get("jump_dy_thresh", 0.22)),
            jump_vel_thresh=float(data.get("jump_vel_thresh", 0.60)),
            jump_cooldown_sec=float(data.get("jump_cooldown_sec", 0.50)),
            duck_dy_thresh=float(data.get("duck_dy_thresh", -0.22)),
            duck_vel_thresh=float(data.get("duck_vel_thresh", -0.60)),
            duck_cooldown_sec=float(data.get("duck_cooldown_sec", 0.50)),
            hoverboard_dist_thresh=float(data.get("hoverboard_dist_thresh", 0.45)),
            hoverboard_hold_sec=float(data.get("hoverboard_hold_sec", 0.30)),
            hoverboard_cooldown_sec=float(data.get("hoverboard_cooldown_sec", 3.0)),
            recenter_alpha=float(data.get("recenter_alpha", 0.05)),
            min_visibility=float(data.get("min_visibility", 0.50)),
        )

    @classmethod
    def from_json_file(cls, path: str | Path) -> GestureConfig:
        """Load configuration from JSON file."""
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return cls.from_dict(data)


class GestureDetector:
    """Pure state machine gesture detector.

    Decoupled from camera and input simulation.
    Processes Frame data structures and outputs lists of GestureEvents.
    """

    def __init__(self, config: GestureConfig | dict[str, Any] | None = None) -> None:
        if config is None:
            self.config = GestureConfig()
        elif isinstance(config, dict):
            self.config = GestureConfig.from_dict(config)
        else:
            self.config = config

        self.state: DetectorState = DetectorState.CALIBRATING
        self._previous_state: DetectorState = DetectorState.CALIBRATING

        # Baseline calibration values
        self.base_x: float = 0.5
        self.base_y: float = 0.5
        self.base_sw: float = 0.2

        # Calibration accumulation
        self._calib_start_time: float | None = None
        self._calib_x_samples: list[float] = []
        self._calib_y_samples: list[float] = []
        self._calib_sw_samples: list[float] = []

        # Tracking state
        self.current_lane: int = 0  # -1: left, 0: center, +1: right
        self.last_dy: float = 0.0
        self.last_vel_y: float = 0.0
        self._last_timestamp: float | None = None

        # Cooldown & hold timers
        self._last_jump_time: float = -1e9
        self._last_duck_time: float = -1e9
        self._last_hoverboard_time: float = -1e9
        self._wrist_touch_start_time: float | None = None
        self._hoverboard_fired_for_touch: bool = False

    def pause(self) -> None:
        """Pause gesture processing."""
        if self.state != DetectorState.PAUSED:
            self._previous_state = self.state
            self.state = DetectorState.PAUSED

    def resume(self) -> None:
        """Resume gesture processing from pause."""
        if self.state == DetectorState.PAUSED:
            self.state = self._previous_state

    def recalibrate(self) -> None:
        """Trigger re-calibration."""
        self.state = DetectorState.CALIBRATING
        self._calib_start_time = None
        self._calib_x_samples.clear()
        self._calib_y_samples.clear()
        self._calib_sw_samples.clear()
        self.current_lane = 0
        self._wrist_touch_start_time = None
        self._hoverboard_fired_for_touch = False

    def process_frame(self, frame: Frame) -> list[GestureEvent]:
        """Process a single frame and emit detected gestures."""
        if self.state == DetectorState.PAUSED:
            return []

        # Validate landmark visibility and torso integrity
        if not frame.is_valid(self.config.min_visibility):
            self._wrist_touch_start_time = None
            self._hoverboard_fired_for_touch = False
            return []

        # Mirror horizontal coordinate: physical step right moves right
        mirrored_x = 1.0 - frame.center_x
        raw_y = frame.center_y
        raw_sw = frame.shoulder_width

        if self.state == DetectorState.CALIBRATING:
            return self._handle_calibration(mirrored_x, raw_y, raw_sw, frame.timestamp)

        return self._handle_active(frame, mirrored_x, raw_y, frame.timestamp)

    def _handle_calibration(
        self,
        mirrored_x: float,
        raw_y: float,
        raw_sw: float,
        timestamp: float,
    ) -> list[GestureEvent]:
        if self._calib_start_time is None:
            self._calib_start_time = timestamp

        self._calib_x_samples.append(mirrored_x)
        self._calib_y_samples.append(raw_y)
        self._calib_sw_samples.append(raw_sw)

        elapsed = timestamp - self._calib_start_time
        if elapsed >= self.config.calibration_seconds and len(self._calib_x_samples) >= 2:
            self.base_x = sum(self._calib_x_samples) / len(self._calib_x_samples)
            self.base_y = sum(self._calib_y_samples) / len(self._calib_y_samples)
            self.base_sw = sum(self._calib_sw_samples) / len(self._calib_sw_samples)
            if self.base_sw <= 1e-4:
                self.base_sw = 0.2

            self.current_lane = 0
            self.last_dy = 0.0
            self.last_vel_y = 0.0
            self._last_timestamp = timestamp
            self.state = DetectorState.ACTIVE

        return []

    def _handle_active(
        self,
        frame: Frame,
        mirrored_x: float,
        raw_y: float,
        timestamp: float,
    ) -> list[GestureEvent]:
        events: list[GestureEvent] = []

        # Displacements normalized by baseline shoulder width
        dx = (mirrored_x - self.base_x) / self.base_sw
        # Upward motion: y decreases, so base_y - raw_y > 0 (jump)
        # Downward motion: y increases, so base_y - raw_y < 0 (duck)
        dy = (self.base_y - raw_y) / self.base_sw

        # Compute vertical velocity
        dt = timestamp - self._last_timestamp if self._last_timestamp is not None else 0.0
        if dt > 1e-4:
            vel_y = (dy - self.last_dy) / dt
        else:
            vel_y = 0.0

        self.last_dy = dy
        self.last_vel_y = vel_y
        self._last_timestamp = timestamp

        # 1. Lane detection with hysteresis
        lane_events = self._update_lane(dx)
        events.extend(lane_events)

        # 2. Jump detection
        if (
            dy >= self.config.jump_dy_thresh
            and vel_y >= self.config.jump_vel_thresh
            and (timestamp - self._last_jump_time) >= self.config.jump_cooldown_sec
        ):
            events.append(GestureEvent.JUMP)
            self._last_jump_time = timestamp

        # 3. Duck detection
        elif (
            dy <= self.config.duck_dy_thresh
            and vel_y <= self.config.duck_vel_thresh
            and (timestamp - self._last_duck_time) >= self.config.duck_cooldown_sec
        ):
            events.append(GestureEvent.DUCK)
            self._last_duck_time = timestamp

        # 4. Hoverboard detection (wrists together hold)
        hoverboard_event = self._check_hoverboard(frame, timestamp)
        if hoverboard_event is not None:
            events.append(hoverboard_event)

        # 5. Dynamic recenter: slow baseline drift when stationary in center lane
        is_idle_in_center = (
            self.current_lane == 0
            and abs(dx) < self.config.exit_lane_thresh
            and abs(dy) < self.config.jump_dy_thresh * 0.5
            and abs(vel_y) < self.config.jump_vel_thresh * 0.5
        )
        if is_idle_in_center:
            alpha = self.config.recenter_alpha
            self.base_x = (1.0 - alpha) * self.base_x + alpha * mirrored_x
            self.base_y = (1.0 - alpha) * self.base_y + alpha * raw_y

        return events

    def _update_lane(self, dx: float) -> list[GestureEvent]:
        """Update lane state with hysteresis and return lane navigation events."""
        events: list[GestureEvent] = []

        if self.current_lane == 0:
            if dx >= self.config.enter_lane_thresh:
                self.current_lane = 1
                events.append(GestureEvent.LANE_RIGHT)
            elif dx <= -self.config.enter_lane_thresh:
                self.current_lane = -1
                events.append(GestureEvent.LANE_LEFT)

        elif self.current_lane == 1:
            if dx <= self.config.exit_lane_thresh:
                if dx <= -self.config.enter_lane_thresh:
                    # Crossed from right lane all the way to left lane
                    self.current_lane = -1
                    events.append(GestureEvent.LANE_LEFT)
                    events.append(GestureEvent.LANE_LEFT)
                else:
                    self.current_lane = 0
                    events.append(GestureEvent.LANE_LEFT)

        elif self.current_lane == -1:
            if dx >= -self.config.exit_lane_thresh:
                if dx >= self.config.enter_lane_thresh:
                    # Crossed from left lane all the way to right lane
                    self.current_lane = 1
                    events.append(GestureEvent.LANE_RIGHT)
                    events.append(GestureEvent.LANE_RIGHT)
                else:
                    self.current_lane = 0
                    events.append(GestureEvent.LANE_RIGHT)

        return events

    def _check_hoverboard(self, frame: Frame, timestamp: float) -> GestureEvent | None:
        """Check if wrists are touching and held for hoverboard activation."""
        min_vis = self.config.min_visibility
        if frame.left_wrist.visibility < min_vis or frame.right_wrist.visibility < min_vis:
            self._wrist_touch_start_time = None
            self._hoverboard_fired_for_touch = False
            return None

        dist = math.hypot(
            frame.left_wrist.x - frame.right_wrist.x,
            frame.left_wrist.y - frame.right_wrist.y,
        )
        threshold = self.config.hoverboard_dist_thresh * self.base_sw

        if dist <= threshold:
            if self._wrist_touch_start_time is None:
                self._wrist_touch_start_time = timestamp

            hold_time = timestamp - self._wrist_touch_start_time
            cooldown_ok = (
                timestamp - self._last_hoverboard_time
            ) >= self.config.hoverboard_cooldown_sec

            if (
                hold_time >= self.config.hoverboard_hold_sec
                and not self._hoverboard_fired_for_touch
                and cooldown_ok
            ):
                self._last_hoverboard_time = timestamp
                self._hoverboard_fired_for_touch = True
                return GestureEvent.HOVERBOARD
        else:
            self._wrist_touch_start_time = None
            self._hoverboard_fired_for_touch = False

        return None
