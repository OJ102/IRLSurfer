"""Unit tests for OpenCV Debug HUD overlay."""

from __future__ import annotations

import numpy as np

from irlsurfer.detector import (
    DetectorState,
    DistanceStatus,
    GestureConfig,
    GestureDetector,
    GestureEvent,
)
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


def test_debug_hud_distance_badges_and_alerts() -> None:
    hud = DebugHUD(mirror=True)
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    # 1. Calibrating with TOO_CLOSE distance
    detector_close = GestureDetector()
    close_frame = Frame(
        timestamp=0.5,
        left_shoulder=Landmark(x=0.2, y=0.3, visibility=0.9),
        right_shoulder=Landmark(x=0.8, y=0.3, visibility=0.9),  # sw = 0.60 > 0.45
        left_hip=Landmark(x=0.25, y=0.6, visibility=0.9),
        right_hip=Landmark(x=0.75, y=0.6, visibility=0.9),
        left_wrist=Landmark(x=0.45, y=0.5, visibility=0.9),
        right_wrist=Landmark(x=0.55, y=0.5, visibility=0.9),
    )
    detector_close.process_frame(close_frame)
    assert detector_close.last_distance_status == DistanceStatus.TOO_CLOSE

    out_close = hud.render(img, close_frame, detector_close, fps=30.0, latency_ms=10.0)
    assert out_close.shape == (480, 640, 3)
    # Ensure overlay notice modified pixels
    assert np.any(out_close > 0)

    # 2. Calibrating with TOO_FAR distance
    detector_far = GestureDetector()
    far_frame = Frame(
        timestamp=0.5,
        left_shoulder=Landmark(x=0.46, y=0.3, visibility=0.9),
        right_shoulder=Landmark(x=0.54, y=0.3, visibility=0.9),  # sw = 0.08 < 0.14
        left_hip=Landmark(x=0.47, y=0.6, visibility=0.9),
        right_hip=Landmark(x=0.53, y=0.6, visibility=0.9),
        left_wrist=Landmark(x=0.49, y=0.5, visibility=0.9),
        right_wrist=Landmark(x=0.51, y=0.5, visibility=0.9),
    )
    detector_far.process_frame(far_frame)
    assert detector_far.last_distance_status == DistanceStatus.TOO_FAR

    out_far = hud.render(img, far_frame, detector_far, fps=30.0, latency_ms=10.0)
    assert out_far.shape == (480, 640, 3)
    assert np.any(out_far > 0)

    # 3. Active with OPTIMAL distance
    detector_opt = GestureDetector(GestureConfig(calibration_seconds=0.01))
    opt_frame = _make_sample_frame(0.1)
    detector_opt.process_frame(_make_sample_frame(0.0))
    detector_opt.process_frame(opt_frame)
    assert detector_opt.state == DetectorState.ACTIVE
    assert detector_opt.last_distance_status == DistanceStatus.OPTIMAL

    out_opt = hud.render(img, opt_frame, detector_opt, fps=60.0, latency_ms=5.0)
    assert out_opt.shape == (480, 640, 3)
    assert np.any(out_opt > 0)


def test_debug_hud_speed_multiplier_badge() -> None:
    hud = DebugHUD(mirror=True)
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    detector_default = GestureDetector(GestureConfig(calibration_seconds=0.01))
    detector_default.process_frame(_make_sample_frame(0.0))
    detector_default.process_frame(_make_sample_frame(0.1))
    assert detector_default.speed_multiplier == 1.0

    out_1x = hud.render(img, _make_sample_frame(0.2), detector_default, fps=30.0, latency_ms=10.0)
    assert out_1x.shape == (480, 640, 3)

    # Change to 2.0x speed
    detector_turbo = GestureDetector(GestureConfig(calibration_seconds=0.01))
    detector_turbo.process_frame(_make_sample_frame(0.0))
    detector_turbo.process_frame(_make_sample_frame(0.1))
    detector_turbo.set_speed_multiplier(2.0)
    assert detector_turbo.speed_multiplier == 2.0

    out_2x = hud.render(img, _make_sample_frame(0.2), detector_turbo, fps=30.0, latency_ms=10.0)
    assert out_2x.shape == (480, 640, 3)

    # Change to 0.5x speed
    detector_slow = GestureDetector(GestureConfig(calibration_seconds=0.01))
    detector_slow.process_frame(_make_sample_frame(0.0))
    detector_slow.process_frame(_make_sample_frame(0.1))
    detector_slow.set_speed_multiplier(0.5)

    out_half = hud.render(img, _make_sample_frame(0.2), detector_slow, fps=30.0, latency_ms=10.0)
    assert out_half.shape == (480, 640, 3)

    # The header area (top 42 rows) should differ when speed badge text changes from 1.0x to 2.0x
    header_diff = np.abs(out_1x[:42, :].astype(int) - out_2x[:42, :].astype(int))
    assert np.sum(header_diff) > 0
