"""Latency profiling and ablation benchmark suite for IRLSurfer."""

from __future__ import annotations

import copy
import logging
import math
import time
from dataclasses import dataclass
from typing import Any

import numpy as np

from irlsurfer.detector import GestureConfig, GestureDetector
from irlsurfer.evaluate import EvaluationReport, evaluate_recording
from irlsurfer.filters import OneEuroFilter2D
from irlsurfer.label import GroundTruthEvent, LabelDataset
from irlsurfer.landmarks import Frame, Landmark
from irlsurfer.overlay import DebugHUD
from irlsurfer.pose import PoseExtractor

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class StageStats:
    """Latency distribution statistics for a pipeline stage."""

    stage: str
    samples: int
    mean_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    fps: float

    def to_dict(self) -> dict[str, Any]:
        """Convert stats to dictionary."""
        return {
            "stage": self.stage,
            "samples": self.samples,
            "mean_ms": round(self.mean_ms, 3),
            "p50_ms": round(self.p50_ms, 3),
            "p95_ms": round(self.p95_ms, 3),
            "p99_ms": round(self.p99_ms, 3),
            "fps": round(self.fps, 1),
        }


class EMAFilter2D:
    """Simple 2D Exponential Moving Average filter."""

    def __init__(self, alpha: float = 0.5) -> None:
        self.alpha = float(alpha)
        self.prev_x: float | None = None
        self.prev_y: float | None = None

    def filter(self, x: float, y: float) -> tuple[float, float]:
        """Filter incoming (x, y) coordinates."""
        if self.prev_x is None or self.prev_y is None:
            self.prev_x = float(x)
            self.prev_y = float(y)
            return float(x), float(y)
        self.prev_x = self.alpha * float(x) + (1.0 - self.alpha) * self.prev_x
        self.prev_y = self.alpha * float(y) + (1.0 - self.alpha) * self.prev_y
        return self.prev_x, self.prev_y

    def filter_landmark(self, lm: Landmark) -> Landmark:
        """Filter landmark preserving z and visibility."""
        fx, fy = self.filter(lm.x, lm.y)
        return Landmark(x=fx, y=fy, z=lm.z, visibility=lm.visibility)

    def reset(self) -> None:
        """Reset internal filter state."""
        self.prev_x = None
        self.prev_y = None


class LatencyProfiler:
    """Profiles latency and throughput across IRLSurfer pipeline components."""

    def __init__(self) -> None:
        self.records: dict[str, list[float]] = {}

    def record(self, stage: str, latency_ms: float) -> None:
        """Record a single latency measurement in milliseconds."""
        if stage not in self.records:
            self.records[stage] = []
        self.records[stage].append(latency_ms)

    def compute_stats(self, stage: str) -> StageStats:
        """Compute mean, P50, P95, P99 latency stats for a stage."""
        values = self.records.get(stage, [])
        if not values:
            return StageStats(
                stage=stage,
                samples=0,
                mean_ms=0.0,
                p50_ms=0.0,
                p95_ms=0.0,
                p99_ms=0.0,
                fps=0.0,
            )

        arr = np.array(values, dtype=np.float64)
        mean_v = float(np.mean(arr))
        p50_v = float(np.percentile(arr, 50))
        p95_v = float(np.percentile(arr, 95))
        p99_v = float(np.percentile(arr, 99))
        fps = (1000.0 / mean_v) if mean_v > 0.0 else 0.0

        return StageStats(
            stage=stage,
            samples=len(values),
            mean_ms=mean_v,
            p50_ms=p50_v,
            p95_ms=p95_v,
            p99_ms=p99_v,
            fps=fps,
        )

    def all_stats(self) -> dict[str, StageStats]:
        """Compute stats for all recorded stages."""
        return {stage: self.compute_stats(stage) for stage in self.records}

    def profile_pipeline(
        self,
        frames: list[Frame] | None = None,
        iterations: int = 100,
        include_pose: bool = False,
    ) -> dict[str, StageStats]:
        """Profile pipeline components over frames or synthetic iterations."""
        detector = GestureDetector()
        hud = DebugHUD(mirror=False)
        filter_2d = OneEuroFilter2D(min_cutoff=1.0, beta=0.05)

        # Generate a default mock frame if none provided
        sample_frame = (
            frames[0]
            if frames
            else Frame(
                timestamp=0.033,
                left_shoulder=Landmark(x=0.6, y=0.4),
                right_shoulder=Landmark(x=0.4, y=0.4),
                left_hip=Landmark(x=0.6, y=0.7),
                right_hip=Landmark(x=0.4, y=0.7),
                left_wrist=Landmark(x=0.7, y=0.6),
                right_wrist=Landmark(x=0.3, y=0.6),
                nose=Landmark(x=0.5, y=0.3),
            )
        )

        mock_image = np.zeros((480, 640, 3), dtype=np.uint8)

        extractor: PoseExtractor | None = None
        if include_pose:
            try:
                extractor = PoseExtractor(model_type="lite")
            except Exception as e:
                logger.warning("Could not initialize PoseExtractor for profiling: %s", e)

        for i in range(iterations):
            t_total_0 = time.perf_counter()
            curr_frame = frames[i % len(frames)] if frames else copy.deepcopy(sample_frame)
            ts = float(i) * 0.033

            # 1. Pose Inference (if enabled)
            if extractor is not None:
                t0 = time.perf_counter()
                _ = extractor.extract(mock_image, timestamp_s=ts)
                t1 = time.perf_counter()
                self.record("Pose Inference", (t1 - t0) * 1000.0)

            # 2. Filter Latency
            t0 = time.perf_counter()
            _ = filter_2d.filter_landmark(curr_frame.left_shoulder, ts)
            _ = filter_2d.filter_landmark(curr_frame.right_shoulder, ts)
            t1 = time.perf_counter()
            self.record("Signal Filter", (t1 - t0) * 1000.0)

            # 3. Detector State Machine Latency
            t0 = time.perf_counter()
            _ = detector.process_frame(curr_frame)
            t1 = time.perf_counter()
            self.record("Detector Step", (t1 - t0) * 1000.0)

            # 4. Debug HUD Latency
            t0 = time.perf_counter()
            _ = hud.render(
                image_bgr=mock_image,
                frame_data=curr_frame,
                detector=detector,
                fps=30.0,
                latency_ms=10.0,
            )
            t1 = time.perf_counter()
            self.record("HUD Render", (t1 - t0) * 1000.0)

            # 5. End-to-end frame latency
            t_total_1 = time.perf_counter()
            self.record("End-to-End Frame", (t_total_1 - t_total_0) * 1000.0)

        if extractor is not None:
            extractor.close()

        return self.all_stats()

    def to_markdown(self) -> str:
        """Format latency profiling results into a Markdown table."""
        stats = self.all_stats()
        lines = [
            "### Latency Profiling Report",
            "",
            "| Pipeline Stage | Samples | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) | FPS |",
            "| :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
        ]
        for name, s in stats.items():
            lines.append(
                f"| `{name}` | {s.samples} | {s.mean_ms:.2f} | {s.p50_ms:.2f} | "
                f"{s.p95_ms:.2f} | {s.p99_ms:.2f} | {s.fps:.1f} |"
            )
        return "\n".join(lines)


