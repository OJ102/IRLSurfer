"""Unit tests for IRLSurfer CLI and live play controller."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from irlsurfer.cli import create_parser, main, play_command, run_play_loop
from irlsurfer.detector import DetectorState, GestureConfig, GestureDetector, GestureEvent
from irlsurfer.input import NullBackend
from irlsurfer.landmarks import Frame, Landmark
from irlsurfer.overlay import DebugHUD
from irlsurfer.pose import PoseExtractor


def test_cli_parser_defaults() -> None:
    parser = create_parser()
    args = parser.parse_args(["play"])
    assert args.subcommand == "play"
    assert args.camera == "0"
    assert args.width == 640
    assert args.height == 480
    assert args.dry_run is False
    assert args.no_overlay is False
    assert args.model == "lite"
    assert args.config == "config/gestures.json"
    assert args.max_frames is None


def test_cli_parser_custom_args() -> None:
    parser = create_parser()
    args = parser.parse_args(
        [
            "play",
            "--camera",
            "1",
            "--width",
            "1280",
            "--height",
            "720",
            "--dry-run",
            "--no-overlay",
            "--model",
            "full",
            "--max-frames",
            "100",
        ]
    )
    assert args.camera == "1"
    assert args.width == 1280
    assert args.height == 720
    assert args.dry_run is True
    assert args.no_overlay is True
    assert args.model == "full"
    assert args.max_frames == 100


def test_cli_help_flags() -> None:
    for cmd in ("record", "label", "eval", "bench"):
        with pytest.raises(SystemExit) as excinfo:
            main([cmd, "--help"])
        assert excinfo.value.code == 0


def test_cli_eval_command() -> None:
    ret = main(
        [
            "eval",
            "--recording",
            "data/recordings/clean_lanes.json",
            "--labels",
            "data/labels/clean_lanes_labels.json",
            "--format",
            "text",
        ]
    )
    assert ret == 0


def test_cli_bench_command() -> None:
    ret = main(
        [
            "bench",
            "--recording",
            "data/recordings/clean_lanes.json",
            "--labels",
            "data/labels/clean_lanes_labels.json",
            "--iterations",
            "5",
        ]
    )
    assert ret == 0


def test_cli_record_command(tmp_path: Path) -> None:
    out_file = tmp_path / "test_rec.json"
    with patch("irlsurfer.record.record_live", return_value=out_file) as mock_rec:
        ret = main(["record", "--output", str(out_file), "--duration", "1.0", "--no-overlay"])
        assert ret == 0
        mock_rec.assert_called_once()


def test_cli_label_command(tmp_path: Path) -> None:
    out_file = tmp_path / "test_lbl.json"
    ret = main(
        [
            "label",
            "--recording",
            "data/recordings/clean_lanes.json",
            "--output",
            str(out_file),
            "--headless",
        ]
    )
    assert ret == 0
    assert out_file.exists()


def test_cli_no_args_returns_1() -> None:
    ret = main([])
    assert ret == 1


def test_run_play_loop_with_max_frames() -> None:
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    mock_cap.read.return_value = (True, dummy_frame)

    mock_extractor = MagicMock(spec=PoseExtractor)
    mock_frame = Frame(
        timestamp=1.0,
        left_shoulder=Landmark(x=0.4, y=0.3),
        right_shoulder=Landmark(x=0.6, y=0.3),
        left_hip=Landmark(x=0.45, y=0.6),
        right_hip=Landmark(x=0.55, y=0.6),
        left_wrist=Landmark(x=0.3, y=0.5),
        right_wrist=Landmark(x=0.7, y=0.5),
    )
    mock_extractor.extract.return_value = mock_frame

    detector = MagicMock(spec=GestureDetector)
    detector.process_frame.return_value = [GestureEvent.JUMP]
    backend = NullBackend()
    hud = DebugHUD(mirror=True)

    run_play_loop(
        cap=mock_cap,
        extractor=mock_extractor,
        detector=detector,
        backend=backend,
        hud=hud,
        no_overlay=True,
        max_frames=5,
    )

    assert mock_cap.read.call_count == 5
    assert mock_extractor.extract.call_count == 5
    assert detector.process_frame.call_count == 5
    assert backend.events == [GestureEvent.JUMP] * 5


def test_run_play_loop_keyboard_controls() -> None:
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    mock_cap.read.return_value = (True, dummy_frame)

    mock_extractor = MagicMock(spec=PoseExtractor)
    mock_extractor.extract.return_value = None

    detector = GestureDetector(GestureConfig())
    backend = NullBackend()
    hud = DebugHUD(mirror=False)

    key_sequence = [ord("p"), ord("p"), ord("c"), ord("q")]

    with (
        patch("cv2.imshow"),
        patch("cv2.waitKey", side_effect=key_sequence),
    ):
        run_play_loop(
            cap=mock_cap,
            extractor=mock_extractor,
            detector=detector,
            backend=backend,
            hud=hud,
            no_overlay=False,
            max_frames=10,
        )

    assert detector.state == DetectorState.CALIBRATING


def test_play_command_invalid_camera() -> None:
    parser = create_parser()
    args = parser.parse_args(["play", "--camera", "invalid_source", "--dry-run", "--no-overlay"])

    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = False

    with (
        patch("cv2.VideoCapture", return_value=mock_cap),
        patch("irlsurfer.cli.PoseExtractor"),
    ):
        ret = play_command(args)
        assert ret == 1


def test_cli_parser_invalid_model_fails() -> None:
    parser = create_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["play", "--model", "ultra"])


def test_run_play_loop_camera_immediate_eof() -> None:
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    mock_cap.read.return_value = (False, None)

    mock_extractor = MagicMock(spec=PoseExtractor)
    detector = GestureDetector(GestureConfig())
    backend = NullBackend()
    hud = DebugHUD()

    run_play_loop(
        cap=mock_cap,
        extractor=mock_extractor,
        detector=detector,
        backend=backend,
        hud=hud,
        no_overlay=True,
    )

    assert mock_extractor.extract.call_count == 0


def test_play_command_success_with_pynput_and_defaults() -> None:
    parser = create_parser()
    args = parser.parse_args(
        ["play", "--config", "nonexistent_config.json", "--no-overlay", "--max-frames", "2"]
    )

    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))

    mock_extractor = MagicMock()
    mock_extractor.extract.return_value = None

    with (
        patch("cv2.VideoCapture", return_value=mock_cap),
        patch("irlsurfer.cli.PoseExtractor", return_value=mock_extractor),
        patch("irlsurfer.cli.check_macos_accessibility", return_value=True) as mock_access,
        patch("irlsurfer.cli.PynputBackend") as mock_pynput,
    ):
        ret = play_command(args)
        assert ret == 0
        mock_access.assert_called_once()
        mock_pynput.assert_called_once()
        mock_cap.release.assert_called_once()
        mock_extractor.close.assert_called_once()


def test_cli_play_speed_argument_and_interactive_keys() -> None:
    parser = create_parser()

    # Default speed is 1.0
    args_default = parser.parse_args(["play"])
    assert args_default.speed == 1.0

    # Custom speed via --speed
    args_speed = parser.parse_args(["play", "--speed", "1.75"])
    assert args_speed.speed == 1.75

    # Custom speed via --sensitivity
    args_sens = parser.parse_args(["play", "--sensitivity", "2.25"])
    assert args_sens.speed == 2.25

    # Interactive runtime keys '+' and '-'
    mock_cap = MagicMock()
    mock_cap.isOpened.return_value = True
    dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    mock_cap.read.return_value = (True, dummy_frame)

    mock_extractor = MagicMock(spec=PoseExtractor)
    mock_extractor.extract.return_value = None

    detector = GestureDetector()
    assert detector.speed_multiplier == 1.0

    key_sequence = [ord("+"), ord("+"), ord("-"), ord("q")]

    with (
        patch("cv2.imshow"),
        patch("cv2.waitKey", side_effect=key_sequence),
    ):
        run_play_loop(
            cap=mock_cap,
            extractor=mock_extractor,
            detector=detector,
            backend=NullBackend(),
            hud=DebugHUD(mirror=False),
            no_overlay=False,
            max_frames=10,
        )

    # Started at 1.0, + 0.25 -> 1.25, + 0.25 -> 1.50, - 0.25 -> 1.25
    assert abs(detector.speed_multiplier - 1.25) < 1e-6
