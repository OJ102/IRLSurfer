"""Comprehensive unit tests for GestureDetector and landmarks."""

from __future__ import annotations

from pathlib import Path

from irlsurfer.detector import (
    DetectorState,
    DistanceStatus,
    GestureDetector,
    GestureEvent,
)
from irlsurfer.landmarks import Frame, Landmark


def assert_state(detector: GestureDetector, expected: DetectorState) -> None:
    """Helper to assert detector state without triggering mypy type-narrowing overlap."""
    assert detector.state == expected


def assert_distance_status(detector: GestureDetector, expected: DistanceStatus) -> None:
    """Helper to assert distance status without triggering mypy type-narrowing overlap."""
    assert detector.last_distance_status == expected


def make_frame(
    timestamp: float,
    center_x: float = 0.5,
    center_y: float = 0.5,
    shoulder_width: float = 0.2,
    wrist_dist: float = 0.3,
    visibility: float = 1.0,
    wrist_visibility: float = 1.0,
) -> Frame:
    """Helper to create a synthetic Frame with exact geometric center and shoulder width."""
    half_sw = shoulder_width / 2.0
    half_wd = wrist_dist / 2.0

    return Frame(
        timestamp=timestamp,
        left_shoulder=Landmark(
            x=center_x - half_sw,
            y=center_y - 0.15,
            visibility=visibility,
        ),
        right_shoulder=Landmark(
            x=center_x + half_sw,
            y=center_y - 0.15,
            visibility=visibility,
        ),
        left_hip=Landmark(
            x=center_x - half_sw,
            y=center_y + 0.15,
            visibility=visibility,
        ),
        right_hip=Landmark(
            x=center_x + half_sw,
            y=center_y + 0.15,
            visibility=visibility,
        ),
        left_wrist=Landmark(
            x=center_x - half_wd,
            y=center_y + 0.2,
            visibility=wrist_visibility,
        ),
        right_wrist=Landmark(
            x=center_x + half_wd,
            y=center_y + 0.2,
            visibility=wrist_visibility,
        ),
        nose=Landmark(x=center_x, y=center_y - 0.25, visibility=visibility),
    )


def calibrate_detector(detector: GestureDetector, base_center_x: float = 0.5) -> None:
    """Run calibration sequence to bring detector into ACTIVE state."""
    dt = 0.05
    t = 0.0
    for _ in range(45):  # 45 * 0.05 = 2.25s > 2.0s
        detector.process_frame(
            make_frame(
                timestamp=t,
                center_x=base_center_x,
                center_y=0.5,
                shoulder_width=0.2,
            )
        )
        t += dt
    assert_state(detector, DetectorState.ACTIVE)


def test_landmarks_creation_and_properties() -> None:
    frame = make_frame(0.0, center_x=0.5, center_y=0.5, shoulder_width=0.2)
    assert abs(frame.center_x - 0.5) < 1e-6
    assert abs(frame.center_y - 0.5) < 1e-6
    assert abs(frame.shoulder_width - 0.2) < 1e-6
    assert frame.is_valid(min_visibility=0.5)

    # Frame from dict
    data = {
        "timestamp": 1.23,
        "left_shoulder": {"x": 0.4, "y": 0.4, "visibility": 0.9},
        "right_shoulder": {"x": 0.6, "y": 0.4, "visibility": 0.9},
        "left_hip": {"x": 0.4, "y": 0.6, "visibility": 0.9},
        "right_hip": {"x": 0.6, "y": 0.6, "visibility": 0.9},
        "left_wrist": {"x": 0.3, "y": 0.7, "visibility": 0.9},
        "right_wrist": {"x": 0.7, "y": 0.7, "visibility": 0.9},
        "nose": {"x": 0.5, "y": 0.3, "visibility": 0.9},
    }
    f_dict = Frame.from_dict(data)
    assert f_dict.timestamp == 1.23
    assert abs(f_dict.shoulder_width - 0.2) < 1e-6

    # Frame from mediapipe list
    raw_lms = [
        {"x": 0.5, "y": 0.25},  # 0: nose
        *([{"x": 0.0, "y": 0.0}] * 10),
        {"x": 0.4, "y": 0.35},  # 11: left_shoulder
        {"x": 0.6, "y": 0.35},  # 12: right_shoulder
        {"x": 0.0, "y": 0.0},
        {"x": 0.0, "y": 0.0},
        {"x": 0.35, "y": 0.7},  # 15: left_wrist
        {"x": 0.65, "y": 0.7},  # 16: right_wrist
        *([{"x": 0.0, "y": 0.0}] * 6),
        {"x": 0.4, "y": 0.65},  # 23: left_hip
        {"x": 0.6, "y": 0.65},  # 24: right_hip
    ]
    f_mp = Frame.from_mediapipe(raw_lms, timestamp=2.0)
    assert f_mp.timestamp == 2.0
    assert abs(f_mp.shoulder_width - 0.2) < 1e-6


