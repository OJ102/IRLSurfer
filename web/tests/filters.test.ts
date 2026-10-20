import { describe, it, expect } from 'vitest';
import { OneEuroFilter, OneEuroFilter2D } from '../src/filters';

describe('OneEuroFilter Unit Tests', () => {
  it('initializes and filters values correctly', () => {
    const filter = new OneEuroFilter(1.0, 0.007, 1.0);
    expect(filter.lastValue).toBeNull();

    // First value returns directly
    const val1 = filter.filter(10.0, 0.0);
    expect(val1).toBe(10.0);
    expect(filter.lastValue).toBe(10.0);

    // Filter with zero delta time returns previous value
    const val2 = filter.filter(20.0, 0.0);
    expect(val2).toBe(10.0);

    // Filter after 1/30 second
    const val3 = filter.filter(12.0, 1 / 30);
    expect(val3).toBeGreaterThan(10.0);
    expect(val3).toBeLessThan(12.0);

    // Reset clears state
    filter.reset();
    expect(filter.lastValue).toBeNull();
  });

  it('filters 2D coordinates and landmarks', () => {
    const filter2D = new OneEuroFilter2D(1.0, 0.007, 1.0);
    const [x1, y1] = filter2D.filter(0.5, 0.5, 0.0);
    expect(x1).toBe(0.5);
    expect(y1).toBe(0.5);

    const lm = filter2D.filterLandmark(
      { x: 0.6, y: 0.7, z: 0.1, visibility: 0.9 },
      1 / 30,
    );
    expect(lm.x).toBeGreaterThan(0.5);
    expect(lm.x).toBeLessThan(0.6);
    expect(lm.y).toBeGreaterThan(0.5);
    expect(lm.y).toBeLessThan(0.7);
    expect(lm.z).toBe(0.1);
    expect(lm.visibility).toBe(0.9);

    filter2D.reset();
  });
});
