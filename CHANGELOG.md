# Changelog

All notable changes to the **IRLSurfer** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.0] - 2026-10-21

### Added
- **Centralized Command Dock Architecture**:
  - Unified toolbar layout clustering Core Actions (Pause/Resume, Restart, Mute), Mode Selection (Keyboard vs Webcam), Speed Steppers (`-` / `+`), and Vision Center.
  - Quick-Access Help Drawer popover with hotkey references (`[P]`, `[R]`, `[M]`, `[C]`, `[1]`, `[2]`, `[ ]`, `[?]`).
- **Single-Line Desktop HUD Command Bar**:
  - Centralized OpenCV overlay footer rendering live status and hotkey guidance: `[P] Pause | [C] Recalibrate | [-/+] Speed | [Q] Quit`.

### Changed
- **Open-Concept Coastal Boardwalk**:
  - Removed choppy vertical pilings and hanging rope swags along boardwalk borders in favor of continuous timber curbs with sunlit bevel trim.
- **Subway Surfers Hoverboard Polish**:
  - Redesigned surfer kinematics with authentic 3/4 skate stance, red canvas sneakers, cyan street hoodie, backwards cap, and dual repulsor hover discs.

---

## [0.3.0] - 2026-10-20

### Added
- **Distance Guidance System**:
  - Real-time shoulder width ($W_s$) telemetry monitoring with optimal bracket `[0.14, 0.45]`.
  - Actionable status warnings: `STEP BACK - TOO CLOSE`, `STEP CLOSER - TOO FAR`, `DISTANCE OK`.
  - Calibration distance gating pausing accumulation when player is outside optimal range.
- **Speed & Sensitivity Controller**:
  - Web runner cruise speed multiplier ($0.5\times$ to $2.5\times$) with quick presets (`Warmup`, `Cruise`, `Swell`, `Turbo`).
  - Desktop Python controller `--speed` scaling velocity gating thresholds and cooldowns.
- **Argon Design & Quality Audit**:
  - End-to-end evaluation conducted by independent Argon Auditor subagent.
  - Fixed AudioContext autoplay policy in webcam-only sessions.
  - Implemented Mute toggle button and keyboard shortcut (`M`).
  - Implemented high-DPI Retina display canvas scaling (`devicePixelRatio`).
  - Fixed post-wipeout confetti freeze and lane de-sync on restart.

### Changed
- **California Beach Surfer Design Pivot**:
  - Transformed game aesthetic from dark neon racer to sun-drenched Venice Beach coastal pier.
  - Added Pacific ocean swells, Malibu coastal cliffs, wooden longboards, and beach volleyball hurdles.
- **Eliminated Eternal Screen Shake**:
  - Guaranteed viewport shake reset on collision and zeroed camera translation on game over.

---

## [0.2.0] - 2026-10-19

### Added
- **Web Runtime & Cross-Language Parity Suite**:
  - TypeScript port of `GestureDetector` reading shared `config/gestures.json`.
  - HTML5 Canvas 3-lane arcade runner with obstacle avoidance and wave shield powerup.
  - Vitest cross-runtime parity suite asserting byte-for-byte event sequence equivalence against Python detector.
- **Data & Evaluation Benchmark Engine**:
  - `irlsurfer record`: Privacy-first landmark stream recorder (JSON skeletons only).
  - `irlsurfer label`: Ground-truth event annotator.
  - `irlsurfer eval`: Precision, Recall, and F1 evaluation engine with $\pm 150\text{ms}$ bipartite matching window.
  - `irlsurfer bench`: Micro-benchmark profiler and ablation suite.
  - 6 benchmark dataset clips (115s total duration, 24 ground-truth transitions, 1.00 F1, 0.00 FTPM).
- **Recruiter Portfolio Documentation**:
  - Authored comprehensive `README.md` free of AI buzzwords with mathematical derivations and empirical benchmark tables.

---

## [0.1.0] - 2026-10-19

### Added
- **Project Foundation**:
  - Python 3.12 virtual environment setup via `uv`.
  - Strict type checking (`mypy --strict`), Ruff linting/formatting, and GitHub Actions CI.
- **Core Pure State Machine Detector**:
  - Distance-invariant body normalization via shoulder width ($W_s$).
  - One Euro speed-adaptive low-pass signal filter.
  - Schmitt-trigger lane hysteresis (0.60 enter, 0.40 exit).
  - Velocity-gated vertical jump and duck detection.
  - Proximity-hold hoverboard trigger ($d \le 0.45 W_s$ for $\ge 0.30\text{s}$).
  - Comprehensive synthetic frame unit test suite (100% statement coverage on core modules).
