/**
 * 1€ (OneEuro) Filter implementation for IRLSurfer Web Runtime.
 * Exact mathematical port of irlsurfer/filters.py.
 */

import { Landmark } from './landmarks';

export class OneEuroFilter {
  minCutoff: number;
  beta: number;
  dCutoff: number;

  private _xPrev: number | null = null;
  private _dxPrev: number = 0.0;
  private _tPrev: number | null = null;

  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x: number, timestamp: number): number {
    if (this._tPrev === null || this._xPrev === null) {
      this._xPrev = x;
      this._dxPrev = 0.0;
      this._tPrev = timestamp;
      return x;
    }

    const dt = timestamp - this._tPrev;
    if (dt <= 1e-6) {
      return this._xPrev;
    }

    // Instantaneous rate of change and filtered derivative
    const dx = (x - this._xPrev) / dt;
    const alphaD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = alphaD * dx + (1.0 - alphaD) * this._dxPrev;

    // Adaptive cutoff frequency based on rate of change
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const alphaX = OneEuroFilter.alpha(cutoff, dt);
    const xHat = alphaX * x + (1.0 - alphaX) * this._xPrev;

    this._xPrev = xHat;
    this._dxPrev = dxHat;
    this._tPrev = timestamp;
    return xHat;
  }

  get lastValue(): number | null {
    return this._xPrev;
  }

  reset(): void {
    this._xPrev = null;
    this._dxPrev = 0.0;
    this._tPrev = null;
  }
}

export class OneEuroFilter2D {
  readonly filterX: OneEuroFilter;
  readonly filterY: OneEuroFilter;

  constructor(minCutoff: number = 1.0, beta: number = 0.007, dCutoff: number = 1.0) {
    this.filterX = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.filterY = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(x: number, y: number, timestamp: number): [number, number] {
    const fx = this.filterX.filter(x, timestamp);
    const fy = this.filterY.filter(y, timestamp);
    return [fx, fy];
  }

  filterLandmark(landmark: Landmark, timestamp: number): Landmark {
    const [fx, fy] = this.filter(landmark.x, landmark.y, timestamp);
    return {
      x: fx,
      y: fy,
      z: landmark.z ?? 0.0,
      visibility: landmark.visibility ?? 1.0,
    };
  }

  reset(): void {
    this.filterX.reset();
    this.filterY.reset();
  }
}
