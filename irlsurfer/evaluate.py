"""Temporal matching and evaluation suite for IRLSurfer gesture detection."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from irlsurfer.detector import GestureDetector, GestureEvent
from irlsurfer.label import GroundTruthEvent, LabelDataset
from irlsurfer.landmarks import Frame

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class MatchedPair:
    """A matched ground-truth and predicted gesture event pair."""

    gesture: GestureEvent
    gt_time: float
    pred_time: float
    dt: float  # pred_time - gt_time


@dataclass(slots=True)
class GestureMetrics:
    """Evaluation metrics for a single gesture class."""

    gesture: GestureEvent
    gt_count: int
    pred_count: int
    tp: int
    fp: int
    fn: int
    precision: float
    recall: float
    f1: float
    mean_dt_ms: float


@dataclass(slots=True)
class EvaluationReport:
    """Comprehensive evaluation report for a recording evaluation run."""

    recording_name: str
    duration_sec: float
    tolerance_sec: float
    gesture_metrics: dict[GestureEvent, GestureMetrics]
    total_gt: int
    total_pred: int
    total_tp: int
    total_fp: int
    total_fn: int
    overall_precision: float
    overall_recall: float
    overall_f1: float
    overall_mean_dt_ms: float
    ftpm: float
    matches: list[MatchedPair] = field(default_factory=list)
    predictions: list[tuple[float, GestureEvent]] = field(default_factory=list)
    ground_truths: list[GroundTruthEvent] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert report to dictionary."""
        return {
            "recording_name": self.recording_name,
            "duration_sec": round(self.duration_sec, 3),
            "tolerance_sec": round(self.tolerance_sec, 4),
            "total_gt": self.total_gt,
            "total_pred": self.total_pred,
            "total_tp": self.total_tp,
            "total_fp": self.total_fp,
            "total_fn": self.total_fn,
            "overall_precision": round(self.overall_precision, 4),
            "overall_recall": round(self.overall_recall, 4),
            "overall_f1": round(self.overall_f1, 4),
            "overall_mean_dt_ms": round(self.overall_mean_dt_ms, 2),
            "ftpm": round(self.ftpm, 2),
            "gestures": {
                g.value: {
                    "gt": m.gt_count,
                    "pred": m.pred_count,
                    "tp": m.tp,
                    "fp": m.fp,
                    "fn": m.fn,
                    "precision": round(m.precision, 4),
                    "recall": round(m.recall, 4),
                    "f1": round(m.f1, 4),
                    "mean_dt_ms": round(m.mean_dt_ms, 2),
                }
                for g, m in self.gesture_metrics.items()
            },
        }

    def to_text(self) -> str:
        """Render evaluation report as formatted ASCII text table."""
        hdr_rec = (
            f"Recording: {self.recording_name} "
            f"(Duration: {self.duration_sec:.1f}s, Tolerance: ±{self.tolerance_sec * 1000.0:.0f}ms)"
        )
        lines = [
            "=" * 100,
            "IRLSurfer Detection Evaluation Report",
            hdr_rec,
            "=" * 100,
            (
                f"{'Gesture':<15} {'GT':>4} {'Pred':>6} {'TP':>6} {'FP':>6} {'FN':>6} "
                f"{'Precision':>12} {'Recall':>12} {'F1':>10} {'Mean Δt (ms)':>14}"
            ),
            "-" * 100,
        ]

        for g in GestureEvent:
            m = self.gesture_metrics.get(
                g,
                GestureMetrics(
                    gesture=g,
                    gt_count=0,
                    pred_count=0,
                    tp=0,
                    fp=0,
                    fn=0,
                    precision=1.0,
                    recall=1.0,
                    f1=1.0,
                    mean_dt_ms=0.0,
                ),
            )
            dt_str = f"{m.mean_dt_ms:+.1f}" if m.tp > 0 else "N/A"
            lines.append(
                f"{g.value:<15} {m.gt_count:>4} {m.pred_count:>6} {m.tp:>6} "
                f"{m.fp:>6} {m.fn:>6} {m.precision * 100:>11.2f}% "
                f"{m.recall * 100:>11.2f}% {m.f1:>10.2f} {dt_str:>14}"
            )

        lines.append("-" * 100)
        tot_dt_str = f"{self.overall_mean_dt_ms:+.1f}" if self.total_tp > 0 else "N/A"
        lines.append(
            f"{'TOTAL':<15} {self.total_gt:>4} {self.total_pred:>6} {self.total_tp:>6} "
            f"{self.total_fp:>6} {self.total_fn:>6} {self.overall_precision * 100:>11.2f}% "
            f"{self.overall_recall * 100:>11.2f}% {self.overall_f1:>10.2f} {tot_dt_str:>14}"
        )
        lines.append("=" * 100)
        lines.append(f"False Triggers Per Minute (FTPM): {self.ftpm:.2f} triggers/min")
        lines.append(f"Overall F1-Score: {self.overall_f1:.4f}")
        lines.append("=" * 100)
        return "\n".join(lines)

    def to_markdown(self) -> str:
        """Render evaluation report as GitHub Flavored Markdown."""
        lines = [
            f"### Evaluation Report: `{self.recording_name}`",
            "",
            f"- **Duration**: {self.duration_sec:.1f}s",
            f"- **Tolerance**: ±{self.tolerance_sec * 1000.0:.0f}ms",
            f"- **False Triggers Per Minute (FTPM)**: {self.ftpm:.2f} triggers/min",
            f"- **Overall F1-Score**: {self.overall_f1:.4f}",
            "",
            "| Gesture | GT | Pred | TP | FP | FN | Precision | Recall | F1 | Mean Δt (ms) |",
            "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
        ]

        for g in GestureEvent:
            m = self.gesture_metrics.get(
                g,
                GestureMetrics(
                    gesture=g,
                    gt_count=0,
                    pred_count=0,
                    tp=0,
                    fp=0,
                    fn=0,
                    precision=1.0,
                    recall=1.0,
                    f1=1.0,
                    mean_dt_ms=0.0,
                ),
            )
            dt_str = f"{m.mean_dt_ms:+.1f}" if m.tp > 0 else "N/A"
            lines.append(
                f"| `{g.value}` | {m.gt_count} | {m.pred_count} | {m.tp} | {m.fp} | {m.fn} | "
                f"{m.precision * 100:.2f}% | {m.recall * 100:.2f}% | {m.f1:.2f} | {dt_str} |"
            )

        tot_dt_str = f"{self.overall_mean_dt_ms:+.1f}" if self.total_tp > 0 else "N/A"
        lines.append(
            f"| **TOTAL** | **{self.total_gt}** | **{self.total_pred}** | **{self.total_tp}** | "
            f"**{self.total_fp}** | **{self.total_fn}** | "
            f"**{self.overall_precision * 100:.2f}%** | "
            f"**{self.overall_recall * 100:.2f}%** | **{self.overall_f1:.2f}** | **{tot_dt_str}** |"
        )
        return "\n".join(lines)