def _filter_frame_stream(
    frames: list[Frame],
    filter_type: str,
) -> list[Frame]:
    """Apply selected filter across an entire stream of frames."""
    if filter_type == "raw":
        return frames

    filtered: list[Frame] = []
    landmark_names = [
        "left_shoulder",
        "right_shoulder",
        "left_hip",
        "right_hip",
        "left_wrist",
        "right_wrist",
        "nose",
    ]

    filters: dict[str, Any] = {}
    for name in landmark_names:
        if filter_type == "ema":
            filters[name] = EMAFilter2D(alpha=0.5)
        elif filter_type == "one_euro":
            filters[name] = OneEuroFilter2D(min_cutoff=1.0, beta=0.05)

    for f in frames:
        new_landmarks: dict[str, Any] = {"timestamp": f.timestamp}
        for name in landmark_names:
            orig_lm: Landmark | None = getattr(f, name)
            if orig_lm is None:
                new_landmarks[name] = None
                continue

            flt = filters[name]
            if filter_type == "ema":
                new_landmarks[name] = flt.filter_landmark(orig_lm)
            else:
                new_landmarks[name] = flt.filter_landmark(orig_lm, f.timestamp)

        filtered.append(
            Frame(
                timestamp=f.timestamp,
                left_shoulder=new_landmarks["left_shoulder"],
                right_shoulder=new_landmarks["right_shoulder"],
                left_hip=new_landmarks["left_hip"],
                right_hip=new_landmarks["right_hip"],
                left_wrist=new_landmarks["left_wrist"],
                right_wrist=new_landmarks["right_wrist"],
                nose=new_landmarks["nose"],
            )
        )

    return filtered


def _compute_torso_jitter(frames: list[Frame]) -> float:
    """Compute standard deviation of torso center position across frames."""
    if len(frames) < 2:
        return 0.0
    cx_vals = [f.center_x for f in frames]
    cy_vals = [f.center_y for f in frames]
    std_x = float(np.std(cx_vals))
    std_y = float(np.std(cy_vals))
    return float(math.hypot(std_x, std_y))


