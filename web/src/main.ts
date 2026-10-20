/**
 * Main Web Runtime Coordinator.
 * Connects MediaPipe WASM pose tracking, pure TypeScript GestureDetector,
 * camera HUD, and HTML5 Canvas arcade runner.
 */

import { GestureDetector, DetectorState, GestureEvent } from './detector';
import { GameRunner } from './game';
import { CameraHUD } from './hud';
import { PoseTracker } from './pose';

window.addEventListener('DOMContentLoaded', async () => {
  const gameCanvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const hudCanvas = document.getElementById('hudCanvas') as HTMLCanvasElement;
  const video = document.getElementById('webcamVideo') as HTMLVideoElement;

  const btnModeKeyboard = document.getElementById('btnModeKeyboard') as HTMLButtonElement;
  const btnModeWebcam = document.getElementById('btnModeWebcam') as HTMLButtonElement;
  const btnEnableCam = document.getElementById('btnEnableCam') as HTMLButtonElement;
  const btnPause = document.getElementById('btnPause') as HTMLButtonElement;
  const btnRecalibrate = document.getElementById('btnRecalibrate') as HTMLButtonElement;
  const cameraPrompt = document.getElementById('cameraPrompt') as HTMLDivElement;
  const cameraFps = document.getElementById('cameraFps') as HTMLSpanElement;

  // Initialize Game Runner
  const game = new GameRunner(gameCanvas);
  game.start();

  // Initialize Detector & HUD
  const detector = new GestureDetector();
  const hud = new CameraHUD(hudCanvas);
  const poseTracker = new PoseTracker();

  let isWebcamRunning = false;
  let lastCameraFrameTime = performance.now();
  let frameCount = 0;
  let fpsTimer = performance.now();

  // Mode switching
  function setMode(mode: 'keyboard' | 'webcam'): void {
    if (mode === 'keyboard') {
      btnModeKeyboard.classList.add('active');
      btnModeWebcam.classList.remove('active');
    } else {
      btnModeKeyboard.classList.remove('active');
      btnModeWebcam.classList.add('active');
      if (!isWebcamRunning) {
        startCameraTracking();
      }
    }
  }

  btnModeKeyboard.addEventListener('click', () => setMode('keyboard'));
  btnModeWebcam.addEventListener('click', () => setMode('webcam'));
  btnEnableCam.addEventListener('click', () => setMode('webcam'));

  // Pause / Resume toggle
  function togglePause(): void {
    if (detector.state === DetectorState.PAUSED) {
      detector.resume();
      game.state.isPaused = false;
      btnPause.textContent = 'Pause';
    } else {
      detector.pause();
      game.state.isPaused = true;
      btnPause.textContent = 'Resume';
    }
  }

  btnPause.addEventListener('click', togglePause);

  // Recalibrate
  btnRecalibrate.addEventListener('click', () => {
    detector.recalibrate();
  });

  // Global UX Hotkeys: 'p' for pause, 'c' for recalibrate
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      togglePause();
    } else if (e.key === 'c' || e.key === 'C') {
      detector.recalibrate();
    }
  });

  // Camera tracking loop
  async function startCameraTracking(): Promise<void> {
    try {
      cameraPrompt.innerHTML = '<p>Initializing MediaPipe WebAssembly...</p>';
      cameraPrompt.classList.remove('hidden');

      if (!poseTracker.isReady) {
        await poseTracker.init();
      }

      cameraPrompt.innerHTML = '<p>Requesting camera access...</p>';
      await poseTracker.startWebcam(video);

      isWebcamRunning = true;
      cameraPrompt.classList.add('hidden');
      detector.recalibrate();

      requestAnimationFrame(visionLoop);
    } catch (err) {
      console.error('Failed to initialize webcam:', err);
      cameraPrompt.classList.remove('hidden');
      cameraPrompt.innerHTML = `
        <p style="color: #ff0055; font-weight: bold;">Camera Access Failed</p>
        <p style="font-size: 0.8rem;">${(err as Error).message || 'Permissions denied'}</p>
        <button id="btnRetryCam" class="btn btn-primary" style="margin-top: 8px;">Retry Camera</button>
      `;
      document.getElementById('btnRetryCam')?.addEventListener('click', startCameraTracking);
    }
  }

  function visionLoop(now: number): void {
    if (!isWebcamRunning) return;

    const dt = (now - lastCameraFrameTime) / 1000.0;
    lastCameraFrameTime = now;

    // Calculate Vision FPS
    frameCount++;
    if (now - fpsTimer >= 1000.0) {
      cameraFps.textContent = `${frameCount} FPS`;
      frameCount = 0;
      fpsTimer = now;
    }

    const { frame, rawLandmarks } = poseTracker.detect(now);

    if (frame) {
      const events = detector.processFrame(frame);
      for (const ev of events) {
        hud.showGestureBanner(ev);

        switch (ev) {
          case GestureEvent.LANE_LEFT:
            game.state.moveLeft();
            break;
          case GestureEvent.LANE_RIGHT:
            game.state.moveRight();
            break;
          case GestureEvent.JUMP:
            game.state.jump();
            game.sounds.playJump();
            break;
          case GestureEvent.DUCK:
            game.state.duck();
            game.sounds.playDuck();
            break;
          case GestureEvent.HOVERBOARD:
            game.state.activateHoverboard();
            break;
        }
      }
    }

    hud.render(video, rawLandmarks, detector, dt);
    requestAnimationFrame(visionLoop);
  }
});
