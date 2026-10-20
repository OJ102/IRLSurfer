"""1€ (OneEuro) Filter implementation for IRLSurfer."""

from __future__ import annotations

import math

from irlsurfer.landmarks import Landmark


class OneEuroFilter:
    """1€ Filter: speed-based low-pass filter for noisy and lag-sensitive signals.

    Reference:
    Casiez, G., Roussel, N., & Vogel, D. (2012).
    1 € filter: a simple speed-based low-pass filter for noisy and
    lag-free human-computer interaction.
    """

    def __init__(
        self,
        min_cutoff: float = 1.0,
        beta: float = 0.007,
        d_cutoff: float = 1.0,
    ) -> None:
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)

        self._x_prev: float | None = None
        self._dx_prev: float = 0.0
        self._t_prev: float | None = None

    @staticmethod
    def _alpha(cutoff: float, dt: float) -> float:
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def filter(self, x: float, timestamp: float) -> float:
        """Filter incoming scalar value x at given timestamp."""
        if self._t_prev is None or self._x_prev is None:
            self._x_prev = float(x)
            self._dx_prev = 0.0
            self._t_prev = float(timestamp)
            return float(x)

        dt = float(timestamp) - self._t_prev
        if dt <= 1e-6:
            return self._x_prev

        # Instantaneous rate of change and filtered derivative
        dx = (float(x) - self._x_prev) / dt
        alpha_d = self._alpha(self.d_cutoff, dt)
        dx_hat = alpha_d * dx + (1.0 - alpha_d) * self._dx_prev

        # Adaptive cutoff frequency based on rate of change
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        alpha_x = self._alpha(cutoff, dt)
        x_hat = alpha_x * float(x) + (1.0 - alpha_x) * self._x_prev

        self._x_prev = x_hat
        self._dx_prev = dx_hat
        self._t_prev = float(timestamp)
        return x_hat

    @property
    def last_value(self) -> float | None:
        """Return the most recent filtered value."""
        return self._x_prev

    def reset(self) -> None:
        """Reset internal filter state."""
        self._x_prev = None
        self._dx_prev = 0.0
        self._t_prev = None


class OneEuroFilter2D:
    """2D One Euro filter wrapper for filtering (x, y) coordinates or Landmark objects."""

    def __init__(
        self,
        min_cutoff: float = 1.0,
        beta: float = 0.007,
        d_cutoff: float = 1.0,
    ) -> None:
        self.filter_x = OneEuroFilter(min_cutoff, beta, d_cutoff)
        self.filter_y = OneEuroFilter(min_cutoff, beta, d_cutoff)

    def filter(self, x: float, y: float, timestamp: float) -> tuple[float, float]:
        """Filter 2D coordinates (x, y) at timestamp."""
        fx = self.filter_x.filter(x, timestamp)
        fy = self.filter_y.filter(y, timestamp)
        return fx, fy

    def filter_landmark(self, landmark: Landmark, timestamp: float) -> Landmark:
        """Filter Landmark x, y while preserving z and visibility."""
        fx, fy = self.filter(landmark.x, landmark.y, timestamp)
        return Landmark(x=fx, y=fy, z=landmark.z, visibility=landmark.visibility)

    def reset(self) -> None:
        """Reset both x and y internal filters."""
        self.filter_x.reset()
        self.filter_y.reset()