def _compute_f1(precision: float, recall: float) -> float:
    if precision + recall <= 0.0:
        return 0.0
    return (2.0 * precision * recall) / (precision + recall)


def evaluate_recording(
    frames: list[Frame],
    ground_truth: list[dict[str, Any]] | list[GroundTruthEvent] | LabelDataset,
    detector: GestureDetector,
    tolerance_sec: float = 0.15,
    recording_name: str = "recording",
) -> EvaluationReport:
    """Replay frames through detector and evaluate predictions against ground truth."""
    # 1. Parse and validate ground truth
    gt_events: list[GroundTruthEvent]
    if isinstance(ground_truth, LabelDataset):
        gt_events = list(ground_truth.events)
    elif isinstance(ground_truth, list):
        gt_events = []
        for item in ground_truth:
            if isinstance(item, GroundTruthEvent):
                gt_events.append(item)
            elif isinstance(item, dict):
                gt_events.append(GroundTruthEvent.from_dict(item))
            else:
                raise TypeError(f"Unsupported ground truth item type: {type(item)}")
    else:
        raise TypeError(f"Unsupported ground truth type: {type(ground_truth)}")

    gt_events.sort(key=lambda e: e.timestamp)

    # 2. Replay frames through detector and collect predicted events
    predictions: list[tuple[float, GestureEvent]] = []
    for frame in frames:
        events = detector.process_frame(frame)
        for ev in events:
            predictions.append((frame.timestamp, ev))

    # Calculate duration
    if len(frames) >= 2:
        duration_sec = max(0.0, frames[-1].timestamp - frames[0].timestamp)
    elif frames:
        duration_sec = 0.033
    else:
        duration_sec = 0.0

    # 3. Match predictions with ground truth per gesture category
    all_matches: list[MatchedPair] = []
    gesture_metrics: dict[GestureEvent, GestureMetrics] = {}

    total_gt = len(gt_events)
    total_pred = len(predictions)

    for gesture in GestureEvent:
        cat_gt = [e for e in gt_events if e.gesture == gesture]
        cat_pred = [p for p in predictions if p[1] == gesture]

        # Greedy nearest bipartite matching within tolerance
        candidates: list[tuple[float, int, int]] = []
        for gi, gt_ev in enumerate(cat_gt):
            for pi, pred in enumerate(cat_pred):
                diff = abs(gt_ev.timestamp - pred[0])
                if diff <= tolerance_sec:
                    candidates.append((diff, gi, pi))

        # Sort candidates ascending by temporal difference
        candidates.sort(key=lambda c: c[0])

        matched_gt: set[int] = set()
        matched_pred: set[int] = set()
        cat_matches: list[MatchedPair] = []

        for _, gi, pi in candidates:
            if gi not in matched_gt and pi not in matched_pred:
                matched_gt.add(gi)
                matched_pred.add(pi)
                dt = cat_pred[pi][0] - cat_gt[gi].timestamp
                cat_matches.append(
                    MatchedPair(
                        gesture=gesture,
                        gt_time=cat_gt[gi].timestamp,
                        pred_time=cat_pred[pi][0],
                        dt=dt,
                    )
                )

        tp = len(matched_gt)
        fp = len(cat_pred) - tp
        fn = len(cat_gt) - tp

        precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
        f1 = _compute_f1(precision, recall) if (tp + fp + fn) > 0 else 1.0

        mean_dt_ms = (sum(m.dt for m in cat_matches) / tp) * 1000.0 if tp > 0 else 0.0

        gesture_metrics[gesture] = GestureMetrics(
            gesture=gesture,
            gt_count=len(cat_gt),
            pred_count=len(cat_pred),
            tp=tp,
            fp=fp,
            fn=fn,
            precision=precision,
            recall=recall,
            f1=f1,
            mean_dt_ms=mean_dt_ms,
        )
        all_matches.extend(cat_matches)

    # 4. Overall metrics across all gestures
    total_tp = len(all_matches)
    total_fp = total_pred - total_tp
    total_fn = total_gt - total_tp

    overall_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 1.0
    overall_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 1.0
    overall_f1 = (
        _compute_f1(overall_precision, overall_recall)
        if (total_tp + total_fp + total_fn) > 0
        else 1.0
    )

    overall_mean_dt_ms = (
        (sum(m.dt for m in all_matches) / total_tp) * 1000.0 if total_tp > 0 else 0.0
    )

    # False triggers per minute
    duration_min = duration_sec / 60.0
    ftpm = total_fp / duration_min if duration_min > 0.0 else 0.0

    return EvaluationReport(
        recording_name=recording_name,
        duration_sec=duration_sec,
        tolerance_sec=tolerance_sec,
        gesture_metrics=gesture_metrics,
        total_gt=total_gt,
        total_pred=total_pred,
        total_tp=total_tp,
        total_fp=total_fp,
        total_fn=total_fn,
        overall_precision=overall_precision,
        overall_recall=overall_recall,
        overall_f1=overall_f1,
        overall_mean_dt_ms=overall_mean_dt_ms,
        ftpm=ftpm,
        matches=all_matches,
        predictions=predictions,
        ground_truths=gt_events,
    )


def evaluate_files(
    recording_path: Path | str,
    label_path: Path | str,
    config_path: Path | str | None = None,
    tolerance_sec: float = 0.15,
) -> EvaluationReport:
    """Load recording and label files and run evaluation."""
    from irlsurfer.detector import GestureConfig
    from irlsurfer.record import LandmarkRecorder

    rec_p = Path(recording_path)
    lbl_p = Path(label_path)

    metadata, frames = LandmarkRecorder.load(rec_p)
    dataset = LabelDataset.load(lbl_p)

    config = (
        GestureConfig.from_json_file(config_path) if config_path is not None else GestureConfig()
    )
    detector = GestureDetector(config=config)

    rec_name = metadata.get("recording_name", rec_p.name)
    return evaluate_recording(
        frames=frames,
        ground_truth=dataset,
        detector=detector,
        tolerance_sec=tolerance_sec,
        recording_name=rec_name,
    )