def test_detector_calibration_lifecycle() -> None:
    detector = GestureDetector()
    assert_state(detector, DetectorState.CALIBRATING)

    # Feed frames up to 1.9s: should remain calibrating
    t = 0.0
    while t < 1.9:
        events = detector.process_frame(
            make_frame(timestamp=t, center_x=0.5, center_y=0.5, shoulder_width=0.2)
        )
        assert events == []
        assert_state(detector, DetectorState.CALIBRATING)
        t += 0.1

    # At 2.1s: calibration finishes
    events = detector.process_frame(
        make_frame(timestamp=2.1, center_x=0.5, center_y=0.5, shoulder_width=0.2)
    )
    assert events == []
    assert_state(detector, DetectorState.ACTIVE)
    # Mirrored x of center_x 0.5 is 1.0 - 0.5 = 0.5
    assert abs(detector.base_x - 0.5) < 1e-5
    assert abs(detector.base_y - 0.5) < 1e-5
    assert abs(detector.base_sw - 0.2) < 1e-5


def test_mirroring_and_lane_hysteresis() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    # In webcam, user steps to physical RIGHT -> camera center_x moves LEFT (e.g., from 0.5 to 0.35)
    # Mirrored coordinate = 1.0 - 0.35 = 0.65. Base mirrored x = 0.50.
    # dx = (0.65 - 0.50) / 0.2 = +0.75 >= enter_lane_thresh (0.6)
    t = 2.5
    events: list[GestureEvent] = []
    # Send enough frames for filter to converge
    for _ in range(5):
        ev = detector.process_frame(
            make_frame(timestamp=t, center_x=0.35, center_y=0.5, shoulder_width=0.2)
        )
        events.extend(ev)
        t += 0.033

    assert GestureEvent.LANE_RIGHT in events
    assert detector.current_lane == 1

    # User relaxes slightly towards center: raw center_x = 0.40
    # Mirrored x = 0.60 -> dx = (0.60 - 0.50) / 0.2 = 0.50
    # 0.50 is above exit_lane_thresh (0.40), so user stays in lane 1
    events.clear()
    for _ in range(5):
        ev = detector.process_frame(
            make_frame(timestamp=t, center_x=0.40, center_y=0.5, shoulder_width=0.2)
        )
        events.extend(ev)
        t += 0.033

    assert events == []
    assert detector.current_lane == 1

    # User steps further towards center: raw center_x = 0.45
    # Mirrored x = 0.55 -> dx = (0.55 - 0.50) / 0.2 = 0.25 <= exit_lane_thresh (0.40)
    # Exits lane 1 back to center (0), emitting LANE_LEFT (returning from right track to center)
    events.clear()
    for _ in range(5):
        ev = detector.process_frame(
            make_frame(timestamp=t, center_x=0.45, center_y=0.5, shoulder_width=0.2)
        )
        events.extend(ev)
        t += 0.033

    assert GestureEvent.LANE_LEFT in events
    assert detector.current_lane == 0


def test_left_lane_hysteresis() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    # User steps to physical LEFT -> camera raw center_x moves RIGHT to 0.65
    # Mirrored x = 0.35 -> dx = (0.35 - 0.50) / 0.2 = -0.75 <= -0.6
    t = 2.5
    events: list[GestureEvent] = []
    for _ in range(5):
        ev = detector.process_frame(
            make_frame(timestamp=t, center_x=0.65, center_y=0.5, shoulder_width=0.2)
        )
        events.extend(ev)
        t += 0.033

    assert GestureEvent.LANE_LEFT in events
    assert detector.current_lane == -1

    # Retreat back to center: raw center_x moves back to 0.55
    # Mirrored x = 0.45 -> dx = -0.25 >= -exit_lane_thresh (-0.4)
    # Transitions -1 -> 0, emitting LANE_RIGHT
    events.clear()
    for _ in range(5):
        ev = detector.process_frame(
            make_frame(timestamp=t, center_x=0.55, center_y=0.5, shoulder_width=0.2)
        )
        events.extend(ev)
        t += 0.033

    assert GestureEvent.LANE_RIGHT in events
    assert detector.current_lane == 0


