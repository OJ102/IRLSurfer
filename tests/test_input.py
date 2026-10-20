"""Unit tests for keyboard input backends and accessibility checks."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from pynput.keyboard import Key

from irlsurfer.detector import GestureEvent
from irlsurfer.input import NullBackend, PynputBackend, check_macos_accessibility


def test_null_backend_send_gesture_mapping() -> None:
    backend = NullBackend()

    backend.send_gesture(GestureEvent.LANE_LEFT)
    backend.send_gesture(GestureEvent.LANE_RIGHT)
    backend.send_gesture(GestureEvent.JUMP)
    backend.send_gesture(GestureEvent.DUCK)
    backend.send_gesture(GestureEvent.HOVERBOARD)

    assert backend.events == [
        GestureEvent.LANE_LEFT,
        GestureEvent.LANE_RIGHT,
        GestureEvent.JUMP,
        GestureEvent.DUCK,
        GestureEvent.HOVERBOARD,
    ]

    assert backend.key_actions == [
        (Key.left, "tap"),
        (Key.right, "tap"),
        (Key.up, "tap"),
        (Key.down, "tap"),
        (Key.space, "tap"),
    ]


def test_null_backend_actions_and_clear() -> None:
    backend = NullBackend()

    backend.press(Key.up)
    backend.release(Key.up)
    backend.tap(Key.space)

    assert backend.key_actions == [
        (Key.up, "press"),
        (Key.up, "release"),
        (Key.space, "tap"),
    ]

    backend.clear()
    assert len(backend.events) == 0
    assert len(backend.key_actions) == 0


def test_pynput_backend_delegation() -> None:
    mock_controller = MagicMock()
    backend = PynputBackend(controller=mock_controller)

    backend.send_gesture(GestureEvent.JUMP)
    mock_controller.tap.assert_called_with(Key.up)

    backend.press(Key.space)
    mock_controller.press.assert_called_with(Key.space)

    backend.release(Key.space)
    mock_controller.release.assert_called_with(Key.space)

    backend.tap(Key.left)
    mock_controller.tap.assert_called_with(Key.left)


def test_check_macos_accessibility_non_darwin() -> None:
    with patch("sys.platform", "linux"):
        assert check_macos_accessibility() is True


def test_check_macos_accessibility_darwin_trusted() -> None:
    mock_app_services = MagicMock()
    mock_app_services.AXIsProcessTrusted.return_value = 1

    with (
        patch("sys.platform", "darwin"),
        patch("ctypes.cdll.LoadLibrary", return_value=mock_app_services),
    ):
        assert check_macos_accessibility() is True


def test_check_macos_accessibility_darwin_untrusted() -> None:
    mock_app_services = MagicMock()
    mock_app_services.AXIsProcessTrusted.return_value = 0

    with (
        patch("sys.platform", "darwin"),
        patch("ctypes.cdll.LoadLibrary", return_value=mock_app_services),
    ):
        assert check_macos_accessibility() is False
