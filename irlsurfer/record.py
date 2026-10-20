"""Landmark stream recorder and serialization for IRLSurfer."""

from __future__ import annotations

import json
import logging
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from irlsurfer.landmarks import Frame, Landmark

logger = logging.getLogger(__name__)


def landmark_to_dict(lm: Landmark) -> dict[str, float]:
    """Serialize a Landmark dataclass to dictionary."""
    return {
        "x": round(lm.x, 6),
        "y": round(lm.y, 6),
        "z": round(lm.z, 6),
        "visibility": round(lm.visibility, 6),
    }


def frame_to_dict(frame: Frame) -> dict[str, Any]:
    """Serialize a Frame dataclass to dictionary."""
    data: dict[str, Any] = {
        "timestamp": round(frame.timestamp, 6),
        "left_shoulder": landmark_to_dict(frame.left_shoulder),
        "right_shoulder": landmark_to_dict(frame.right_shoulder),
        "left_hip": landmark_to_dict(frame.left_hip),
        "right_hip": landmark_to_dict(frame.right_hip),
        "left_wrist": landmark_to_dict(frame.left_wrist),
        "right_wrist": landmark_to_dict(frame.right_wrist),
    }
    if frame.nose is not None:
        data["nose"] = landmark_to_dict(frame.nose)
    return data


class LandmarkRecorder:
    """Records landmark frames and serializes them to JSON."""

    def __init__(
        self,
        output_path: Path | str | None = None,
        recording_name: str = "",
        fps: float = 30.0,
        note: str = "",
    ) -> None:
        self.output_path = Path(output_path) if output_path is not None else None
        self.recording_name = recording_name
        self.fps = float(fps)
        self.note = note
        self.frames: list[Frame] = []
        self.start_time: float | None = None

    def add_frame(self, frame: Frame) -> None:
        """Add a frame to the recording."""
        if self.start_time is None:
            self.start_time = frame.timestamp
        self.frames.append(frame)

    @property
    def duration_sec(self) -> float:
        """Calculate duration of the recording in seconds."""
        if len(self.frames) < 2:
            return 0.0
        return max(0.0, self.frames[-1].timestamp - self.frames[0].timestamp)

    def save(self, filepath: Path | str | None = None) -> Path:
        """Save recorded frames to disk with metadata."""
        target_path: Path
        if filepath is not None:
            target_path = Path(filepath)
        elif self.output_path is not None:
            target_path = self.output_path
        else:
            raise ValueError("No filepath specified and no output_path set in recorder.")

        target_path.parent.mkdir(parents=True, exist_ok=True)

        rec_name = self.recording_name or target_path.stem
        created_at = datetime.now(UTC).isoformat()
        duration = self.duration_sec

        # Compute empirical FPS if possible, otherwise use configured fps
        computed_fps = self.fps
        if duration > 0 and len(self.frames) > 1:
            computed_fps = round((len(self.frames) - 1) / duration, 2)

        data = {
            "version": "1.0",
            "metadata": {
                "recording_name": rec_name,
                "created_at": created_at,
                "duration_sec": round(duration, 3),
                "fps": computed_fps,
                "frame_count": len(self.frames),
                "note": self.note,
            },
            "frames": [frame_to_dict(f) for f in self.frames],
        }

        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        logger.info(
            "Saved %d frames (%.2fs) to %s",
            len(self.frames),
            duration,
            target_path,
        )
        return target_path

    @classmethod
    def load(cls, path: Path | str) -> tuple[dict[str, Any], list[Frame]]:
        """Load recording file into metadata dict and list of Frame objects."""
        target_path = Path(path)
        if not target_path.exists():
            raise FileNotFoundError(f"Recording file not found: {target_path}")

        with open(target_path, encoding="utf-8") as f:
            data = json.load(f)

        metadata: dict[str, Any] = data.get("metadata", {})
        raw_frames: list[dict[str, Any]] = data.get("frames", [])
        frames = [Frame.from_dict(item) for item in raw_frames]

        return metadata, frames


def record_live(
    output_path: Path | str,
    camera: int | str = 0,
    duration: float | None = None,
    width: int = 640,
    height: int = 480,
    model: str = "lite",
    note: str = "",
    no_overlay: bool = False,
) -> Path:
    """Record live pose landmarks from webcam to JSON file."""
    import cv2

    from irlsurfer.pose import PoseExtractor

    extractor = PoseExtractor(model_type=model)
    recorder = LandmarkRecorder(
        output_path=output_path,
        note=note,
    )

    try:
        camera_id: int | str = int(camera)
    except ValueError:
        camera_id = str(camera)

    cap = cv2.VideoCapture(camera_id)
    if isinstance(camera_id, int):
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

    if not cap.isOpened():
        extractor.close()
        raise RuntimeError(f"Unable to open video source: {camera}")

    logger.info("Starting live landmark recording to %s...", output_path)
    start_wall_time = time.perf_counter()

    try:
        while cap.isOpened():
            now = time.perf_counter()
            elapsed = now - start_wall_time
            if duration is not None and elapsed >= duration:
                logger.info("Recording duration of %.1fs reached.", duration)
                break

            ret, frame_bgr = cap.read()
            if not ret or frame_bgr is None:
                break

            timestamp_s = time.time()
            frame_data = extractor.extract(frame_bgr, timestamp_s=timestamp_s)

            if frame_data is not None:
                recorder.add_frame(frame_data)

            if not no_overlay:
                status_text = f"Recording: {len(recorder.frames)} frames | {elapsed:.1f}s"
                if duration is not None:
                    status_text += f" / {duration:.1f}s"
                display_img = frame_bgr.copy()
                cv2.putText(
                    display_img,
                    status_text,
                    (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 0, 255),
                    2,
                )
                cv2.imshow("IRLSurfer Recorder", display_img)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), ord("Q"), 27):
                    logger.info("Recording stopped by user keypress.")
                    break
    finally:
        cap.release()
        if not no_overlay:
            cv2.destroyAllWindows()
        extractor.close()

    return recorder.save()