def test_double_lane_hop() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    # Put into left lane (-1)
    t = 2.5
    for _ in range(5):
        detector.process_frame(
            make_frame(timestamp=t, center_x=0.65, center_y=0.5, shoulder_width=0.2)
        )
        t += 0.033
    assert detector.current_lane == -1

    # Jump all the way to right lane (+1) in one motion: raw center_x = 0.30
    # Mirrored x = 0.70 -> dx = (0.70 - 0.50) / 0.2 = +1.0 >= enter_lane_thresh (0.6)
    events: list[GestureEvent] = []
    for _ in range(5):
        ev = detector.process_frame(
            make_frame(timestamp=t, center_x=0.30, center_y=0.5, shoulder_width=0.2)
        )
        events.extend(ev)
        t += 0.033

    # Should emit two LANE_RIGHT events
    right_events = [e for e in events if e == GestureEvent.LANE_RIGHT]
    assert len(right_events) == 2
    assert detector.current_lane == 1


def test_jump_detection_and_cooldown() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    t = 2.5
    # Baseline center_y is 0.5.
    # To jump upwards, center_y decreases (towards 0).
    # dy = (base_y - y) / base_sw = (0.50 - 0.40) / 0.20 = 0.50 >= jump_dy_thresh (0.22).
    # Rapid transition in 0.05s produces vel_y = (0.50 - 0.0) / 0.05 = 10.0
    # which is >= jump_vel_thresh (0.60).
    events = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.40, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP in events

    # During cooldown (< 0.50s), another upward frame should NOT re-trigger JUMP
    t += 0.1
    cooldown_events = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.35, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP not in cooldown_events

    # After cooldown (0.55s later), drop back then jump again
    t += 0.55
    detector.process_frame(make_frame(timestamp=t, center_x=0.5, center_y=0.50, shoulder_width=0.2))
    t += 0.05
    second_jump_events = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.40, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP in second_jump_events


def test_duck_detection_and_cooldown() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    t = 2.5
    # Baseline center_y is 0.5.
    # To duck downwards, center_y increases (towards 1).
    # dy = (0.50 - 0.60) / 0.20 = -0.50 <= duck_dy_thresh (-0.22).
    # Rapid downward motion produces vel_y <= -0.60.
    events = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.60, shoulder_width=0.2)
    )
    assert GestureEvent.DUCK in events

    # During cooldown (< 0.50s), should NOT re-trigger DUCK
    t += 0.1
    cooldown_events = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.65, shoulder_width=0.2)
    )
    assert GestureEvent.DUCK not in cooldown_events

    # Reset position and duck after cooldown
    t += 0.55
    detector.process_frame(make_frame(timestamp=t, center_x=0.5, center_y=0.50, shoulder_width=0.2))
    t += 0.05
    second_duck_events = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.60, shoulder_width=0.2)
    )
    assert GestureEvent.DUCK in second_duck_events