def run_ablation_filters(
    frames: list[Frame],
    ground_truth: list[dict[str, Any]] | list[GroundTruthEvent] | LabelDataset | None = None,
) -> dict[str, Any]:
    """Ablation 1: Compare Raw vs Fixed EMA vs OneEuroFilter on stability and detection."""
    results: dict[str, Any] = {}
    modes = ["raw", "ema", "one_euro"]

    for mode in modes:
        filtered_frames = _filter_frame_stream(frames, mode)
        jitter = _compute_torso_jitter(filtered_frames)

        mode_data: dict[str, Any] = {
            "mode": mode,
            "torso_jitter_std": round(jitter, 6),
        }

        if ground_truth is not None:
            detector = GestureDetector()
            report: EvaluationReport = evaluate_recording(
                frames=filtered_frames,
                ground_truth=ground_truth,
                detector=detector,
                recording_name=f"ablation_filter_{mode}",
            )
            mode_data["precision"] = round(report.overall_precision, 4)
            mode_data["recall"] = round(report.overall_recall, 4)
            mode_data["f1"] = round(report.overall_f1, 4)
            mode_data["ftpm"] = round(report.ftpm, 2)
            mode_data["mean_dt_ms"] = round(report.overall_mean_dt_ms, 2)

        results[mode] = mode_data

    return results


def run_ablation_gating(
    frames: list[Frame],
    ground_truth: list[dict[str, Any]] | list[GroundTruthEvent] | LabelDataset,
) -> dict[str, Any]:
    """Ablation 2: Compare Position-only vs Position+Velocity Jump/Duck gating."""
    # 1. Position-only: zero velocity thresholds
    pos_only_config = GestureConfig(
        jump_vel_thresh=0.0,
        duck_vel_thresh=0.0,
    )
    detector_pos = GestureDetector(config=pos_only_config)
    report_pos = evaluate_recording(
        frames=frames,
        ground_truth=ground_truth,
        detector=detector_pos,
        recording_name="ablation_gating_position_only",
    )

    # 2. Position + Velocity gating (default config)
    vel_config = GestureConfig(
        jump_vel_thresh=0.60,
        duck_vel_thresh=-0.60,
    )
    detector_vel = GestureDetector(config=vel_config)
    report_vel = evaluate_recording(
        frames=frames,
        ground_truth=ground_truth,
        detector=detector_vel,
        recording_name="ablation_gating_pos_and_velocity",
    )

    jump_fp_pos = report_pos.gesture_metrics.get(
        report_pos.matches[0].gesture
        if report_pos.matches
        else list(report_pos.gesture_metrics.keys())[0]
    )
    fp_count = jump_fp_pos.fp if jump_fp_pos else 0

    return {
        "position_only": {
            "precision": round(report_pos.overall_precision, 4),
            "recall": round(report_pos.overall_recall, 4),
            "f1": round(report_pos.overall_f1, 4),
            "total_fp": report_pos.total_fp,
            "jump_fp": fp_count,
            "ftpm": round(report_pos.ftpm, 2),
            "report": report_pos.to_dict(),
        },
        "position_and_velocity": {
            "precision": round(report_vel.overall_precision, 4),
            "recall": round(report_vel.overall_recall, 4),
            "f1": round(report_vel.overall_f1, 4),
            "total_fp": report_vel.total_fp,
            "ftpm": round(report_vel.ftpm, 2),
            "report": report_vel.to_dict(),
        },
    }


def format_ablation_filters_markdown(results: dict[str, Any]) -> str:
    """Format filter ablation results as Markdown."""
    lines = [
        "### Ablation 1: Signal Smoothing Filter Comparison",
        "",
        "| Filter Mode | Torso Jitter (σ) | Precision | Recall | F1 | FTPM | Latency Δt (ms) |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
    ]
    for mode, data in results.items():
        jitter = data.get("torso_jitter_std", 0.0)
        p = f"{data.get('precision', 1.0) * 100:.1f}%" if "precision" in data else "N/A"
        r = f"{data.get('recall', 1.0) * 100:.1f}%" if "recall" in data else "N/A"
        f1 = f"{data.get('f1', 1.0):.2f}" if "f1" in data else "N/A"
        ftpm = f"{data.get('ftpm', 0.0):.1f}" if "ftpm" in data else "N/A"
        dt = f"{data.get('mean_dt_ms', 0.0):+.1f}" if "mean_dt_ms" in data else "N/A"
        lines.append(f"| `{mode}` | {jitter:.5f} | {p} | {r} | {f1} | {ftpm} | {dt} |")
    return "\n".join(lines)


def format_ablation_gating_markdown(results: dict[str, Any]) -> str:
    """Format velocity gating ablation results as Markdown."""
    lines = [
        "### Ablation 2: Jump/Duck Velocity Gating Comparison",
        "",
        "| Criteria | Precision | Recall | F1 Score | Total FP | FTPM |",
        "| :--- | :---: | :---: | :---: | :---: | :---: |",
    ]
    for name, data in results.items():
        p = f"{data['precision'] * 100:.1f}%"
        r = f"{data['recall'] * 100:.1f}%"
        f1 = f"{data['f1']:.2f}"
        fp = data["total_fp"]
        ftpm = f"{data['ftpm']:.2f}"
        lines.append(f"| `{name}` | {p} | {r} | {f1} | {fp} | {ftpm} |")
    return "\n".join(lines)
