"""IRLSurfer: Real-time Computer Vision Controller for Subway Surfers."""

from irlsurfer.bench import (
    LatencyProfiler,
    run_ablation_filters,
    run_ablation_gating,
)
from irlsurfer.detector import (
    DetectorState,
    GestureConfig,
    GestureDetector,
    GestureEvent,
)
from irlsurfer.evaluate import (
    EvaluationReport,
    evaluate_files,
    evaluate_recording,
)
from irlsurfer.input import (
    KeyBackend,
    NullBackend,
    PynputBackend,
    check_macos_accessibility,
)
from irlsurfer.label import (
    GroundTruthEvent,
    LabelDataset,
    label_recording,
)
from irlsurfer.landmarks import Frame, Landmark
from irlsurfer.overlay import DebugHUD
from irlsurfer.pose import PoseExtractor, ensure_model_file
from irlsurfer.record import (
    LandmarkRecorder,
    record_live,
)

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
    "LandmarkRecorder",
    "record_live",
    "GroundTruthEvent",
    "LabelDataset",
    "label_recording",
    "EvaluationReport",
    "evaluate_recording",
    "evaluate_files",
    "LatencyProfiler",
    "run_ablation_filters",
    "run_ablation_gating",
]