def test_hoverboard_hold_and_single_activation() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    # Hoverboard threshold: wrist_dist <= hoverboard_dist_thresh * base_sw = 0.45 * 0.2 = 0.09
    t = 2.5
    # Brief wrist touch (0.15s < 0.30s required)
    for _ in range(3):
        events = detector.process_frame(
            make_frame(
                timestamp=t,
                center_x=0.5,
                center_y=0.5,
                shoulder_width=0.2,
                wrist_dist=0.05,
            )
        )
        assert GestureEvent.HOVERBOARD not in events
        t += 0.05

    # Separate wrists
    detector.process_frame(
        make_frame(
            timestamp=t,
            center_x=0.5,
            center_y=0.5,
            shoulder_width=0.2,
            wrist_dist=0.30,
        )
    )
    t += 0.05

    # Now hold wrists close for >= 0.30s
    hoverboard_triggered = False
    for _ in range(8):  # 8 * 0.05 = 0.40s >= 0.30s
        events = detector.process_frame(
            make_frame(
                timestamp=t,
                center_x=0.5,
                center_y=0.5,
                shoulder_width=0.2,
                wrist_dist=0.05,
            )
        )
        if GestureEvent.HOVERBOARD in events:
            hoverboard_triggered = True
        t += 0.05

    assert hoverboard_triggered

    # Continuing to hold wrists together continuously should NOT fire again
    continued_events: list[GestureEvent] = []
    for _ in range(10):
        ev = detector.process_frame(
            make_frame(
                timestamp=t,
                center_x=0.5,
                center_y=0.5,
                shoulder_width=0.2,
                wrist_dist=0.05,
            )
        )
        continued_events.extend(ev)
        t += 0.05

    assert GestureEvent.HOVERBOARD not in continued_events

    # Release wrists, wait less than cooldown (cooldown is 3.0s), and hold again: should NOT fire
    detector.process_frame(
        make_frame(
            timestamp=t,
            center_x=0.5,
            center_y=0.5,
            shoulder_width=0.2,
            wrist_dist=0.30,
        )
    )
    t += 1.0  # only 1.0s elapsed < 3.0s cooldown
    premature_events: list[GestureEvent] = []
    for _ in range(8):
        ev = detector.process_frame(
            make_frame(
                timestamp=t,
                center_x=0.5,
                center_y=0.5,
                shoulder_width=0.2,
                wrist_dist=0.05,
            )
        )
        premature_events.extend(ev)
        t += 0.05
    assert GestureEvent.HOVERBOARD not in premature_events


def test_dynamic_recenter() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    original_base_x = detector.base_x
    original_base_y = detector.base_y

    # User rests slightly shifted in center lane (e.g., center_x = 0.48, center_y = 0.52)
    # Mirrored x = 0.52. dx = (0.52 - 0.50) / 0.2 = 0.10 (well within center lane)
    t = 2.5
    for _ in range(20):
        detector.process_frame(
            make_frame(
                timestamp=t,
                center_x=0.48,
                center_y=0.52,
                shoulder_width=0.2,
            )
        )
        t += 0.05

    # Base x and y should have slowly drifted towards the resting pose
    assert detector.base_x > original_base_x
    assert detector.base_y > original_base_y


def test_invalid_and_low_visibility_handling() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    t = 2.5
    # Low visibility torso frame
    invalid_frame = make_frame(
        timestamp=t,
        center_x=0.30,  # lane right position
        center_y=0.5,
        shoulder_width=0.2,
        visibility=0.2,  # below min_visibility (0.50)
    )
    assert not invalid_frame.is_valid(0.50)
    events = detector.process_frame(invalid_frame)
    assert events == []
    assert detector.current_lane == 0  # didn't change lane

    # Wrists low visibility prevents hoverboard
    t += 0.05
    wrist_low_vis_frame = make_frame(
        timestamp=t,
        center_x=0.5,
        center_y=0.5,
        shoulder_width=0.2,
        wrist_dist=0.05,
        wrist_visibility=0.2,
    )
    for _ in range(8):
        ev = detector.process_frame(wrist_low_vis_frame)
        assert GestureEvent.HOVERBOARD not in ev
        t += 0.05


def test_pause_resume_and_recalibrate() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    detector.pause()
    assert_state(detector, DetectorState.PAUSED)
    ev = detector.process_frame(
        make_frame(timestamp=3.0, center_x=0.30, center_y=0.5, shoulder_width=0.2)
    )
    assert ev == []

    detector.resume()
    assert_state(detector, DetectorState.ACTIVE)

    detector.recalibrate()
    assert_state(detector, DetectorState.CALIBRATING)


def test_config_from_json_file() -> None:
    config_path = Path("config/gestures.json")
    assert config_path.exists()
    detector = GestureDetector(config=None)
    from_file = detector.config.from_json_file(config_path)

    assert from_file.calibration_seconds == 2.0
    assert from_file.enter_lane_thresh == 0.6
    assert from_file.exit_lane_thresh == 0.4
    assert from_file.jump_dy_thresh == 0.22
    assert from_file.jump_vel_thresh == 0.60
    assert from_file.hoverboard_cooldown_sec == 3.0


