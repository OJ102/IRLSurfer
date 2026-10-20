"""Tests for ground-truth labeling and datasets (irlsurfer/label.py)."""

from __future__ import annotations

from pathlib import Path

import pytest

from irlsurfer.detector import GestureEvent
from irlsurfer.label import GroundTruthEvent, LabelDataset, label_recording
from irlsurfer.landmarks import Frame, Landmark
from irlsurfer.record import LandmarkRecorder


def test_ground_truth_event_serialization() -> None:
    ev = GroundTruthEvent(timestamp=3.14159, gesture=GestureEvent.JUMP)
    d = ev.to_dict()
    assert d == {"timestamp": 3.1416, "gesture": "JUMP"}

    restored = GroundTruthEvent.from_dict(d)
    assert restored.timestamp == 3.1416
    assert restored.gesture == GestureEvent.JUMP


def test_label_dataset_add_event_sorting() -> None:
    ds = LabelDataset(recording_file="test.json")
    ds.add_event(5.0, GestureEvent.DUCK)
    ds.add_event(2.0, "LANE_LEFT")
    ds.add_event(3.5, GestureEvent.JUMP)

    assert len(ds.events) == 3
    assert [e.timestamp for e in ds.events] == [2.0, 3.5, 5.0]
    assert [e.gesture for e in ds.events] == [
        GestureEvent.LANE_LEFT,
        GestureEvent.JUMP,
        GestureEvent.DUCK,
    ]


def test_label_dataset_remove_last_event() -> None:
    ds = LabelDataset(recording_file="test.json")
    assert ds.remove_last_event() is None

    ds.add_event(1.0, GestureEvent.JUMP)
    ds.add_event(2.0, GestureEvent.DUCK)

    removed = ds.remove_last_event()
    assert removed is not None
    assert removed.gesture == GestureEvent.DUCK
    assert len(ds.events) == 1


def test_label_dataset_validation() -> None:
    ds = LabelDataset(recording_file="test.json")
    ds.events = [
        GroundTruthEvent(timestamp=1.0, gesture=GestureEvent.JUMP),
        GroundTruthEvent(timestamp=2.0, gesture=GestureEvent.DUCK),
    ]
    ds.validate()  # Passes cleanly

    # Negative timestamp
    ds_neg = LabelDataset(recording_file="test.json")
    ds_neg.events = [GroundTruthEvent(timestamp=-0.5, gesture=GestureEvent.JUMP)]
    with pytest.raises(ValueError, match="negative timestamp"):
        ds_neg.validate()

    # Out-of-order timestamp
    ds_unordered = LabelDataset(recording_file="test.json")
    ds_unordered.events = [
        GroundTruthEvent(timestamp=3.0, gesture=GestureEvent.JUMP),
        GroundTruthEvent(timestamp=2.0, gesture=GestureEvent.DUCK),
    ]
    with pytest.raises(ValueError, match="not chronological"):
        ds_unordered.validate()


def test_label_dataset_roundtrip(tmp_path: Path) -> None:
    lbl_file = tmp_path / "labels.json"
    ds = LabelDataset(recording_file="data/test_rec.json")
    ds.add_event(1.5, GestureEvent.LANE_RIGHT)
    ds.add_event(4.2, GestureEvent.HOVERBOARD)

    saved = ds.save(lbl_file)
    assert saved.exists()

    loaded = LabelDataset.load(lbl_file)
    assert loaded.recording_file == "data/test_rec.json"
    assert len(loaded.events) == 2
    assert loaded.events[0].gesture == GestureEvent.LANE_RIGHT
    assert loaded.events[1].gesture == GestureEvent.HOVERBOARD


def test_label_recording_headless(tmp_path: Path) -> None:
    rec_file = tmp_path / "sample_rec.json"
    lbl_file = tmp_path / "sample_lbl.json"

    recorder = LandmarkRecorder(output_path=rec_file)
    recorder.add_frame(
        Frame(
            timestamp=0.1,
            left_shoulder=Landmark(x=0.6, y=0.4),
            right_shoulder=Landmark(x=0.4, y=0.4),
            left_hip=Landmark(x=0.6, y=0.7),
            right_hip=Landmark(x=0.4, y=0.7),
            left_wrist=Landmark(x=0.7, y=0.6),
            right_wrist=Landmark(x=0.3, y=0.6),
        )
    )
    recorder.save()

    dataset = label_recording(
        recording_path=rec_file,
        output_path=lbl_file,
        headless=True,
    )
    assert lbl_file.exists()
    assert dataset.recording_file == str(rec_file)
