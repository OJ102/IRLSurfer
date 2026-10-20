"""Tests for benchmarking and ablation studies (irlsurfer/bench.py)."""

from __future__ import annotations

import pytest

from irlsurfer.bench import (
    EMAFilter2D,
    LatencyProfiler,
    format_ablation_filters_markdown,
    format_ablation_gating_markdown,
    run_ablation_filters,
    run_ablation_gating,
)
from irlsurfer.detector import GestureEvent
from irlsurfer.label import GroundTruthEvent, LabelDataset
from irlsurfer.landmarks import Frame, Landmark


@pytest.fixture
def sample_frames() -> list[Frame]:
    frames: list[Frame] = []
    for i in range(30):
        t = i * 0.033
        frames.append(
            Frame(
                timestamp=t,
                left_shoulder=Landmark(x=0.60, y=0.40),
                right_shoulder=Landmark(x=0.40, y=0.40),
                left_hip=Landmark(x=0.60, y=0.70),
                right_hip=Landmark(x=0.40, y=0.70),
                left_wrist=Landmark(x=0.65, y=0.55),
                right_wrist=Landmark(x=0.35, y=0.55),
                nose=Landmark(x=0.50, y=0.25),
            )
        )
    return frames


def test_ema_filter_2d() -> None:
    flt = EMAFilter2D(alpha=0.5)
    x1, y1 = flt.filter(1.0, 2.0)
    assert x1 == 1.0 and y1 == 2.0

    x2, y2 = flt.filter(2.0, 4.0)
    assert x2 == pytest.approx(1.5)
    assert y2 == pytest.approx(3.0)

    flt.reset()
    assert flt.prev_x is None


def test_latency_profiler_record_and_compute() -> None:
    profiler = LatencyProfiler()
    for v in [1.0, 2.0, 3.0, 4.0, 5.0]:
        profiler.record("Test Stage", v)

    stats = profiler.compute_stats("Test Stage")
    assert stats.stage == "Test Stage"
    assert stats.samples == 5
    assert stats.mean_ms == pytest.approx(3.0)
    assert stats.p50_ms == pytest.approx(3.0)
    assert stats.p95_ms <= 5.0
    assert stats.fps == pytest.approx(1000.0 / 3.0)

    md = profiler.to_markdown()
    assert "Test Stage" in md
    assert "Latency Profiling Report" in md


def test_latency_profiler_pipeline(sample_frames: list[Frame]) -> None:
    profiler = LatencyProfiler()
    stats = profiler.profile_pipeline(frames=sample_frames, iterations=20, include_pose=False)

    assert "Signal Filter" in stats
    assert "Detector Step" in stats
    assert "HUD Render" in stats
    assert "End-to-End Frame" in stats
    assert stats["Detector Step"].samples == 20
    assert stats["HUD Render"].mean_ms > 0.0


def test_ablation_filters(sample_frames: list[Frame]) -> None:
    results = run_ablation_filters(sample_frames, ground_truth=None)
    assert "raw" in results
    assert "ema" in results
    assert "one_euro" in results
    assert "torso_jitter_std" in results["raw"]

    md = format_ablation_filters_markdown(results)
    assert "Ablation 1: Signal Smoothing Filter Comparison" in md
    assert "`raw`" in md
    assert "`ema`" in md
    assert "`one_euro`" in md


def test_ablation_gating(sample_frames: list[Frame]) -> None:
    dataset = LabelDataset(
        recording_file="mock.json",
        events=[GroundTruthEvent(timestamp=1.0, gesture=GestureEvent.JUMP)],
    )

    results = run_ablation_gating(sample_frames, ground_truth=dataset)
    assert "position_only" in results
    assert "position_and_velocity" in results
    assert "f1" in results["position_only"]
    assert "f1" in results["position_and_velocity"]

    md = format_ablation_gating_markdown(results)
    assert "Ablation 2: Jump/Duck Velocity Gating Comparison" in md
    assert "`position_only`" in md
    assert "`position_and_velocity`" in md