def test_landmarks_object_and_instance_conversion() -> None:
    class FakeMPLandmark:
        def __init__(self, x: float, y: float, z: float = 0.0, visibility: float = 1.0) -> None:
            self.x = x
            self.y = y
            self.z = z
            self.visibility = visibility

    raw_objs = [FakeMPLandmark(0.5, 0.25)] + [FakeMPLandmark(0.0, 0.0)] * 30
    frame = Frame.from_mediapipe(raw_objs, timestamp=1.5)
    assert frame.timestamp == 1.5
    assert frame.nose is not None

    # from_dict with Landmark instances
    dict_with_instances = {
        "timestamp": 10.0,
        "left_shoulder": Landmark(0.4, 0.4),
        "right_shoulder": Landmark(0.6, 0.4),
        "left_hip": Landmark(0.4, 0.6),
        "right_hip": Landmark(0.6, 0.6),
        "left_wrist": Landmark(0.3, 0.7),
        "right_wrist": Landmark(0.7, 0.7),
    }
    f2 = Frame.from_dict(dict_with_instances)
    assert f2.timestamp == 10.0
    assert f2.nose is None


def test_detector_edge_cases() -> None:
    # 1. Config passed as dict
    d_dict = GestureDetector(config={"calibration_seconds": 1.0})
    assert d_dict.config.calibration_seconds == 1.0

    # 2. Config passed as GestureConfig
    d_cfg = GestureDetector(config=d_dict.config)
    assert d_cfg.config.calibration_seconds == 1.0

    # 3. Small shoulder width during calibration
    d_small = GestureDetector(config={"calibration_seconds": 0.1, "min_shoulder_width": 0.0005})
    d_small.process_frame(
        make_frame(0.0, center_x=0.5, center_y=0.5, shoulder_width=0.001, visibility=1.0)
    )
    d_small.process_frame(
        make_frame(0.2, center_x=0.5, center_y=0.5, shoulder_width=0.001, visibility=1.0)
    )
    assert_state(d_small, DetectorState.ACTIVE)
    assert abs(d_small.base_sw - 0.001) < 1e-5

    # 4. Same timestamp frame in active mode (dt <= 1e-4)
    d = GestureDetector()
    calibrate_detector(d)
    ev1 = d.process_frame(make_frame(timestamp=2.5, center_x=0.5, center_y=0.5))
    ev2 = d.process_frame(make_frame(timestamp=2.5, center_x=0.5, center_y=0.5))
    assert ev1 == []
    assert ev2 == []

    # 5. Zero / near-zero shoulder width fallback in calibration (base_sw <= 1e-4 -> 0.2)
    d_fallback = GestureDetector(config={"calibration_seconds": 0.1})
    d_fallback._calib_start_time = 0.0
    d_fallback._calib_x_samples = [0.5, 0.5]
    d_fallback._calib_y_samples = [0.5, 0.5]
    d_fallback._calib_sw_samples = [0.0, 0.0]
    d_fallback._handle_calibration(0.5, 0.5, 0.0, timestamp=0.2)
    assert_state(d_fallback, DetectorState.ACTIVE)
    assert d_fallback.base_sw == 0.2


def test_double_lane_hop_right_to_left() -> None:
    """Verify hopping directly from right lane (+1) to left lane (-1)."""
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    # Move to right lane (+1): camera raw center_x moves left to 0.35
    t = 2.5
    for _ in range(5):
        detector.process_frame(
            make_frame(timestamp=t, center_x=0.35, center_y=0.5, shoulder_width=0.2)
        )
        t += 0.033
    assert detector.current_lane == 1

    # In one leap, jump all the way to left lane (-1): raw center_x = 0.70
    # Mirrored x = 0.30 -> dx = (0.30 - 0.50) / 0.2 = -1.0 <= -enter_lane_thresh (-0.6)
    events: list[GestureEvent] = []
    for _ in range(5):
        ev = detector.process_frame(
            make_frame(timestamp=t, center_x=0.70, center_y=0.5, shoulder_width=0.2)
        )
        events.extend(ev)
        t += 0.033

    # Should emit two LANE_LEFT events
    left_events = [e for e in events if e == GestureEvent.LANE_LEFT]
    assert len(left_events) == 2
    assert detector.current_lane == -1


