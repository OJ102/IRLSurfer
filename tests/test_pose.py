"""Unit tests for MediaPipe Pose Landmarker wrapper and model manager."""

from __future__ import annotations

import io
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from irlsurfer.pose import PoseExtractor, ensure_model_file


class MockHTTPResponse:
    """Mock urllib response object."""

    def __init__(self, data: bytes) -> None:
        self._data = io.BytesIO(data)

    def read(self, size: int = -1) -> bytes:
        return self._data.read(size)

    def __enter__(self) -> MockHTTPResponse:
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        pass


def test_ensure_model_file_invalid_type(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="Unknown model_type 'invalid'"):
        ensure_model_file(model_type="invalid", cache_dir=tmp_path)


def test_ensure_model_file_cache_hit(tmp_path: Path) -> None:
    model_file = tmp_path / "pose_landmarker_lite.task"
    model_file.write_bytes(b"mock model payload")

    with patch("urllib.request.urlopen") as mock_urlopen:
        result = ensure_model_file(model_type="lite", cache_dir=tmp_path)
        assert result == model_file
        mock_urlopen.assert_not_called()


def test_ensure_model_file_download_success(tmp_path: Path) -> None:
    expected_data = b"mediapipe model binary chunk"

    with patch("urllib.request.urlopen", return_value=MockHTTPResponse(expected_data)):
        result = ensure_model_file(model_type="lite", cache_dir=tmp_path)
        assert result.exists()
        assert result.read_bytes() == expected_data
        assert result.name == "pose_landmarker_lite.task"
        # Verify tmp file was cleaned up / renamed
        assert not (tmp_path / "pose_landmarker_lite.task.tmp").exists()


def test_ensure_model_file_network_error(tmp_path: Path) -> None:
    with (
        patch(
            "urllib.request.urlopen",
            side_effect=urllib.error.URLError("Connection refused"),
        ),
        pytest.raises(RuntimeError, match="Failed to download MediaPipe pose model 'lite'"),
    ):
        ensure_model_file(model_type="lite", cache_dir=tmp_path)

    # Ensure tmp file does not persist after error
    assert not (tmp_path / "pose_landmarker_lite.task.tmp").exists()


def test_pose_extractor_with_mock_landmarker() -> None:
    mock_landmarker = MagicMock()
    extractor = PoseExtractor(landmarker=mock_landmarker)

    # Context manager test
    with extractor as ext:
        assert ext is extractor

    # Close test
    mock_landmarker.close.assert_called_once()
    assert extractor._landmarker is None
    assert extractor.extract(np.zeros((100, 100, 3), dtype=np.uint8)) is None


def test_pose_extractor_extract_valid_pose() -> None:
    class MockLandmark:
        def __init__(self, x: float, y: float, z: float = 0.0, visibility: float = 1.0) -> None:
            self.x = x
            self.y = y
            self.z = z
            self.visibility = visibility

    # 33 landmarks for MediaPipe pose
    mock_lms = [MockLandmark(0.5, 0.5) for _ in range(33)]
    mock_lms[11] = MockLandmark(0.4, 0.3)  # left shoulder
    mock_lms[12] = MockLandmark(0.6, 0.3)  # right shoulder
    mock_lms[23] = MockLandmark(0.45, 0.7)  # left hip
    mock_lms[24] = MockLandmark(0.55, 0.7)  # right hip
    mock_lms[15] = MockLandmark(0.3, 0.5)  # left wrist
    mock_lms[16] = MockLandmark(0.7, 0.5)  # right wrist
    mock_lms[0] = MockLandmark(0.5, 0.2)  # nose

    mock_result = MagicMock()
    mock_result.pose_landmarks = [mock_lms]

    mock_landmarker = MagicMock()
    mock_landmarker.detect.return_value = mock_result

    extractor = PoseExtractor(landmarker=mock_landmarker)
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    with patch("mediapipe.Image"):
        frame = extractor.extract(img, timestamp_s=123.45)
    assert frame is not None
    assert frame.timestamp == 123.45
    assert frame.left_shoulder.x == 0.4
    assert frame.right_shoulder.x == 0.6
    assert frame.nose is not None and frame.nose.x == 0.5


def test_pose_extractor_extract_no_pose() -> None:
    mock_result = MagicMock()
    mock_result.pose_landmarks = []

    mock_landmarker = MagicMock()
    mock_landmarker.detect.return_value = mock_result

    extractor = PoseExtractor(landmarker=mock_landmarker)
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    with patch("mediapipe.Image"):
        frame = extractor.extract(img, timestamp_s=1.0)
    assert frame is None


def test_pose_extractor_extract_empty_or_few_landmarks() -> None:
    mock_landmarker = MagicMock()
    extractor = PoseExtractor(landmarker=mock_landmarker)

    # Empty frame should return None immediately without calling detect
    assert extractor.extract(np.zeros((0, 0, 3), dtype=np.uint8)) is None
    mock_landmarker.detect.assert_not_called()

    # Landmarks fewer than 25 (insufficient body pose)
    mock_result = MagicMock()
    mock_result.pose_landmarks = [[MagicMock() for _ in range(20)]]
    mock_landmarker.detect.return_value = mock_result
    with patch("mediapipe.Image"):
        assert extractor.extract(np.zeros((100, 100, 3), dtype=np.uint8)) is None
