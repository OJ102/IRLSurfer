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
  const btnMute = document.getElementById('btnMute') as HTMLButtonElement | null;
  const btnPause = document.getElementById('btnPause') as HTMLButtonElement;
  const btnRecalibrate = document.getElementById('btnRecalibrate') as HTMLButtonElement;
  const cameraPrompt = document.getElementById('cameraPrompt') as HTMLDivElement;
  const cameraFps = document.getElementById('cameraFps') as HTMLSpanElement;

  const speedSlider = document.getElementById('speedSlider') as HTMLInputElement | null;
  const speedValue = document.getElementById('speedValue') as HTMLSpanElement | null;
  const speedPresetBtns = document.querySelectorAll<HTMLButtonElement>('.speed-preset-btn');

  // Initialize Game Runner
  const game = new GameRunner(gameCanvas);
  game.start();

  // Initialize Detector & HUD
  const detector = new GestureDetector();
  const hud = new CameraHUD(hudCanvas);
  const poseTracker = new PoseTracker();

  // Mode defaults to keyboard on startup: isolate input detector
  detector.pause();

  // Fix replay lane de-sync: reset detector lane state on game restart
  game.onRestart = () => {
    if (detector) {
      detector.resetLane();
    }
  };

  // Web Audio autoplay unlock on first user interaction
  const unlockAudio = () => {
    game.resumeAudio();
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  btnEnableCam.addEventListener('click', unlockAudio);

  // Audio mute toggle button
  function updateMuteButton(): void {
    if (btnMute) {
      btnMute.textContent = game.isMuted ? '🔇' : '🔊';
      btnMute.title = game.isMuted ? 'Unmute audio [M]' : 'Mute audio [M]';
      btnMute.setAttribute('aria-label', game.isMuted ? 'Unmute audio' : 'Mute audio');
    }
  }

  if (btnMute) {
    btnMute.addEventListener('click', () => {
      game.toggleMute();
      updateMuteButton();
    });
  }

  // Speed Multiplier Controller logic
  function applySpeed(multiplier: number, syncSlider: boolean = true): void {
    const clamped = Math.max(0.5, Math.min(2.5, Math.round(multiplier * 100) / 100));
    game.setSpeedMultiplier(clamped);
    detector.setSpeedMultiplier(clamped);

    if (speedValue) {
      speedValue.textContent = `${clamped.toFixed(1)}x`;
    }
    if (speedSlider && syncSlider) {
      speedSlider.value = clamped.toString();
    }

    speedPresetBtns.forEach((btn) => {
      const btnSpeed = parseFloat(btn.dataset.speed || '1.0');
      if (Math.abs(btnSpeed - clamped) < 0.04) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      const val = parseFloat(speedSlider.value);
      applySpeed(val, false);
    });
  }

  speedPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = parseFloat(btn.dataset.speed || '1.0');
      applySpeed(val, true);
    });
  });

  let isWebcamRunning = false;
  let lastCameraFrameTime = performance.now();
  let frameCount = 0;
  let fpsTimer = performance.now();

  // Mode switching
  function setMode(mode: 'keyboard' | 'webcam'): void {
    if (mode === 'keyboard') {
      btnModeKeyboard.classList.add('active');
      btnModeWebcam.classList.remove('active');
      detector.pause();
    } else {
      btnModeKeyboard.classList.remove('active');
      btnModeWebcam.classList.add('active');
      detector.resume();
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

  // Global UX Hotkeys: 'p' for pause, 'm' for mute, 'c' for recalibrate, '['/']' for speed
  window.addEventListener('keydown', (e) => {
    if (
      (e.target instanceof HTMLInputElement && e.target !== speedSlider) ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      togglePause();
    } else if (e.key === 'm' || e.key === 'M') {
      game.toggleMute();
      updateMuteButton();
    } else if (e.key === 'c' || e.key === 'C') {
      detector.recalibrate();
    } else if (e.key === '[') {
      e.preventDefault();
      applySpeed(game.speedMultiplier - 0.25, true);
    } else if (e.key === ']') {
      e.preventDefault();
      applySpeed(game.speedMultiplier + 0.25, true);
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
      const errorMsg = (err as Error).message || 'Camera permission was denied.';
      cameraPrompt.innerHTML = `
        <div class="camera-error-container" style="padding: 10px; text-align: center; max-width: 90%;">
          <div style="font-size: 1.6rem; margin-bottom: 4px;">📷⚠️</div>
          <p style="color: #f43f5e; font-weight: 700; margin-bottom: 6px; font-size: 0.95rem;">Camera Access Denied or Unavailable</p>
          <p style="font-size: 0.78rem; color: #cbd5e1; margin-bottom: 10px; line-height: 1.4;">
            ${errorMsg}
          </p>
          <div style="text-align: left; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 6px; padding: 8px 12px; font-size: 0.74rem; color: #94a3b8; margin-bottom: 12px; line-height: 1.4;">
            <p style="font-weight: 600; color: #38bdf8; margin-bottom: 4px;">How to enable camera access in your browser:</p>
            <ol style="margin-left: 16px; margin-bottom: 0; padding-left: 0;">
              <li>Click the <strong>camera / lock icon (🔒)</strong> in your browser's address bar.</li>
              <li>Set <strong>Camera</strong> permissions to <strong>Allow</strong>.</li>
              <li>Ensure no other application (Zoom, Teams, FaceTime) is currently locking your camera.</li>
              <li>Click <strong>Retry Camera</strong> below.</li>
            </ol>
          </div>
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button id="btnRetryCam" class="btn btn-primary" style="padding: 6px 14px; font-size: 0.8rem;">Retry Camera</button>
            <button id="btnFallbackKeyboard" class="btn" style="padding: 6px 14px; font-size: 0.8rem;">Play with Keyboard</button>
          </div>
        </div>
      `;
      document.getElementById('btnRetryCam')?.addEventListener('click', startCameraTracking);
      document.getElementById('btnFallbackKeyboard')?.addEventListener('click', () => setMode('keyboard'));
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