def test_landmarks_custom_object_and_list_conversion() -> None:
    """Verify Frame conversions with custom point objects and Landmark lists."""

    class CustomPoint:
        def __init__(self, x: float, y: float, z: float = 0.1, visibility: float = 0.99) -> None:
            self.x = x
            self.y = y
            self.z = z
            self.visibility = visibility

    dict_with_custom_objs = {
        "timestamp": 5.0,
        "left_shoulder": CustomPoint(0.4, 0.4),
        "right_shoulder": CustomPoint(0.6, 0.4),
        "left_hip": CustomPoint(0.4, 0.6),
        "right_hip": CustomPoint(0.6, 0.6),
        "left_wrist": CustomPoint(0.3, 0.7),
        "right_wrist": CustomPoint(0.7, 0.7),
        "nose": CustomPoint(0.5, 0.3),
    }
    frame = Frame.from_dict(dict_with_custom_objs)
    assert frame.timestamp == 5.0
    assert abs(frame.shoulder_width - 0.2) < 1e-6
    assert frame.nose is not None
    assert frame.nose.z == 0.1

    # from_mediapipe with Landmark instances in the list
    landmarks_list = [Landmark(0.5, 0.25)] + [Landmark(0.0, 0.0)] * 30
    frame2 = Frame.from_mediapipe(landmarks_list, timestamp=6.0)
    assert frame2.timestamp == 6.0
    assert frame2.nose is not None
    assert frame2.nose.x == 0.5


def test_extreme_noise_frames_and_recovery() -> None:
    """Verify detector handles wild coordinate spikes without exceptions or state corruption."""
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    t = 2.5
    # Extreme coordinate spike: user jumps off-screen or tracker hallucinates
    noisy_frame = make_frame(
        timestamp=t,
        center_x=999.0,
        center_y=-999.0,
        shoulder_width=0.2,
    )
    # Shouldn't crash; might register jump or lane event depending on direction
    detector.process_frame(noisy_frame)

    # Immediately recover back to clean neutral center
    t += 0.05
    for _ in range(10):
        detector.process_frame(
            make_frame(timestamp=t, center_x=0.5, center_y=0.5, shoulder_width=0.2)
        )
        t += 0.05

    # Should safely return to center lane
    assert detector.current_lane == 0
    assert_state(detector, DetectorState.ACTIVE)


def test_rapid_consecutive_lane_toggles_hysteresis() -> None:
    """Verify small oscillations around threshold boundary do not cause toggle flapping."""
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    t = 2.5
    # Cross enter threshold: dx = 0.65 -> triggers LANE_RIGHT
    ev = detector.process_frame(
        make_frame(timestamp=t, center_x=0.37, center_y=0.5, shoulder_width=0.2)
    )
    assert GestureEvent.LANE_RIGHT in ev
    assert detector.current_lane == 1

    # Jitter back and forth between dx = 0.58 and dx = 0.52 (above exit_lane_thresh 0.40)
    for i in range(10):
        t += 0.033
        jitter_x = 0.384 if i % 2 == 0 else 0.396  # mirrored dx approx 0.58 and 0.52
        ev_jitter = detector.process_frame(
            make_frame(timestamp=t, center_x=jitter_x, center_y=0.5, shoulder_width=0.2)
        )
        # Should stay stably in lane 1 without repeatedly emitting events
        assert ev_jitter == []
        assert detector.current_lane == 1


def test_rapid_vertical_toggles_and_cooldown() -> None:
    """Verify jump and duck transitions, cooldown suppression, and opposite gesture transitions."""
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    t = 2.5
    # Jump trigger
    ev1 = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.40, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP in ev1

    # Immediately attempt another jump 0.1s later (cooldown is 0.50s)
    t += 0.1
    ev2 = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.35, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP not in ev2

    # Now rapidly plunge down into a duck 0.1s later (downward velocity)
    t += 0.1
    ev3 = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.65, shoulder_width=0.2)
    )
    assert GestureEvent.DUCK in ev3

    # Attempt another duck within duck cooldown (< 0.50s)
    t += 0.1
    ev4 = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.70, shoulder_width=0.2)
    )
    assert GestureEvent.DUCK not in ev4


