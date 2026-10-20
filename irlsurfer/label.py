"""Ground-truth event labeling and dataset management for IRLSurfer."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from irlsurfer.detector import GestureEvent

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class GroundTruthEvent:
    """A ground truth gesture event at a specific timestamp."""

    timestamp: float
    gesture: GestureEvent

    def to_dict(self) -> dict[str, Any]:
        """Convert event to dictionary."""
        return {
            "timestamp": round(self.timestamp, 4),
            "gesture": str(self.gesture.value if hasattr(self.gesture, "value") else self.gesture),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> GroundTruthEvent:
        """Create GroundTruthEvent from dictionary."""
        raw_gesture = data["gesture"]
        gesture = (
            raw_gesture if isinstance(raw_gesture, GestureEvent) else GestureEvent(raw_gesture)
        )
        return cls(timestamp=float(data["timestamp"]), gesture=gesture)


@dataclass(slots=True)
class LabelDataset:
    """Container for ground truth events associated with a recording."""

    recording_file: str
    events: list[GroundTruthEvent] = field(default_factory=list)
    version: str = "1.0"
    labeled_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def add_event(self, timestamp: float, gesture: GestureEvent | str) -> None:
        """Add an event and keep events sorted by timestamp."""
        event_gesture = GestureEvent(gesture) if isinstance(gesture, str) else gesture
        self.events.append(GroundTruthEvent(timestamp=float(timestamp), gesture=event_gesture))
        self.events.sort(key=lambda e: e.timestamp)

    def remove_last_event(self) -> GroundTruthEvent | None:
        """Remove and return the most recent ground truth event."""
        if self.events:
            return self.events.pop()
        return None

    def validate(self) -> None:
        """Validate event timestamps are non-negative and monotonically ordered."""
        prev_t = -1.0
        for i, ev in enumerate(self.events):
            if ev.timestamp < 0.0:
                raise ValueError(f"Event {i} has negative timestamp: {ev.timestamp}")
            if ev.timestamp < prev_t:
                raise ValueError(
                    f"Event {i} timestamp {ev.timestamp} is not chronological after {prev_t}"
                )
            prev_t = ev.timestamp

    def to_dict(self) -> dict[str, Any]:
        """Serialize dataset to dictionary."""
        return {
            "version": self.version,
            "recording_file": self.recording_file,
            "labeled_at": self.labeled_at,
            "events": [e.to_dict() for e in sorted(self.events, key=lambda e: e.timestamp)],
        }

    def save(self, filepath: Path | str) -> Path:
        """Save labeled dataset to JSON file."""
        target_path = Path(filepath)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)
        logger.info("Saved %d labels to %s", len(self.events), target_path)
        return target_path

    def to_json(self, filepath: Path | str) -> Path:
        """Alias for save."""
        return self.save(filepath)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> LabelDataset:
        """Deserialize dataset from dictionary."""
        events = [GroundTruthEvent.from_dict(item) for item in data.get("events", [])]
        events.sort(key=lambda e: e.timestamp)
        return cls(
            recording_file=str(data.get("recording_file", "")),
            events=events,
            version=str(data.get("version", "1.0")),
            labeled_at=str(data.get("labeled_at", "")),
        )

    @classmethod
    def load(cls, filepath: Path | str) -> LabelDataset:
        """Load labeled dataset from JSON file."""
        target_path = Path(filepath)
        if not target_path.exists():
            raise FileNotFoundError(f"Label file not found: {target_path}")

        with open(target_path, encoding="utf-8") as f:
            data = json.load(f)
        return cls.from_dict(data)

    @classmethod
    def from_json(cls, filepath: Path | str) -> LabelDataset:
        """Alias for load."""
        return cls.load(filepath)


def label_recording(
    recording_path: Path | str,
    output_path: Path | str | None = None,
    headless: bool = False,
) -> LabelDataset:
    """Interactively label recorded landmark frames."""
    from irlsurfer.record import LandmarkRecorder

    rec_path = Path(recording_path)
    metadata, frames = LandmarkRecorder.load(rec_path)

    if output_path is None:
        target_output = Path(f"data/labels/{rec_path.stem}_labels.json")
    else:
        target_output = Path(output_path)

    dataset: LabelDataset
    if target_output.exists():
        logger.info("Loading existing label dataset: %s", target_output)
        dataset = LabelDataset.load(target_output)
    else:
        dataset = LabelDataset(recording_file=str(rec_path))

    if headless or not frames:
        dataset.save(target_output)
        return dataset

    import cv2
    import numpy as np

    canvas_w, canvas_h = 640, 480
    frame_idx = 0
    paused = False
    last_event_msg = ""

    key_map = {
        ord("1"): GestureEvent.LANE_LEFT,
        ord("a"): GestureEvent.LANE_LEFT,
        ord("2"): GestureEvent.LANE_RIGHT,
        ord("d"): GestureEvent.LANE_RIGHT,
        ord("3"): GestureEvent.JUMP,
        ord("w"): GestureEvent.JUMP,
        ord("4"): GestureEvent.DUCK,
        ord("s"): GestureEvent.DUCK,
        ord("5"): GestureEvent.HOVERBOARD,
        ord("h"): GestureEvent.HOVERBOARD,
    }

    try:
        while frame_idx < len(frames):
            frame = frames[frame_idx]
            canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)

            # Draw pose landmarks
            for lm in (
                frame.left_shoulder,
                frame.right_shoulder,
                frame.left_hip,
                frame.right_hip,
                frame.left_wrist,
                frame.right_wrist,
            ):
                px = int(lm.x * canvas_w)
                py = int(lm.y * canvas_h)
                cv2.circle(canvas, (px, py), 6, (0, 255, 0), -1)

            if frame.nose is not None:
                npx = int(frame.nose.x * canvas_w)
                npy = int(frame.nose.y * canvas_h)
                cv2.circle(canvas, (npx, npy), 6, (255, 255, 0), -1)

            # Draw status text
            t_str = f"T: {frame.timestamp:.2f}s | Frame {frame_idx + 1}/{len(frames)}"
            cv2.putText(
                canvas,
                t_str,
                (20, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                1,
            )

            status = "PAUSED" if paused else "PLAYING"
            cv2.putText(
                canvas,
                f"Status: {status} (Space=toggle, u=undo, Enter=save)",
                (20, 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (200, 200, 200),
                1,
            )

            cv2.putText(
                canvas,
                "Keys: 1/a=LEFT, 2/d=RIGHT, 3/w=JUMP, 4/s=DUCK, 5/h=HOVER",
                (20, 90),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (0, 200, 255),
                1,
            )

            if last_event_msg:
                cv2.putText(
                    canvas,
                    last_event_msg,
                    (20, 130),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2,
                )

            # Show recent labels
            recent = dataset.events[-3:]
            for idx, ev in enumerate(recent):
                lbl_text = f"[{ev.timestamp:.2f}s] {ev.gesture.value}"
                cv2.putText(
                    canvas,
                    lbl_text,
                    (20, 420 + idx * 20),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 255),
                    1,
                )

            cv2.imshow("IRLSurfer Labeler", canvas)
            delay = 0 if paused else 33
            key = cv2.waitKey(delay) & 0xFF

            if key in (27, ord("q"), 13):  # ESC, q, Enter
                break
            elif key == ord(" "):
                paused = not paused
            elif key == ord("u"):
                undone = dataset.remove_last_event()
                if undone:
                    last_event_msg = f"Undid: {undone.gesture.value}"
            elif key in key_map:
                gesture = key_map[key]
                dataset.add_event(frame.timestamp, gesture)
                last_event_msg = f"Labeled: {gesture.value} at {frame.timestamp:.2f}s"

            if not paused:
                frame_idx += 1
    finally:
        cv2.destroyAllWindows()

    dataset.save(target_output)
    return dataset
