"""Unit tests for OpenCV Debug HUD overlay."""

from __future__ import annotations

import numpy as np

from irlsurfer.detector import DetectorState, GestureConfig, GestureDetector, GestureEvent
from irlsurfer.landmarks import Frame, Landmark
from irlsurfer.overlay import DebugHUD


def _make_sample_frame(timestamp: float = 1.0) -> Frame:
    return Frame(
        timestamp=timestamp,
        left_shoulder=Landmark(x=0.4, y=0.3, visibility=0.9),
        right_shoulder=Landmark(x=0.6, y=0.3, visibility=0.9),
        left_hip=Landmark(x=0.45, y=0.6, visibility=0.9),
        right_hip=Landmark(x=0.55, y=0.6, visibility=0.9),
        left_wrist=Landmark(x=0.48, y=0.5, visibility=0.9),
        right_wrist=Landmark(x=0.52, y=0.5, visibility=0.9),
        nose=Landmark(x=0.5, y=0.2, visibility=0.9),
    )


def test_debug_hud_render_shape_and_dtype() -> None:
    hud = DebugHUD(mirror=True)
    detector = GestureDetector(GestureConfig())
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    frame = _make_sample_frame()

    annotated = hud.render(
        image_bgr=img,
        frame_data=frame,
        detector=detector,
        fps=30.0,
        latency_ms=12.5,
        is_paused=False,
    )

    assert annotated.shape == (480, 640, 3)
    assert annotated.dtype == np.uint8
    # Ensure source image was not mutated in place
    assert img.sum() == 0


def test_debug_hud_render_without_pose() -> None:
    hud = DebugHUD(mirror=True)
    detector = GestureDetector(GestureConfig())
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    annotated = hud.render(
        image_bgr=img,
        frame_data=None,
        detector=detector,
        fps=25.0,
        latency_ms=15.0,
    )
    assert annotated.shape == (480, 640, 3)
    assert annotated.dtype == np.uint8


def test_debug_hud_calibrating_overlay() -> None:
    hud = DebugHUD(mirror=True)
    detector = GestureDetector(GestureConfig(calibration_seconds=2.0))
    img = np.zeros((200, 300, 3), dtype=np.uint8)
    frame = _make_sample_frame(timestamp=0.5)

    detector.process_frame(frame)
    assert detector.state == DetectorState.CALIBRATING

    annotated = hud.render(
        image_bgr=img,
        frame_data=frame,
        detector=detector,
        fps=30.0,
        latency_ms=10.0,
    )
    assert annotated.shape == (200, 300, 3)


def test_debug_hud_active_and_lane_guidelines() -> None:
    hud = DebugHUD(mirror=True)
    detector = GestureDetector(GestureConfig(calibration_seconds=0.1))
    img = np.zeros((200, 300, 3), dtype=np.uint8)

    # Calibrate to active
    detector.process_frame(_make_sample_frame(timestamp=0.0))
    detector.process_frame(_make_sample_frame(timestamp=0.2))
    assert detector.state == DetectorState.ACTIVE

    annotated = hud.render(
        image_bgr=img,
        frame_data=_make_sample_frame(timestamp=0.3),
        detector=detector,
        fps=60.0,
        latency_ms=8.0,
    )
    assert annotated.shape == (200, 300, 3)


def test_debug_hud_paused_overlay() -> None:
    hud = DebugHUD(mirror=False)
    detector = GestureDetector(GestureConfig())
    detector.pause()
    img = np.zeros((200, 300, 3), dtype=np.uint8)

    annotated = hud.render(
        image_bgr=img,
        frame_data=None,
        detector=detector,
        fps=0.0,
        latency_ms=0.0,
        is_paused=True,
    )
    assert annotated.shape == (200, 300, 3)


def test_debug_hud_recent_gesture_banner() -> None:
    hud = DebugHUD(mirror=True)
    detector = GestureDetector(GestureConfig())
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    hud.add_gesture(GestureEvent.JUMP, timestamp=10.0)
    assert hud.recent_banner is not None
    assert hud.recent_banner.event == GestureEvent.JUMP

    # Within duration (0.8s)
    annotated = hud.render(
        image_bgr=img,
        frame_data=_make_sample_frame(timestamp=10.2),
        detector=detector,
        fps=30.0,
        latency_ms=10.0,
    )
    assert annotated.shape == (480, 640, 3)

    # Beyond duration
    annotated_expired = hud.render(
        image_bgr=img,
        frame_data=_make_sample_frame(timestamp=11.5),
        detector=detector,
        fps=30.0,
        latency_ms=10.0,
    )
    assert annotated_expired.shape == (480, 640, 3)


def test_debug_hud_zero_dimensions() -> None:
    hud = DebugHUD(mirror=True)
    detector = GestureDetector(GestureConfig())
    empty_img = np.zeros((0, 0, 3), dtype=np.uint8)

    annotated = hud.render(
        image_bgr=empty_img,
        frame_data=_make_sample_frame(),
        detector=detector,
        fps=30.0,
        latency_ms=10.0,
    )
    assert annotated.shape == (0, 0, 3)

    # Empty height or width
    empty_h = np.zeros((0, 100, 3), dtype=np.uint8)
    assert hud.render(empty_h, None, detector, 30.0, 10.0).shape == (0, 100, 3)
    empty_w = np.zeros((100, 0, 3), dtype=np.uint8)
    assert hud.render(empty_w, None, detector, 30.0, 10.0).shape == (100, 0, 3)


def test_debug_hud_extreme_bounds_and_nan() -> None:
    hud = DebugHUD(mirror=True)
    detector = GestureDetector(GestureConfig(calibration_seconds=0.01))
    detector.process_frame(_make_sample_frame(0.0))
    detector.process_frame(_make_sample_frame(0.1))
    assert detector.state == DetectorState.ACTIVE

    # Frame with NaN and Inf coordinates
    nan_frame = Frame(
        timestamp=1.0,
        left_shoulder=Landmark(x=float("nan"), y=float("inf")),
        right_shoulder=Landmark(x=-50.0, y=100.0),
        left_hip=Landmark(x=0.45, y=0.6),
        right_hip=Landmark(x=0.55, y=0.6),
        left_wrist=Landmark(x=float("nan"), y=0.5),
        right_wrist=Landmark(x=0.7, y=float("nan")),
    )

    img = np.zeros((20, 20, 3), dtype=np.uint8)  # very small dimensions
    annotated = hud.render(
        image_bgr=img,
        frame_data=nan_frame,
        detector=detector,
        fps=120.0,
        latency_ms=2.0,
    )
    assert annotated.shape == (20, 20, 3)
