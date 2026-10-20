"""OpenCV Debug HUD for IRLSurfer live feedback."""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from irlsurfer.detector import DetectorState, GestureDetector, GestureEvent
from irlsurfer.landmarks import Frame


@dataclass(slots=True)
class GestureBanner:
    """Recent gesture event to display with fadeout."""

    event: GestureEvent
    timestamp: float
    duration: float = 0.8


class DebugHUD:
    """Renders debug information onto camera frames."""

    def __init__(self, mirror: bool = True) -> None:
        self.mirror = mirror
        self.recent_banner: GestureBanner | None = None

    def add_gesture(self, event: GestureEvent, timestamp: float) -> None:
        """Record gesture event for banner display."""
        self.recent_banner = GestureBanner(event=event, timestamp=timestamp)

    def render(
        self,
        image_bgr: np.ndarray[Any, Any],
        frame_data: Frame | None,
        detector: GestureDetector,
        fps: float,
        latency_ms: float,
        is_paused: bool = False,
    ) -> np.ndarray[Any, Any]:
        """Return annotated BGR image."""
        if image_bgr.size == 0 or image_bgr.shape[0] == 0 or image_bgr.shape[1] == 0:
            return image_bgr.copy()

        out: np.ndarray[Any, Any]
        if self.mirror:
            out = cv2.flip(image_bgr, 1)
        else:
            out = image_bgr.copy()

        h, w = out.shape[:2]
        paused = is_paused or detector.state == DetectorState.PAUSED

        # 1. Vertical lane guideline lines pegged to calibrated base_x
        if detector.state != DetectorState.CALIBRATING:
            self._render_lane_guidelines(out, detector, w, h)

        # 2. Torso center dot and wrist connecting line
        if frame_data is not None:
            self._render_pose(out, frame_data, detector, w, h)

        # 3. Status bar at top
        self._render_status_bar(out, frame_data, detector, fps, latency_ms, paused, w)

        # 4. Recent gesture banner with fadeout
        self._render_gesture_banner(out, frame_data, w, h)

        # 5. Semi-transparent darkened overlay when paused
        if paused:
            self._render_pause_overlay(out, w, h)

        return out

    def _render_lane_guidelines(
        self,
        img: np.ndarray[Any, Any],
        detector: GestureDetector,
        w: int,
        h: int,
    ) -> None:
        base_x = detector.base_x if self.mirror else (1.0 - detector.base_x)
        base_sw = detector.base_sw
        if math.isnan(base_x) or math.isinf(base_x):
            base_x = 0.5
        if math.isnan(base_sw) or math.isinf(base_sw) or base_sw <= 0.0:
            base_sw = 0.2
        thresh = detector.config.enter_lane_thresh * base_sw

        left_bound = int(np.clip(base_x - thresh, 0.0, 1.0) * w)
        right_bound = int(np.clip(base_x + thresh, 0.0, 1.0) * w)
        center_x = int(np.clip(base_x, 0.0, 1.0) * w)

        overlay = img.copy()

        y_top = min(45, max(0, h - 1))
        y_bottom = max(y_top, h - 35)

        # Vertical lane divider lines
        cv2.line(overlay, (left_bound, y_top), (left_bound, y_bottom), (200, 200, 200), 1)
        cv2.line(overlay, (right_bound, y_top), (right_bound, y_bottom), (200, 200, 200), 1)
        cv2.line(overlay, (center_x, y_top), (center_x, y_bottom), (100, 100, 100), 1)

        # Lane text indicators at bottom
        cv2.putText(
            overlay,
            "LEFT",
            (max(10, left_bound // 2 - 20), h - 15),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (180, 180, 180),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            overlay,
            "CENTER",
            (max(10, (left_bound + right_bound) // 2 - 30), h - 15),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (180, 180, 180),
            1,
            cv2.LINE_AA,
        )
        cv2.putText(
            overlay,
            "RIGHT",
            (min(w - 60, (right_bound + w) // 2 - 25), h - 15),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (180, 180, 180),
            1,
            cv2.LINE_AA,
        )

        cv2.addWeighted(overlay, 0.6, img, 0.4, 0, img)

    def _render_pose(
        self,
        img: np.ndarray[Any, Any],
        frame_data: Frame,
        detector: GestureDetector,
        w: int,
        h: int,
    ) -> None:
        def to_xy(x_norm: float, y_norm: float) -> tuple[int, int]:
            if math.isnan(x_norm) or math.isinf(x_norm):
                x_norm = 0.5
            if math.isnan(y_norm) or math.isinf(y_norm):
                y_norm = 0.5
            x_m = (1.0 - x_norm) if self.mirror else x_norm
            return int(np.clip(x_m, 0.0, 1.0) * w), int(np.clip(y_norm, 0.0, 1.0) * h)

        # Torso landmarks (shoulders & hips)
        ls = to_xy(frame_data.left_shoulder.x, frame_data.left_shoulder.y)
        rs = to_xy(frame_data.right_shoulder.x, frame_data.right_shoulder.y)
        lh = to_xy(frame_data.left_hip.x, frame_data.left_hip.y)
        rh = to_xy(frame_data.right_hip.x, frame_data.right_hip.y)

        # Torso outline
        cv2.line(img, ls, rs, (180, 180, 180), 2)
        cv2.line(img, ls, lh, (150, 150, 150), 1)
        cv2.line(img, rs, rh, (150, 150, 150), 1)
        cv2.line(img, lh, rh, (180, 180, 180), 2)

        # Torso center dot
        tc = to_xy(frame_data.center_x, frame_data.center_y)
        cv2.circle(img, tc, 8, (0, 255, 255), -1)
        cv2.circle(img, tc, 9, (0, 0, 0), 2)

        # Wrists
        lw = to_xy(frame_data.left_wrist.x, frame_data.left_wrist.y)
        rw = to_xy(frame_data.right_wrist.x, frame_data.right_wrist.y)

        wrist_dist = math.hypot(
            frame_data.left_wrist.x - frame_data.right_wrist.x,
            frame_data.left_wrist.y - frame_data.right_wrist.y,
        )
        hover_thresh = detector.config.hoverboard_dist_thresh * detector.base_sw
        is_hover = wrist_dist <= hover_thresh

        wrist_color = (0, 255, 0) if is_hover else (0, 200, 255)
        thickness = 3 if is_hover else 1

        cv2.circle(img, lw, 6, wrist_color, -1)
        cv2.circle(img, rw, 6, wrist_color, -1)
        cv2.line(img, lw, rw, wrist_color, thickness)

    def _render_status_bar(
        self,
        img: np.ndarray[Any, Any],
        frame_data: Frame | None,
        detector: GestureDetector,
        fps: float,
        latency_ms: float,
        paused: bool,
        w: int,
    ) -> None:
        # Dark header banner background
        overlay = img.copy()
        cv2.rectangle(overlay, (0, 0), (w, 36), (20, 20, 20), -1)
        cv2.addWeighted(overlay, 0.75, img, 0.25, 0, img)

        # Status badge
        if paused:
            badge_text = "[PAUSED]"
            badge_color = (0, 0, 255)  # Red
        elif detector.state == DetectorState.CALIBRATING:
            if detector._calib_start_time is not None and frame_data is not None:
                elapsed = frame_data.timestamp - detector._calib_start_time
                remain = max(0.0, detector.config.calibration_seconds - elapsed)
                badge_text = f"[CALIBRATING: {remain:.1f}s]"
            else:
                badge_text = f"[CALIBRATING: {detector.config.calibration_seconds:.1f}s]"
            badge_color = (0, 165, 255)  # Orange
        else:
            lane_name = {-1: "LEFT", 0: "CENTER", 1: "RIGHT"}.get(detector.current_lane, "CENTER")
            badge_text = f"[ACTIVE | Lane: {lane_name}]"
            badge_color = (0, 255, 0)  # Neon Green

        cv2.putText(
            img,
            badge_text,
            (12, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            badge_color,
            2,
            cv2.LINE_AA,
        )

        # Performance metrics (FPS and latency)
        perf_text = f"FPS: {fps:.1f} | {latency_ms:.1f} ms"
        (text_w, _), _ = cv2.getTextSize(perf_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
        cv2.putText(
            img,
            perf_text,
            (max(10, w - text_w - 12), 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

    def _render_gesture_banner(
        self,
        img: np.ndarray[Any, Any],
        frame_data: Frame | None,
        w: int,
        h: int,
    ) -> None:
        if self.recent_banner is None:
            return

        if frame_data is not None and frame_data.timestamp >= self.recent_banner.timestamp:
            elapsed = frame_data.timestamp - self.recent_banner.timestamp
        else:
            elapsed = time.time() - self.recent_banner.timestamp

        elapsed = max(0.0, elapsed)
        if elapsed > self.recent_banner.duration:
            return

        alpha = 1.0 - (elapsed / self.recent_banner.duration)
        text = f"{self.recent_banner.event.value}!"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.85
        thickness = 2
        (tw, th), _ = cv2.getTextSize(text, font, font_scale, thickness)

        pad_x, pad_y = 24, 12
        box_w = tw + pad_x * 2
        box_h = th + pad_y * 2
        x1 = (w - box_w) // 2
        y1 = int(h * 0.78)
        x2 = x1 + box_w
        y2 = y1 + box_h

        overlay = img.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), (30, 30, 30), -1)
        cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 255, 255), 2)
        cv2.putText(
            overlay,
            text,
            (x1 + pad_x, y1 + pad_y + th),
            font,
            font_scale,
            (0, 255, 255),
            thickness,
            cv2.LINE_AA,
        )

        effective_alpha = min(1.0, max(0.0, alpha * 0.9))
        cv2.addWeighted(overlay, effective_alpha, img, 1.0 - effective_alpha, 0, img)

    def _render_pause_overlay(self, img: np.ndarray[Any, Any], w: int, h: int) -> None:
        overlay = img.copy()
        cv2.rectangle(overlay, (0, 0), (w, h), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.55, img, 0.45, 0, img)

        # Centered bold pause text
        title = "PAUSED"
        font = cv2.FONT_HERSHEY_SIMPLEX
        (tw, th), _ = cv2.getTextSize(title, font, 1.4, 3)
        cv2.putText(
            img,
            title,
            ((w - tw) // 2, h // 2 - 10),
            font,
            1.4,
            (0, 0, 255),
            3,
            cv2.LINE_AA,
        )

        subtitle = "Press 'p' to Resume | 'c' to Calibrate | 'q' to Quit"
        (stw, _), _ = cv2.getTextSize(subtitle, font, 0.55, 1)
        cv2.putText(
            img,
            subtitle,
            ((w - stw) // 2, h // 2 + 30),
            font,
            0.55,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )
