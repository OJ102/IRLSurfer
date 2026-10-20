"""Tests for landmark recording and serialization (irlsurfer/record.py)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from irlsurfer.landmarks import Frame, Landmark
from irlsurfer.record import LandmarkRecorder, frame_to_dict, landmark_to_dict, record_live


@pytest.fixture
def sample_frame() -> Frame:
    return Frame(
        timestamp=1.234,
        left_shoulder=Landmark(x=0.55, y=0.35, z=0.01, visibility=0.99),
        right_shoulder=Landmark(x=0.45, y=0.35, z=0.01, visibility=0.98),
        left_hip=Landmark(x=0.55, y=0.65, z=0.02, visibility=0.97),
        right_hip=Landmark(x=0.45, y=0.65, z=0.02, visibility=0.96),
        left_wrist=Landmark(x=0.65, y=0.50, z=0.03, visibility=0.95),
        right_wrist=Landmark(x=0.35, y=0.50, z=0.03, visibility=0.94),
        nose=Landmark(x=0.50, y=0.25, z=0.00, visibility=0.99),
    )


def test_landmark_to_dict(sample_frame: Frame) -> None:
    d = landmark_to_dict(sample_frame.left_shoulder)
    assert d == {"x": 0.55, "y": 0.35, "z": 0.01, "visibility": 0.99}


def test_frame_to_dict_and_back(sample_frame: Frame) -> None:
    d = frame_to_dict(sample_frame)
    assert d["timestamp"] == 1.234
    assert "left_shoulder" in d
    assert "nose" in d

    restored = Frame.from_dict(d)
    assert restored.timestamp == sample_frame.timestamp
    assert restored.left_shoulder.x == sample_frame.left_shoulder.x
    assert sample_frame.nose is not None
    assert restored.nose is not None
    assert restored.nose.y == sample_frame.nose.y


def test_recorder_empty(tmp_path: Path) -> None:
    rec_file = tmp_path / "empty.json"
    recorder = LandmarkRecorder(output_path=rec_file, note="Empty test")
    assert recorder.duration_sec == 0.0

    out_path = recorder.save()
    assert out_path == rec_file
    assert out_path.exists()

    metadata, frames = LandmarkRecorder.load(rec_file)
    assert metadata["frame_count"] == 0
    assert metadata["duration_sec"] == 0.0
    assert frames == []


def test_recorder_ingestion_and_roundtrip(tmp_path: Path, sample_frame: Frame) -> None:
    rec_file = tmp_path / "roundtrip.json"
    recorder = LandmarkRecorder(output_path=rec_file, recording_name="roundtrip_test", fps=30.0)

    f1 = sample_frame
    f2 = Frame(
        timestamp=2.234,
        left_shoulder=sample_frame.left_shoulder,
        right_shoulder=sample_frame.right_shoulder,
        left_hip=sample_frame.left_hip,
        right_hip=sample_frame.right_hip,
        left_wrist=sample_frame.left_wrist,
        right_wrist=sample_frame.right_wrist,
        nose=None,
    )

    recorder.add_frame(f1)
    recorder.add_frame(f2)

    assert recorder.duration_sec == pytest.approx(1.0, abs=1e-3)
    saved_path = recorder.save()
    assert saved_path.exists()

    metadata, loaded_frames = LandmarkRecorder.load(saved_path)
    assert metadata["recording_name"] == "roundtrip_test"
    assert metadata["frame_count"] == 2
    assert metadata["duration_sec"] == pytest.approx(1.0, abs=1e-3)
    assert len(loaded_frames) == 2
    assert loaded_frames[0].timestamp == f1.timestamp
    assert loaded_frames[1].timestamp == f2.timestamp
    assert loaded_frames[1].nose is None


def test_recorder_save_missing_path() -> None:
    recorder = LandmarkRecorder()
    with pytest.raises(ValueError, match="No filepath specified"):
        recorder.save()


def test_recorder_load_missing_file() -> None:
    with pytest.raises(FileNotFoundError):
        LandmarkRecorder.load("non_existent_file.json")


def test_record_live_mocked(tmp_path: Path, sample_frame: Frame) -> None:
    out_file = tmp_path / "live_mock.json"

    mock_cap = MagicMock()
    mock_cap.isOpened.side_effect = [True, True, False]
    import numpy as np

    mock_cap.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))

    with (
        patch("cv2.VideoCapture", return_value=mock_cap),
        patch("cv2.imshow"),
        patch("cv2.waitKey", return_value=ord("q")),
        patch("cv2.destroyAllWindows"),
        patch("irlsurfer.pose.PoseExtractor") as mock_extractor_cls,
    ):
        mock_extractor = mock_extractor_cls.return_value
        mock_extractor.extract.return_value = sample_frame

        result = record_live(
            output_path=out_file,
            camera=0,
            duration=1.0,
            no_overlay=False,
        )

        assert result == out_file
        assert out_file.exists()
        with open(out_file, encoding="utf-8") as f:
            data = json.load(f)
        assert data["metadata"]["frame_count"] >= 1
