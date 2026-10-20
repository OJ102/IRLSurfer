"""Landmark and Frame data structures for IRLSurfer."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class Landmark:
    """Represents a single 2D/3D body landmark with visibility."""

    x: float
    y: float
    z: float = 0.0
    visibility: float = 1.0


@dataclass(slots=True)
class Frame:
    """Represents key pose landmarks extracted for a single video frame."""

    timestamp: float
    left_shoulder: Landmark
    right_shoulder: Landmark
    left_hip: Landmark
    right_hip: Landmark
    left_wrist: Landmark
    right_wrist: Landmark
    nose: Landmark | None = None

    @property
    def shoulder_width(self) -> float:
        """2D Euclidean distance between left and right shoulders."""
        return math.hypot(
            self.left_shoulder.x - self.right_shoulder.x,
            self.left_shoulder.y - self.right_shoulder.y,
        )

    @property
    def center_x(self) -> float:
        """Average x coordinate of shoulders and hips."""
        return (
            self.left_shoulder.x + self.right_shoulder.x + self.left_hip.x + self.right_hip.x
        ) / 4.0

    @property
    def center_y(self) -> float:
        """Average y coordinate of shoulders and hips."""
        return (
            self.left_shoulder.y + self.right_shoulder.y + self.left_hip.y + self.right_hip.y
        ) / 4.0

    def is_valid(self, min_visibility: float = 0.5) -> bool:
        """Check if essential torso landmarks meet visibility threshold and geometry is valid."""
        core_landmarks = (
            self.left_shoulder,
            self.right_shoulder,
            self.left_hip,
            self.right_hip,
        )
        return (
            all(lm.visibility >= min_visibility for lm in core_landmarks)
            and self.shoulder_width > 1e-4
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Frame:
        """Create a Frame instance from a dictionary."""

        def _to_landmark(raw: Any) -> Landmark:
            if isinstance(raw, Landmark):
                return raw
            if isinstance(raw, dict):
                return Landmark(
                    x=float(raw["x"]),
                    y=float(raw["y"]),
                    z=float(raw.get("z", 0.0)),
                    visibility=float(raw.get("visibility", 1.0)),
                )
            return Landmark(
                x=float(getattr(raw, "x", 0.0)),
                y=float(getattr(raw, "y", 0.0)),
                z=float(getattr(raw, "z", 0.0)),
                visibility=float(getattr(raw, "visibility", 1.0)),
            )

        nose_raw = data.get("nose")
        return cls(
            timestamp=float(data["timestamp"]),
            left_shoulder=_to_landmark(data["left_shoulder"]),
            right_shoulder=_to_landmark(data["right_shoulder"]),
            left_hip=_to_landmark(data["left_hip"]),
            right_hip=_to_landmark(data["right_hip"]),
            left_wrist=_to_landmark(data["left_wrist"]),
            right_wrist=_to_landmark(data["right_wrist"]),
            nose=_to_landmark(nose_raw) if nose_raw is not None else None,
        )

    @classmethod
    def from_mediapipe(cls, raw_landmarks: Any, timestamp: float) -> Frame:
        """Create a Frame instance from MediaPipe Pose landmarks list.

        MediaPipe Pose indices:
        0: NOSE
        11: LEFT_SHOULDER
        12: RIGHT_SHOULDER
        15: LEFT_WRIST
        16: RIGHT_WRIST
        23: LEFT_HIP
        24: RIGHT_HIP
        """

        def _get_lm(idx: int) -> Landmark:
            item = raw_landmarks[idx]
            if isinstance(item, Landmark):
                return item
            if isinstance(item, dict):
                return Landmark(
                    x=float(item["x"]),
                    y=float(item["y"]),
                    z=float(item.get("z", 0.0)),
                    visibility=float(item.get("visibility", 1.0)),
                )
            return Landmark(
                x=float(getattr(item, "x", 0.0)),
                y=float(getattr(item, "y", 0.0)),
                z=float(getattr(item, "z", 0.0)),
                visibility=float(getattr(item, "visibility", 1.0)),
            )

        nose = _get_lm(0) if len(raw_landmarks) > 0 else None
        return cls(
            timestamp=float(timestamp),
            left_shoulder=_get_lm(11),
            right_shoulder=_get_lm(12),
            left_hip=_get_lm(23),
            right_hip=_get_lm(24),
            left_wrist=_get_lm(15),
            right_wrist=_get_lm(16),
            nose=nose,
        )
