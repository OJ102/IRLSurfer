"""IRLSurfer: Real-time Computer Vision Controller for Subway Surfers."""

from irlsurfer.detector import (
    DetectorState,
    GestureConfig,
    GestureDetector,
    GestureEvent,
)
from irlsurfer.input import (
    KeyBackend,
    NullBackend,
    PynputBackend,
    check_macos_accessibility,
)
from irlsurfer.landmarks import Frame, Landmark
from irlsurfer.overlay import DebugHUD
from irlsurfer.pose import PoseExtractor, ensure_model_file

__version__ = "0.1.0"

__all__ = [
    "DetectorState",
    "GestureConfig",
    "GestureDetector",
    "GestureEvent",
    "KeyBackend",
    "NullBackend",
    "PynputBackend",
    "check_macos_accessibility",
    "Frame",
    "Landmark",
    "DebugHUD",
    "PoseExtractor",
    "ensure_model_file",
]
