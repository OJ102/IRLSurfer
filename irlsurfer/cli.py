"""Command line interface for IRLSurfer."""

from __future__ import annotations

import argparse
import json
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
        "--speed",
        "--sensitivity",
        type=float,
        default=1.0,
        dest="speed",
        help="Speed and sensitivity multiplier (range 0.5 to 2.5, default: 1.0)",
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

    # record subcommand
    record_parser = subparsers.add_parser(
        "record",
        help="Record video and ground truth pose sequences",
    )
    record_parser.add_argument(
        "--output",
        "-o",
        type=str,
        default="data/recordings/recording.json",
        help="Output path for recorded landmark JSON file",
    )
    record_parser.add_argument(
        "--camera",
        default="0",
        help="Camera index or video file path (default: 0)",
    )
    record_parser.add_argument(
        "--duration",
        "-d",
        type=float,
        default=None,
        help="Recording duration in seconds (stops when duration reached or 'q' pressed)",
    )
    record_parser.add_argument(
        "--note",
        type=str,
        default="",
        help="Optional descriptive note for the recording",
    )
    record_parser.add_argument(
        "--model",
        choices=["lite", "full", "heavy"],
        default="lite",
        help="MediaPipe model type (default: lite)",
    )
    record_parser.add_argument(
        "--width",
        type=int,
        default=640,
        help="Capture frame width (default: 640)",
    )
    record_parser.add_argument(
        "--height",
        type=int,
        default=480,
        help="Capture frame height (default: 480)",
    )
    record_parser.add_argument(
        "--no-overlay",
        action="store_true",
        help="Run headless recording without OpenCV preview window",
    )

    # label subcommand
    label_parser = subparsers.add_parser("label", help="Annotate recorded pose datasets")
    label_parser.add_argument(
        "--recording",
        "-r",
        type=str,
        required=True,
        help="Path to landmark recording JSON file",
    )
    label_parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Path to save ground truth label JSON file (default: data/labels/<name>_labels.json)",
    )
    label_parser.add_argument(
        "--headless",
        action="store_true",
        help="Run headless without interactive GUI playback",
    )

    # eval subcommand
    eval_parser = subparsers.add_parser("eval", help="Evaluate gesture detector precision/recall")
    eval_parser.add_argument(
        "--recording",
        "-r",
        type=str,
        required=True,
        help="Path to recorded landmark JSON file",
    )
    eval_parser.add_argument(
        "--labels",
        "-l",
        type=str,
        required=True,
        help="Path to ground truth labels JSON file",
    )
    eval_parser.add_argument(
        "--config",
        "-c",
        type=str,
        default=None,
        help="Optional path to gesture config JSON file",
    )
    eval_parser.add_argument(
        "--tolerance",
        "-t",
        type=float,
        default=0.15,
        help="Temporal matching tolerance window in seconds (default: 0.15s)",
    )
    eval_parser.add_argument(
        "--format",
        choices=["markdown", "text", "json"],
        default="markdown",
        help="Output format: markdown, text, or json (default: markdown)",
    )

    # bench subcommand
    bench_parser = subparsers.add_parser("bench", help="Run latency and throughput benchmarks")
    bench_parser.add_argument(
        "--recording",
        "-r",
        type=str,
        default=None,
        help="Optional path to recorded landmark JSON file for ablation studies",
    )
    bench_parser.add_argument(
        "--labels",
        "-l",
        type=str,
        default=None,
        help="Optional path to labels JSON file for ablation evaluation",
    )
    bench_parser.add_argument(
        "--iterations",
        "-n",
        type=int,
        default=100,
        help="Number of iterations for latency profiling (default: 100)",
    )
    bench_parser.add_argument(
        "--ablation",
        choices=["none", "filters", "gating", "all"],
        default="all",
        help="Ablation study to run (default: all)",
    )
    bench_parser.add_argument(
        "--include-pose",
        action="store_true",
        help="Include full MediaPipe Pose extractor inference in latency profiling",
    )

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
            elif key in (ord("+"), ord("=")):
                new_scale = round(detector.speed_multiplier + 0.25, 2)
                detector.set_speed_multiplier(new_scale)
            elif key in (ord("-"), ord("_")):
                new_scale = round(detector.speed_multiplier - 0.25, 2)
                detector.set_speed_multiplier(new_scale)


