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


def test_one_euro_filter_extreme_noise_and_recovery() -> None:
    """Check that filter handles high-amplitude noise spike and recovers cleanly without NaN."""
    # 1. Jitter filter with beta=0.0 dampens large impulse spike
    f_smooth = OneEuroFilter(min_cutoff=1.0, beta=0.0, d_cutoff=1.0)
    for i in range(10):
        f_smooth.filter(5.0, timestamp=i * 0.033)
    spike_val = f_smooth.filter(100.0, timestamp=10 * 0.033)
    assert spike_val < 30.0  # Heavily damped compared to raw 100.0

    # 2. Adaptive filter recovers cleanly back to baseline after extreme spike
    f_adapt = OneEuroFilter(min_cutoff=1.0, beta=0.007, d_cutoff=1.0)
    for i in range(10):
        f_adapt.filter(5.0, timestamp=i * 0.033)
    f_adapt.filter(1000.0, timestamp=10 * 0.033)

    # Next normal frames: back to 5.0
    recovery_vals = [f_adapt.filter(5.0, timestamp=(11 + i) * 0.033) for i in range(15)]
    # Verify asymptotic recovery back to baseline without NaN or instability
    assert abs(recovery_vals[-1] - 5.0) < 0.2


def test_one_euro_filter_2d_and_landmark_non_monotonic_and_zero_dt() -> None:
    """Verify OneEuroFilter2D handles non-monotonic timestamps and zero dt."""
    f2d = OneEuroFilter2D(min_cutoff=1.0, beta=0.007)

    # Initial frame at t=2.0
    p1 = f2d.filter(10.0, 20.0, timestamp=2.0)
    assert p1 == (10.0, 20.0)

    # Same timestamp (dt = 0)
    p2 = f2d.filter(15.0, 25.0, timestamp=2.0)
    assert p2 == (10.0, 20.0)

    # Backwards timestamp (dt < 0)
    p3 = f2d.filter(30.0, 40.0, timestamp=1.0)
    assert p3 == (10.0, 20.0)

    # Landmark filter with non-monotonic timestamp
    lm1 = Landmark(x=10.0, y=20.0, z=0.5, visibility=0.9)
    res1 = f2d.filter_landmark(lm1, timestamp=2.0)
    assert res1.x == 10.0 and res1.y == 20.0

    lm2 = Landmark(x=99.0, y=99.0, z=0.5, visibility=0.9)
    res2 = f2d.filter_landmark(lm2, timestamp=1.5)
    # Should safely return previous filtered position
    assert res2.x == 10.0 and res2.y == 20.0


def test_one_euro_filter_rapid_alternating_inputs() -> None:
    """Verify stability under rapidly oscillating input values."""
    f = OneEuroFilter(min_cutoff=1.0, beta=0.01)
    f.filter(0.0, timestamp=0.0)

    vals = []
    dt = 0.033
    for i in range(1, 30):
        # Oscillate between -10.0 and +10.0 every frame
        raw = 10.0 if i % 2 == 0 else -10.0
        val = f.filter(raw, timestamp=i * dt)
        vals.append(val)
        # Should stay well bounded and never blow up
        assert -10.0 <= val <= 10.0
