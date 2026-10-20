"""Keyboard input backends and system accessibility verification for IRLSurfer."""

from __future__ import annotations

import ctypes
import logging
import sys
from abc import ABC, abstractmethod
from typing import Any

from irlsurfer.detector import GestureEvent

Controller: Any
Key: Any
try:
    from pynput.keyboard import Controller as _Controller
    from pynput.keyboard import Key as _Key

    Controller = _Controller
    Key = _Key
    _PYNPUT_AVAILABLE = True
except (ImportError, Exception):  # pragma: no cover
    Controller = None
    Key = None
    _PYNPUT_AVAILABLE = False

logger = logging.getLogger(__name__)

if _PYNPUT_AVAILABLE and Key is not None:
    GESTURE_KEY_MAP: dict[GestureEvent, Any] = {
        GestureEvent.LANE_LEFT: Key.left,
        GestureEvent.LANE_RIGHT: Key.right,
        GestureEvent.JUMP: Key.up,
        GestureEvent.DUCK: Key.down,
        GestureEvent.HOVERBOARD: Key.space,
    }
else:
    GESTURE_KEY_MAP = {}


class KeyBackend(ABC):
    """Abstract base class for keyboard simulation."""

    @abstractmethod
    def send_gesture(self, gesture: GestureEvent) -> None:
        """Translate gesture event to keystroke."""

    @abstractmethod
    def press(self, key: Any) -> None:
        """Simulate key press."""

    @abstractmethod
    def release(self, key: Any) -> None:
        """Simulate key release."""

    @abstractmethod
    def tap(self, key: Any) -> None:
        """Simulate press and immediate release."""


class NullBackend(KeyBackend):
    """In-memory key backend for testing and dry-run mode."""

    def __init__(self) -> None:
        self.events: list[GestureEvent] = []
        self.key_actions: list[tuple[Any, str]] = []

    def send_gesture(self, gesture: GestureEvent) -> None:
        self.events.append(gesture)
        key = GESTURE_KEY_MAP.get(gesture)
        if key is not None:
            self.tap(key)

    def press(self, key: Any) -> None:
        self.key_actions.append((key, "press"))

    def release(self, key: Any) -> None:
        self.key_actions.append((key, "release"))

    def tap(self, key: Any) -> None:
        self.key_actions.append((key, "tap"))

    def clear(self) -> None:
        """Reset recorded events and actions."""
        self.events.clear()
        self.key_actions.clear()


class PynputBackend(KeyBackend):
    """Key simulator backend using pynput Controller."""

    def __init__(self, controller: Controller | None = None) -> None:
        if controller is not None:
            self._keyboard = controller
        elif _PYNPUT_AVAILABLE and Controller is not None:
            self._keyboard = Controller()
        else:
            raise RuntimeError(
                "pynput Controller is not available (e.g. in headless environment without display)."
            )
        self._mapping = GESTURE_KEY_MAP

    def send_gesture(self, gesture: GestureEvent) -> None:
        key = self._mapping.get(gesture)
        if key is not None:
            self.tap(key)

    def press(self, key: Any) -> None:
        self._keyboard.press(key)

    def release(self, key: Any) -> None:
        self._keyboard.release(key)

    def tap(self, key: Any) -> None:
        self._keyboard.tap(key)


def check_macos_accessibility() -> bool:
    """Check macOS Accessibility permission via ApplicationServices AXIsProcessTrusted.

    Returns True if trusted or if running on non-macOS systems.
    """
    if sys.platform != "darwin":
        return True

    try:
        app_services = ctypes.cdll.LoadLibrary(
            "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
        )
        trusted = bool(app_services.AXIsProcessTrusted())
    except Exception as exc:
        logger.debug("Failed to check macOS accessibility permissions: %s", exc)
        return True

    if not trusted:
        logger.warning(
            "\n" + "=" * 70 + "\n"
            "⚠️  macOS Accessibility Permissions Required\n"
            "IRLSurfer requires accessibility permissions to dispatch "
            "keystrokes to Subway Surfers.\n"
            "Grant access to your terminal app in:\n"
            "  System Settings -> Privacy & Security -> Accessibility\n"
            "(Tip: Use --dry-run to test tracking without key simulation)\n" + "=" * 70
        )
    return trusted
