"""Command line interface for IRLSurfer."""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path
from typing import Any

import cv2

from irlsurfer.detector import DetectorState, GestureConfig, GestureDetector
from irlsurfer.input import KeyBackend, NullBackend, PynputBackend, check_macos_accessibility
from irlsurfer.overlay import DebugHUD
from irlsurfer.pose import PoseExtractor

logger = logging.getLogger(__name__)


def create_parser() -> argparse.ArgumentParser:
    """Create command line argument parser with subcommands."""
    parser = argparse.ArgumentParser(
        prog="irlsurfer",
        description="IRLSurfer: Real-time CV gesture controller for Subway Surfers",
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Available subcommands")

    # play subcommand
    play_parser = subparsers.add_parser("play", help="Launch live CV gesture controller")
    play_parser.add_argument(
        "--camera",
        default="0",
        help="OpenCV camera index (e.g. 0) or video file path (default: 0)",
    )
    play_parser.add_argument(
        "--width",
        type=int,
        default=640,
        help="Camera capture width (default: 640)",
    )
    play_parser.add_argument(
        "--height",
        type=int,
        default=480,
        help="Camera capture height (default: 480)",
    )
    play_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without dispatching real key events to the OS",
    )
    play_parser.add_argument(
        "--no-overlay",
        action="store_true",
        help="Run headless without OpenCV GUI window",
    )
    play_parser.add_argument(
        "--config",
        type=str,
        default="config/gestures.json",
        help="Path to gesture threshold config JSON file",
    )
    play_parser.add_argument(
        "--model",
        choices=["lite", "full", "heavy"],
        default="lite",
        help="MediaPipe Pose Landmarker model type (default: lite)",
    )
    play_parser.add_argument(
        "--max-frames",
        type=int,
        default=None,
        help="Exit after processing max frames (useful for tests/benchmarks)",
    )

    # Stubs for phase 4
    subparsers.add_parser("record", help="Record video and ground truth pose sequences")
    subparsers.add_parser("label", help="Annotate recorded pose datasets")
    subparsers.add_parser("eval", help="Evaluate gesture detector precision/recall")
    subparsers.add_parser("bench", help="Run latency and throughput benchmarks")

    return parser


def run_play_loop(
    cap: Any,
    extractor: PoseExtractor,
    detector: GestureDetector,
    backend: KeyBackend,
    hud: DebugHUD,
    no_overlay: bool = False,
    max_frames: int | None = None,
) -> None:
    """Execute live controller loop."""
    frames_processed = 0
    prev_time = time.perf_counter()
    fps = 0.0

    while cap.isOpened():
        if max_frames is not None and frames_processed >= max_frames:
            break

        ret, frame_bgr = cap.read()
        if not ret or frame_bgr is None:
            break

        frames_processed += 1
        t0 = time.perf_counter()
        timestamp_s = time.time()

        frame_data = extractor.extract(frame_bgr, timestamp_s=timestamp_s)
        if frame_data is not None:
            events = detector.process_frame(frame_data)
            for event in events:
                backend.send_gesture(event)
                hud.add_gesture(event, timestamp_s)

        t1 = time.perf_counter()
        latency_ms = (t1 - t0) * 1000.0
        dt = t1 - prev_time
        prev_time = t1
        instant_fps = 1.0 / dt if dt > 1e-4 else 30.0
        fps = 0.9 * fps + 0.1 * instant_fps if fps > 0.0 else instant_fps

        if not no_overlay:
            annotated = hud.render(
                image_bgr=frame_bgr,
                frame_data=frame_data,
                detector=detector,
                fps=fps,
                latency_ms=latency_ms,
            )
            cv2.imshow("IRLSurfer HUD", annotated)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), ord("Q"), 27):
                break
            if key in (ord("p"), ord("P")):
                if detector.state == DetectorState.PAUSED:
                    detector.resume()
                else:
                    detector.pause()
            elif key in (ord("c"), ord("C")):
                detector.recalibrate()


def play_command(args: argparse.Namespace) -> int:
    """Handle the 'play' subcommand."""
    config_path = Path(args.config)
    if config_path.exists():
        config = GestureConfig.from_json_file(config_path)
    else:
        logger.warning("Config file '%s' not found, using default thresholds.", config_path)
        config = GestureConfig()

    backend: KeyBackend
    if args.dry_run:
        backend = NullBackend()
        logger.info("Running in dry-run mode (NullBackend). Real keystrokes disabled.")
    else:
        check_macos_accessibility()
        backend = PynputBackend()

    detector = GestureDetector(config=config)
    extractor = PoseExtractor(model_type=args.model)
    hud = DebugHUD(mirror=True)

    try:
        camera_id: int | str = int(args.camera)
    except ValueError:
        camera_id = str(args.camera)

    cap = cv2.VideoCapture(camera_id)
    if isinstance(camera_id, int):
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    if not cap.isOpened():
        logger.error("Unable to open video source: %s", args.camera)
        extractor.close()
        return 1

    try:
        run_play_loop(
            cap=cap,
            extractor=extractor,
            detector=detector,
            backend=backend,
            hud=hud,
            no_overlay=args.no_overlay,
            max_frames=args.max_frames,
        )
    finally:
        cap.release()
        if not args.no_overlay:
            cv2.destroyAllWindows()
        extractor.close()

    return 0


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    parser = create_parser()
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    if args.subcommand == "play":
        return play_command(args)
    if args.subcommand in ("record", "label", "eval", "bench"):
        print(f"Command '{args.subcommand}' will be available in Phase 4.")
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