def test_timestamp_non_monotonicity_and_backwards() -> None:
    """Verify detector handles zero dt and non-monotonic timestamps gracefully."""
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    # Valid frame at t=2.5
    ev1 = detector.process_frame(
        make_frame(timestamp=2.5, center_x=0.5, center_y=0.5, shoulder_width=0.2)
    )
    assert ev1 == []

    # Frame with duplicate timestamp (dt = 0.0)
    ev2 = detector.process_frame(
        make_frame(timestamp=2.5, center_x=0.5, center_y=0.35, shoulder_width=0.2)
    )
    # Zero dt prevents velocity calculation (vel_y = 0.0), so JUMP should NOT trigger
    assert GestureEvent.JUMP not in ev2
    assert detector.last_vel_y == 0.0

    # Frame with backward/past timestamp (dt < 0.0)
    ev3 = detector.process_frame(
        make_frame(timestamp=2.1, center_x=0.5, center_y=0.35, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP not in ev3
    assert detector.last_vel_y == 0.0

    # Normal advancing frame resumes detection
    ev4 = detector.process_frame(
        make_frame(timestamp=2.8, center_x=0.5, center_y=0.5, shoulder_width=0.2)
    )
    assert ev4 == []
    assert_state(detector, DetectorState.ACTIVE)


def test_distance_status_and_guidance_message() -> None:
    detector = GestureDetector()
    assert_distance_status(detector, DistanceStatus.UNKNOWN)
    assert detector.distance_guidance_message == "NO PERSON DETECTED"

    # None frame
    assert detector.get_distance_status(None) == DistanceStatus.UNKNOWN

    # Invalid visibility frame
    invalid_f = make_frame(timestamp=1.0, shoulder_width=0.2, visibility=0.1)
    assert detector.get_distance_status(invalid_f) == DistanceStatus.UNKNOWN

    # Too far (shoulder width < 0.14)
    far_f = make_frame(timestamp=1.0, shoulder_width=0.10)
    assert detector.get_distance_status(far_f) == DistanceStatus.TOO_FAR

    # Too close (shoulder width > 0.45)
    close_f = make_frame(timestamp=1.0, shoulder_width=0.50)
    assert detector.get_distance_status(close_f) == DistanceStatus.TOO_CLOSE

    # Optimal (0.14 <= shoulder_width <= 0.45)
    opt_f = make_frame(timestamp=1.0, shoulder_width=0.25)
    assert detector.get_distance_status(opt_f) == DistanceStatus.OPTIMAL

    # Process frame updates last_distance_status and distance_guidance_message
    detector.process_frame(close_f)
    assert_distance_status(detector, DistanceStatus.TOO_CLOSE)
    assert detector.distance_guidance_message == "STEP BACK - TOO CLOSE"

    detector.process_frame(far_f)
    assert_distance_status(detector, DistanceStatus.TOO_FAR)
    assert detector.distance_guidance_message == "STEP CLOSER - TOO FAR"

    detector.process_frame(opt_f)
    assert_distance_status(detector, DistanceStatus.OPTIMAL)
    assert detector.distance_guidance_message == "DISTANCE OK"


def test_calibration_gated_by_distance() -> None:
    detector = GestureDetector()
    assert_state(detector, DetectorState.CALIBRATING)
    assert detector.calibration_progress == 0.0

    # 1. Feed frames that are TOO_CLOSE (sw = 0.50) for 3.0s
    for i in range(30):
        t = i * 0.1
        f = make_frame(timestamp=t, shoulder_width=0.50)
        detector.process_frame(f)
        assert_state(detector, DetectorState.CALIBRATING)
        assert detector.calibration_progress == 0.0
        assert_distance_status(detector, DistanceStatus.TOO_CLOSE)

    # 2. Feed frames that are TOO_FAR (sw = 0.10) for 3.0s
    for i in range(30):
        t = 3.0 + i * 0.1
        f = make_frame(timestamp=t, shoulder_width=0.10)
        detector.process_frame(f)
        assert_state(detector, DetectorState.CALIBRATING)
        assert detector.calibration_progress == 0.0
        assert_distance_status(detector, DistanceStatus.TOO_FAR)

    # 3. Interrupted calibration:
    # Feed 1.0s of OPTIMAL frames (t = 6.0 to 7.0)
    for i in range(11):
        t = 6.0 + i * 0.1
        f = make_frame(timestamp=t, shoulder_width=0.20)
        detector.process_frame(f)
    assert_state(detector, DetectorState.CALIBRATING)
    assert 0.45 <= detector.calibration_progress <= 0.55

    # Pause due to TOO_CLOSE for 5.0 seconds (t = 7.1 to 12.0)
    prog_before = detector.calibration_progress
    for i in range(50):
        t = 7.1 + i * 0.1
        f = make_frame(timestamp=t, shoulder_width=0.50)
        detector.process_frame(f)
    assert_state(detector, DetectorState.CALIBRATING)
    assert detector.calibration_progress == prog_before

    # Resume with OPTIMAL frames until calibration finishes (remaining ~1.0s)
    # At t = 12.1 to 13.2
    for i in range(12):
        t = 12.1 + i * 0.1
        f = make_frame(timestamp=t, shoulder_width=0.20)
        detector.process_frame(f)

    assert_state(detector, DetectorState.ACTIVE)
    assert detector.calibration_progress == 1.0


def test_speed_multiplier_defaults_and_clamping() -> None:
    detector = GestureDetector()
    assert detector.speed_multiplier == 1.0
    assert detector.jump_vel_thresh == detector.base_jump_vel_thresh
    assert detector.duck_vel_thresh == detector.base_duck_vel_thresh
    assert detector.jump_cooldown_sec == detector.base_jump_cooldown_sec
    assert detector.duck_cooldown_sec == detector.base_duck_cooldown_sec

    # Scaling to 1.5x
    detector.speed_multiplier = 1.5
    assert detector.speed_multiplier == 1.5
    assert abs(detector.jump_vel_thresh - 0.60 * 1.5) < 1e-6
    assert abs(detector.duck_vel_thresh - (-0.60 * 1.5)) < 1e-6
    assert abs(detector.jump_cooldown_sec - 0.50 / 1.5) < 1e-6
    assert abs(detector.duck_cooldown_sec - 0.50 / 1.5) < 1e-6

    # Clamping below 0.5
    detector.set_speed_multiplier(0.1)
    assert detector.speed_multiplier == 0.5
    assert abs(detector.jump_vel_thresh - 0.60 * 0.5) < 1e-6
    assert abs(detector.jump_cooldown_sec - 0.50 / 0.5) < 1e-6

    # Clamping above 2.5
    detector.set_speed_multiplier(4.0)
    assert detector.speed_multiplier == 2.5
    assert abs(detector.jump_vel_thresh - 0.60 * 2.5) < 1e-6
    assert abs(detector.jump_cooldown_sec - 0.50 / 2.5) < 1e-6


def test_speed_multiplier_jump_and_cooldown_behavior() -> None:
    detector = GestureDetector()
    calibrate_detector(detector, base_center_x=0.5)

    # Set speed to 2.0x -> jump_vel_thresh becomes 1.20, jump_cooldown_sec becomes 0.25s
    detector.set_speed_multiplier(2.0)
    assert detector.jump_vel_thresh == 1.20
    assert detector.jump_cooldown_sec == 0.25

    t = 2.5
    # First frame at baseline
    detector.process_frame(make_frame(timestamp=t, center_x=0.5, center_y=0.50, shoulder_width=0.2))

    # Second frame with upward displacement dy = (0.5 - 0.46) / 0.2 = 0.20
    # dy = 0.20 < jump_dy_thresh (0.22) -> no jump
    t += 0.05
    events_low_dy = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.46, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP not in events_low_dy

    # Now a clear jump: dy = (0.5 - 0.40) / 0.2 = 0.50 >= 0.22,
    # velocity vel_y = (0.50 - 0.20) / 0.05 = 6.0 >= 1.20
    t += 0.05
    events_jump = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.40, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP in events_jump

    # Cooldown is 0.25s. At t + 0.15s, should still be in cooldown:
    t += 0.15
    events_cooldown = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.35, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP not in events_cooldown

    # At t + 0.26s (> 0.25s cooldown), reset and jump again:
    t += 0.15  # total delta from jump = 0.30s > 0.25s
    detector.process_frame(make_frame(timestamp=t, center_x=0.5, center_y=0.50, shoulder_width=0.2))
    t += 0.05
    events_second_jump = detector.process_frame(
        make_frame(timestamp=t, center_x=0.5, center_y=0.40, shoulder_width=0.2)
    )
    assert GestureEvent.JUMP in events_second_jump