def play_command(args: argparse.Namespace) -> int:
    """Handle the 'play' subcommand."""
    if not (0.5 <= args.speed <= 2.5):
        logger.error("Speed multiplier must be between 0.5 and 2.5, got %s", args.speed)
        return 1

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
    detector.set_speed_multiplier(args.speed)
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


def record_command(args: argparse.Namespace) -> int:
    """Handle the 'record' subcommand."""
    from irlsurfer.record import record_live

    try:
        out_path = record_live(
            output_path=args.output,
            camera=args.camera,
            duration=args.duration,
            width=args.width,
            height=args.height,
            model=args.model,
            note=args.note,
            no_overlay=args.no_overlay,
        )
        print(f"Recorded landmarks saved successfully to: {out_path}")
        return 0
    except Exception as e:
        logger.error("Recording failed: %s", e)
        return 1


def label_command(args: argparse.Namespace) -> int:
    """Handle the 'label' subcommand."""
    from irlsurfer.label import label_recording

    try:
        dataset = label_recording(
            recording_path=args.recording,
            output_path=args.output,
            headless=args.headless,
        )
        print(f"Labeled {len(dataset.events)} events. Dataset saved.")
        return 0
    except Exception as e:
        logger.error("Labeling failed: %s", e)
        return 1


def eval_command(args: argparse.Namespace) -> int:
    """Handle the 'eval' subcommand."""
    from irlsurfer.evaluate import evaluate_files

    try:
        report = evaluate_files(
            recording_path=args.recording,
            label_path=args.labels,
            config_path=args.config,
            tolerance_sec=args.tolerance,
        )
        if args.format == "markdown":
            print(report.to_markdown())
        elif args.format == "text":
            print(report.to_text())
        elif args.format == "json":
            print(json.dumps(report.to_dict(), indent=2))
        return 0
    except Exception as e:
        logger.error("Evaluation failed: %s", e)
        return 1


def bench_command(args: argparse.Namespace) -> int:
    """Handle the 'bench' subcommand."""
    from irlsurfer.bench import (
        LatencyProfiler,
        format_ablation_filters_markdown,
        format_ablation_gating_markdown,
        run_ablation_filters,
        run_ablation_gating,
    )
    from irlsurfer.label import LabelDataset
    from irlsurfer.record import LandmarkRecorder

    frames = None
    if args.recording is not None:
        _, frames = LandmarkRecorder.load(args.recording)

    labels = None
    if args.labels is not None:
        labels = LabelDataset.load(args.labels)

    # 1. Latency Profiling
    profiler = LatencyProfiler()
    profiler.profile_pipeline(
        frames=frames,
        iterations=args.iterations,
        include_pose=args.include_pose,
    )
    print(profiler.to_markdown())
    print()

    # 2. Ablations (if recording provided)
    if frames is not None and args.ablation in ("filters", "all"):
        filter_res = run_ablation_filters(frames, ground_truth=labels)
        print(format_ablation_filters_markdown(filter_res))
        print()

    if frames is not None and labels is not None and args.ablation in ("gating", "all"):
        gating_res = run_ablation_gating(frames, ground_truth=labels)
        print(format_ablation_gating_markdown(gating_res))
        print()

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
    if args.subcommand == "record":
        return record_command(args)
    if args.subcommand == "label":
        return label_command(args)
    if args.subcommand == "eval":
        return eval_command(args)
    if args.subcommand == "bench":
        return bench_command(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
