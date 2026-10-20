"""MediaPipe Pose Landmarker wrapper and model manager for IRLSurfer."""

from __future__ import annotations

import logging
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    RunningMode,
)

from irlsurfer.landmarks import Frame

logger = logging.getLogger(__name__)

MODEL_URLS: dict[str, str] = {
    "lite": (
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
    ),
    "full": (
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_full/float16/latest/pose_landmarker_full.task"
    ),
    "heavy": (
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
    ),
}


def get_default_cache_dir() -> Path:
    """Return default model cache directory."""
    cache_env = os.getenv("IRLSURFER_CACHE_DIR")
    if cache_env:
        return Path(cache_env)
    return Path.home() / ".cache" / "irlsurfer" / "models"


def ensure_model_file(
    model_type: str = "lite",
    cache_dir: Path | str | None = None,
) -> Path:
    """Verify model asset exists in cache; if missing, download atomically.

    Raises:
        ValueError: If model_type is unknown.
        RuntimeError: If download fails and file is not present.
    """
    if model_type not in MODEL_URLS:
        raise ValueError(
            f"Unknown model_type '{model_type}'. Supported types: {list(MODEL_URLS.keys())}"
        )

    target_dir = Path(cache_dir) if cache_dir is not None else get_default_cache_dir()
    target_dir.mkdir(parents=True, exist_ok=True)

    dest_file = target_dir / f"pose_landmarker_{model_type}.task"
    if dest_file.exists():
        return dest_file

    url = MODEL_URLS[model_type]
    tmp_file = target_dir / f"pose_landmarker_{model_type}.task.tmp"

    logger.info("Downloading MediaPipe '%s' pose model from %s...", model_type, url)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "IRLSurfer/0.1.0"})
        with urllib.request.urlopen(req, timeout=30.0) as response, open(tmp_file, "wb") as out_f:
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                out_f.write(chunk)
        tmp_file.replace(dest_file)
        logger.info("Model saved to %s", dest_file)
    except Exception as exc:
        if tmp_file.exists():
            tmp_file.unlink(missing_ok=True)
        raise RuntimeError(
            f"Failed to download MediaPipe pose model '{model_type}' from {url}. "
            f"Please download it manually and place it at {dest_file}. "
            f"Underlying error: {exc}"
        ) from exc

    return dest_file


class PoseExtractor:
    """Extracts IRLSurfer Frame dataclass from camera frames via MediaPipe Tasks."""

    def __init__(
        self,
        model_type: str = "lite",
        model_path: Path | str | None = None,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
        landmarker: Any | None = None,
    ) -> None:
        if landmarker is not None:
            self._landmarker: Any | None = landmarker
            self.model_path: Path | None = Path(model_path) if model_path else None
            return

        if model_path is None:
            self.model_path = ensure_model_file(model_type=model_type)
        else:
            self.model_path = Path(model_path)

        base_options = BaseOptions(model_asset_path=str(self.model_path))
        options = PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=RunningMode.IMAGE,
            min_pose_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
            num_poses=1,
        )
        self._landmarker = PoseLandmarker.create_from_options(options)

    def extract(
        self,
        image_bgr: np.ndarray[Any, Any],
        timestamp_s: float = 0.0,
        timestamp: float | None = None,
    ) -> Frame | None:
        """Extract landmarks from a BGR image and build a Frame instance.

        Returns None if no human body is detected or if landmarker is closed.
        """
        if (
            self._landmarker is None
            or image_bgr is None
            or image_bgr.size == 0
            or image_bgr.shape[0] == 0
            or image_bgr.shape[1] == 0
        ):
            return None

        ts = timestamp if timestamp is not None else timestamp_s

        image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        result = self._landmarker.detect(mp_image)

        if not result.pose_landmarks or len(result.pose_landmarks) == 0:
            return None

        raw_landmarks = result.pose_landmarks[0]
        if len(raw_landmarks) < 25:
            return None

        return Frame.from_mediapipe(raw_landmarks, timestamp=ts)

    def close(self) -> None:
        """Cleanly close underlying landmarker."""
        if self._landmarker is not None:
            if hasattr(self._landmarker, "close"):
                self._landmarker.close()
            self._landmarker = None

    def __enter__(self) -> PoseExtractor:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: Any,
    ) -> None:
        self.close()
