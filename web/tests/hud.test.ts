import { describe, it, expect } from 'vitest';
import { CameraHUD } from '../src/hud';
import { GestureDetector } from '../src/detector';

interface Call {
  name: string;
  args: unknown[];
  fillStyle: unknown;
}

function makeMockCanvas(w = 640, h = 480): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000000' };
  const ctx = new Proxy(state, {
    get(target, prop) {
      const key = String(prop);
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 0 });
      if (key === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      return (...args: unknown[]) => {
        calls.push({ name: key, args, fillStyle: target.fillStyle });
      };
    },
    set(target, prop, value) {
      target[String(prop)] = value;
      return true;
    },
  });
  const canvas = { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

function alphaOf(style: unknown): number {
  const m = /rgba\([^)]*,\s*([\d.]+)\s*\)$/.exec(String(style));
  return m ? parseFloat(m[1]) : 1;
}

describe('CameraHUD webcam visibility', () => {
  const fakeVideo = { readyState: 4 } as unknown as HTMLVideoElement;

  it('never fills a path containing more than one arc (no bowtie polygons)', () => {
    const { canvas, calls } = makeMockCanvas();
    new CameraHUD(canvas).render(fakeVideo, null, new GestureDetector(), 0.016);
    let arcs = 0;
    for (const c of calls) {
      if (c.name === 'beginPath') arcs = 0;
      if (c.name === 'arc') arcs += 1;
      if (c.name === 'fill') expect(arcs).toBeLessThanOrEqual(1);
    }
  });

  it('draws the four teal corner dots as four separate fills', () => {
    const { canvas, calls } = makeMockCanvas();
    new CameraHUD(canvas).render(fakeVideo, null, new GestureDetector(), 0.016);
    const tealFills = calls.filter((c) => c.name === 'fill' && c.fillStyle === '#14b8a6');
    expect(tealFills.length).toBe(4);
  });

  it('full-frame tint over the video is light (alpha <= 0.2)', () => {
    const { canvas, calls } = makeMockCanvas();
    new CameraHUD(canvas).render(fakeVideo, null, new GestureDetector(), 0.016);
    const fullFrame = calls.filter(
      (c) =>
        c.name === 'fillRect' &&
        c.args[0] === 0 &&
        c.args[1] === 0 &&
        c.args[2] === 640 &&
        c.args[3] === 480,
    );
    expect(fullFrame.length).toBeGreaterThan(0);
    for (const c of fullFrame) {
      expect(alphaOf(c.fillStyle)).toBeLessThanOrEqual(0.2);
    }
  });

  it('drawImage is called with the video when the feed is ready', () => {
    const { canvas, calls } = makeMockCanvas();
    new CameraHUD(canvas).render(fakeVideo, null, new GestureDetector(), 0.016);
    expect(calls.some((c) => c.name === 'drawImage' && c.args[0] === fakeVideo)).toBe(true);
  });
});
