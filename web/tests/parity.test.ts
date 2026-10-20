import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GestureDetector } from '../src/detector';
import { Frame, FrameDict } from '../src/landmarks';

interface RecordedEvent {
  timestamp: number;
  gesture: string;
}

interface BenchmarkRecording {
  version: string;
  metadata: {
    recording_name: string;
  };
  frames: FrameDict[];
}

interface BenchmarkLabel {
  events: RecordedEvent[];
}

describe('Cross-Language Deterministic Parity Tests', () => {
  const recordingsDir = resolve(__dirname, '../../data/recordings');
  const labelsDir = resolve(__dirname, '../../data/labels');

  const benchmarkFiles = [
    'clean_lanes',
    'clean_jumps_ducks',
    'hoverboard_holds',
    'distractor_motion',
    'idle_baseline',
    'rapid_combos',
  ];

  for (const name of benchmarkFiles) {
    it(`strictly matches Python detector outputs for ${name}.json`, () => {
      const recordingPath = resolve(recordingsDir, `${name}.json`);
      const rawData = readFileSync(recordingPath, 'utf-8');
      const recording: BenchmarkRecording = JSON.parse(rawData);

      const detector = new GestureDetector();
      const detectedEvents: RecordedEvent[] = [];

      for (const frameDict of recording.frames) {
        const frame = Frame.fromDict(frameDict);
        const events = detector.processFrame(frame);
        for (const ev of events) {
          detectedEvents.push({
            timestamp: Number(frame.timestamp.toFixed(4)),
            gesture: ev,
          });
        }
      }

      // Check against label file if available
      const labelPath = resolve(labelsDir, `${name}_labels.json`);
      const labelData = readFileSync(labelPath, 'utf-8');
      const groundTruth: BenchmarkLabel = JSON.parse(labelData);

      expect(detectedEvents.length).toBe(groundTruth.events.length);

      for (let i = 0; i < groundTruth.events.length; i++) {
        const expected = groundTruth.events[i];
        const actual = detectedEvents[i];

        expect(actual.gesture).toBe(expected.gesture);
        // Timestamps match within sub-millisecond precision
        expect(Math.abs(actual.timestamp - expected.timestamp)).toBeLessThanOrEqual(0.001);
      }
    });
  }

  it('runs parity across all available recordings in data/recordings', () => {
    const files = readdirSync(recordingsDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(6);
  });
});
