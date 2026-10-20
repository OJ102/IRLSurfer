"""Unit tests for OneEuroFilter implementations."""

from __future__ import annotations

import numpy as np

from irlsurfer.filters import OneEuroFilter, OneEuroFilter2D
from irlsurfer.landmarks import Landmark


def test_one_euro_filter_initialization() -> None:
    f = OneEuroFilter(min_cutoff=1.0, beta=0.007, d_cutoff=1.0)
    assert f.last_value is None

    val = f.filter(10.0, timestamp=1.0)
    assert val == 10.0
    assert f.last_value == 10.0


def test_one_euro_filter_smoothing() -> None:
    """Check that filter reduces high frequency noise on a constant signal."""
    np.random.seed(42)
    f = OneEuroFilter(min_cutoff=1.0, beta=0.0, d_cutoff=1.0)

    true_val = 5.0
    raw_vals = [true_val + np.random.normal(0, 0.5) for _ in range(50)]
    filtered_vals: list[float] = []

    dt = 0.033  # ~30fps
    for i, raw in enumerate(raw_vals):
        filt = f.filter(raw, timestamp=i * dt)
        filtered_vals.append(filt)

    # Discard warmup frames
    warmup = 10
    raw_variance = float(np.var(raw_vals[warmup:]))
    filtered_variance = float(np.var(filtered_vals[warmup:]))

    assert filtered_variance < raw_variance


def test_one_euro_filter_adaptive_cutoff() -> None:
    """Verify that high velocity leads to faster tracking (less lag)."""
    f_slow = OneEuroFilter(min_cutoff=0.1, beta=0.0, d_cutoff=1.0)
    f_fast = OneEuroFilter(min_cutoff=0.1, beta=1.0, d_cutoff=1.0)

    # Start at 0, sudden jump to 10
    f_slow.filter(0.0, 0.0)
    f_fast.filter(0.0, 0.0)

    val_slow = f_slow.filter(10.0, 0.033)
    val_fast = f_fast.filter(10.0, 0.033)

    # The adaptive filter with high beta responds much faster to the step
    assert val_fast > val_slow


def test_one_euro_filter_non_advancing_time() -> None:
    f = OneEuroFilter()
    f.filter(10.0, timestamp=1.0)
    # Same timestamp or past timestamp should safely return last value
    val = f.filter(20.0, timestamp=1.0)
    assert val == 10.0
    val2 = f.filter(30.0, timestamp=0.5)
    assert val2 == 10.0


def test_one_euro_filter_reset() -> None:
    f = OneEuroFilter()
    f.filter(10.0, 1.0)
    assert f.last_value is not None
    f.reset()
    assert f.last_value is None
    # Next filter call should treat value as first frame
    val = f.filter(25.0, 2.0)
    assert val == 25.0


def test_one_euro_filter_2d_and_landmark() -> None:
    f2d = OneEuroFilter2D(min_cutoff=1.0, beta=0.007)

    # Filtering (x, y)
    fx, fy = f2d.filter(1.0, 2.0, timestamp=0.0)
    assert fx == 1.0
    assert fy == 2.0

    fx2, fy2 = f2d.filter(1.5, 2.5, timestamp=0.033)
    assert 1.0 < fx2 < 1.5
    assert 2.0 < fy2 < 2.5

    # Filtering Landmark
    lm = Landmark(x=3.0, y=4.0, z=0.5, visibility=0.95)
    f2d.reset()
    filtered_lm = f2d.filter_landmark(lm, timestamp=1.0)
    assert filtered_lm.x == 3.0
    assert filtered_lm.y == 4.0
    assert filtered_lm.z == 0.5
    assert filtered_lm.visibility == 0.95
