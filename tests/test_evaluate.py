"""Tests for evaluation metrics and temporal matching (irlsurfer/evaluate.py)."""

from __future__ import annotations

from pathlib import Path

from irlsurfer.detector import GestureEvent
from irlsurfer.evaluate import (
    EvaluationReport,
    evaluate_files,
    evaluate_recording,
)
from irlsurfer.label import GroundTruthEvent, LabelDataset
from irlsurfer.landmarks import Frame, Landmark
from irlsurfer.record import LandmarkRecorder


def _dummy_frame(t: float) -> Frame:
    return Frame(
        timestamp=t,
        left_shoulder=Landmark(x=0.6, y=0.4),
        right_shoulder=Landmark(x=0.4, y=0.4),
        left_hip=Landmark(x=0.6, y=0.7),
        right_hip=Landmark(x=0.4, y=0.7),
        left_wrist=Landmark(x=0.7, y=0.6),
        right_wrist=Landmark(x=0.3, y=0.6),
    )


class MockDetector:
    """Mock detector that emits predefined events at predefined timestamps."""

    def __init__(self, scripted: list[tuple[float, list[GestureEvent]]]) -> None:
        self.scripted = dict(scripted)

    def process_frame(self, frame: Frame) -> list[GestureEvent]:
        return self.scripted.get(frame.timestamp, [])


def test_exact_matches() -> None:
    frames = [_dummy_frame(1.0), _dummy_frame(2.0), _dummy_frame(3.0)]
    gt = [
        GroundTruthEvent(timestamp=1.0, gesture=GestureEvent.LANE_LEFT),
        GroundTruthEvent(timestamp=2.0, gesture=GestureEvent.JUMP),
    ]

    mock = MockDetector(
        [
            (1.0, [GestureEvent.LANE_LEFT]),
            (2.0, [GestureEvent.JUMP]),
        ]
    )

    report = evaluate_recording(
        frames=frames,
        ground_truth=gt,
        detector=mock,  # type: ignore[arg-type]
        tolerance_sec=0.15,
    )

    assert report.total_gt == 2
    assert report.total_pred == 2
    assert report.total_tp == 2
    assert report.total_fp == 0
    assert report.total_fn == 0
    assert report.overall_precision == 1.0
    assert report.overall_recall == 1.0
    assert report.overall_f1 == 1.0
    assert report.overall_mean_dt_ms == 0.0


def test_jitter_tolerance() -> None:
    frames = [_dummy_frame(1.10), _dummy_frame(2.20), _dummy_frame(3.0)]
    gt = [
        # diff 0.10s <= 0.15s (MATCH)
        GroundTruthEvent(timestamp=1.0, gesture=GestureEvent.LANE_LEFT),
        # diff 0.20s > 0.15s (NO MATCH)
        GroundTruthEvent(timestamp=2.0, gesture=GestureEvent.JUMP),
    ]

    mock = MockDetector(
        [
            (1.10, [GestureEvent.LANE_LEFT]),
            (2.20, [GestureEvent.JUMP]),
        ]
    )

    report = evaluate_recording(
        frames=frames,
        ground_truth=gt,
        detector=mock,  # type: ignore[arg-type]
        tolerance_sec=0.15,
    )

    assert report.total_tp == 1
    assert report.total_fp == 1
    assert report.total_fn == 1
    assert report.overall_precision == 0.5
    assert report.overall_recall == 0.5


def test_duplicate_suppression() -> None:
    # 1 GT event at 1.0s, but 2 predictions at 1.02s and 1.05s
    frames = [_dummy_frame(1.02), _dummy_frame(1.05), _dummy_frame(2.0)]
    gt = [GroundTruthEvent(timestamp=1.0, gesture=GestureEvent.JUMP)]

    mock = MockDetector(
        [
            (1.02, [GestureEvent.JUMP]),
            (1.05, [GestureEvent.JUMP]),
        ]
    )

    report = evaluate_recording(
        frames=frames,
        ground_truth=gt,
        detector=mock,  # type: ignore[arg-type]
        tolerance_sec=0.15,
    )

    # Only one should match, second prediction becomes FP
    assert report.total_tp == 1
    assert report.total_fp == 1
    assert report.total_fn == 0
    assert report.overall_precision == 0.5
    assert report.overall_recall == 1.0


def test_ftpm_idle_recording() -> None:
    # 60 seconds duration (frames from 0 to 60)
    frames = [_dummy_frame(float(i)) for i in range(61)]
    gt: list[GroundTruthEvent] = []

    # 3 false triggers over 1 minute
    mock = MockDetector(
        [
            (10.0, [GestureEvent.JUMP]),
            (20.0, [GestureEvent.DUCK]),
            (30.0, [GestureEvent.LANE_RIGHT]),
        ]
    )

    report = evaluate_recording(
        frames=frames,
        ground_truth=gt,
        detector=mock,  # type: ignore[arg-type]
    )

    assert report.total_gt == 0
    assert report.total_pred == 3
    assert report.total_tp == 0
    assert report.total_fp == 3
    assert report.ftpm == 3.0  # 3 false triggers / 1 minute = 3.0 FTPM


def test_report_formatting() -> None:
    frames = [_dummy_frame(0.0), _dummy_frame(5.01), _dummy_frame(10.0)]
    gt = [GroundTruthEvent(timestamp=5.0, gesture=GestureEvent.LANE_LEFT)]
    mock = MockDetector([(5.01, [GestureEvent.LANE_LEFT])])

    report = evaluate_recording(
        frames=frames,
        ground_truth=gt,
        detector=mock,  # type: ignore[arg-type]
        recording_name="test_clip",
    )

    text_out = report.to_text()
    assert "IRLSurfer Detection Evaluation Report" in text_out
    assert "LANE_LEFT" in text_out
    assert "Overall F1-Score: 1.0000" in text_out

    md_out = report.to_markdown()
    assert "### Evaluation Report: `test_clip`" in md_out
    assert "| `LANE_LEFT` |" in md_out

    d = report.to_dict()
    assert d["recording_name"] == "test_clip"
    assert d["overall_f1"] == 1.0


def test_evaluate_files(tmp_path: Path) -> None:
    rec_file = tmp_path / "rec.json"
    lbl_file = tmp_path / "lbl.json"

    frames = [_dummy_frame(0.0), _dummy_frame(1.0), _dummy_frame(2.0)]
    recorder = LandmarkRecorder(output_path=rec_file, recording_name="file_test")
    recorder.frames = frames
    recorder.save()

    dataset = LabelDataset(
        recording_file=str(rec_file),
        events=[GroundTruthEvent(timestamp=1.0, gesture=GestureEvent.LANE_LEFT)],
    )
    dataset.save(lbl_file)

    report = evaluate_files(rec_file, lbl_file)
    assert isinstance(report, EvaluationReport)
    assert report.recording_name == "file_test"
