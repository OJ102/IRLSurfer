/**
 * MediaPipe Tasks Vision WebAssembly wrapper.
 * Runs 100% on-device pose estimation in the browser.
 */

import {
  FilesetResolver,
  PoseLandmarker,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { Frame, Landmark } from './landmarks';

export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private lastVideoTime: number = -1;

  async init(
    wasmPath: string = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    modelPath: string = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  ): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    } catch (e) {
      console.warn('Failed GPU delegate initialization, falling back to CPU:', e);
      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    }
  }

  get isReady(): boolean {
    return this.landmarker !== null;
  }

  async startWebcam(video: HTMLVideoElement): Promise<void> {
    this.videoElement = video;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });
    this.stream = stream;
    this.videoElement.srcObject = stream;
    await new Promise<void>((resolve) => {
      this.videoElement!.onloadedmetadata = () => {
        this.videoElement!.play();
        resolve();
      };
    });
  }

  stopWebcam(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  detect(timestampMs: number): {
    frame: Frame | null;
    rawLandmarks: Landmark[] | null;
  } {
    if (!this.landmarker || !this.videoElement || this.videoElement.readyState < 2) {
      return { frame: null, rawLandmarks: null };
    }

    if (this.videoElement.currentTime === this.lastVideoTime) {
      return { frame: null, rawLandmarks: null };
    }
    this.lastVideoTime = this.videoElement.currentTime;

    const result: PoseLandmarkerResult = this.landmarker.detectForVideo(
      this.videoElement,
      timestampMs,
    );

    if (!result.landmarks || result.landmarks.length === 0) {
      return { frame: null, rawLandmarks: null };
    }

    const landmarks = result.landmarks[0];
    const frame = Frame.fromMediaPipe(landmarks, timestampMs / 1000.0);
    return { frame, rawLandmarks: landmarks };
  }
}
