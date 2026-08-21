export function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function requirePositiveSeconds(value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("duration must be a positive number");
  return value;
}

class PomodoroTimer {
  constructor(options = {}) {
    this.now = options.now ?? (() => Date.now());
    this.scheduleTick = options.setIntervalFn ?? ((cb, delay) => setInterval(cb, delay));
    this.cancelTick = options.clearIntervalFn ?? ((id) => clearInterval(id));
    this.notifyChange = options.onChange ?? (() => {});
    this.notifyComplete = options.onComplete ?? (() => {});

    this.workSeconds = requirePositiveSeconds(options.workSeconds ?? 1500);
    this.breakSeconds = requirePositiveSeconds(options.breakSeconds ?? 300);
    this.mode = "work";
    this.phase = "idle";
    this.remainingSeconds = this.workSeconds;
    this.elapsedMsBeforeThisRun = 0;
    this.runStartedAtMs = null;
    this.tickHandle = null;

    this.notifyChange(this.getState());
  }

  getState() {
    return {
      mode: this.mode,
      status: this.phase,
      remainingSeconds: this.remainingSeconds,
      workSeconds: this.workSeconds,
      breakSeconds: this.breakSeconds,
    };
  }

  #totalElapsedMs() {
    const runningMs = this.phase === "running" ? this.now() - this.runStartedAtMs : 0;
    return this.elapsedMsBeforeThisRun + runningMs;
  }

  #currentPhaseDurationSeconds() {
    return this.mode === "work" ? this.workSeconds : this.breakSeconds;
  }

  #stopTick() {
    if (this.tickHandle !== null) this.cancelTick(this.tickHandle);
    this.tickHandle = null;
  }

  #sync() {
    if (this.phase !== "running") return;
    const remaining = this.#currentPhaseDurationSeconds() - this.#totalElapsedMs() / 1000;
    if (remaining <= 0) {
      this.#complete();
      return;
    }
    this.remainingSeconds = Math.ceil(remaining);
    this.notifyChange(this.getState());
  }

  #complete() {
    const completedMode = this.mode;
    this.#stopTick();
    this.mode = this.mode === "work" ? "break" : "work";
    this.phase = "idle";
    this.elapsedMsBeforeThisRun = 0;
    this.runStartedAtMs = null;
    this.remainingSeconds = this.#currentPhaseDurationSeconds();
    this.notifyChange(this.getState());
    this.notifyComplete({ completedMode, mode: this.mode, state: this.getState() });
  }

  start() {
    if (this.phase === "running") return;
    this.phase = "running";
    this.runStartedAtMs = this.now();
    this.tickHandle = this.scheduleTick(() => this.#sync(), 250);
    this.notifyChange(this.getState());
  }

  pause() {
    if (this.phase !== "running") return;
    const remaining = this.#currentPhaseDurationSeconds() - this.#totalElapsedMs() / 1000;
    if (remaining <= 0) {
      this.#complete();
      return;
    }
    this.elapsedMsBeforeThisRun += this.now() - this.runStartedAtMs;
    this.runStartedAtMs = null;
    this.remainingSeconds = Math.ceil(remaining);
    this.#stopTick();
    this.phase = "paused";
    this.notifyChange(this.getState());
  }

  reset() {
    this.#stopTick();
    this.mode = "work";
    this.phase = "idle";
    this.elapsedMsBeforeThisRun = 0;
    this.runStartedAtMs = null;
    this.remainingSeconds = this.workSeconds;
    this.notifyChange(this.getState());
  }

  setDurations(next) {
    const nextWorkSeconds = requirePositiveSeconds(next.workSeconds);
    const nextBreakSeconds = requirePositiveSeconds(next.breakSeconds);
    this.workSeconds = nextWorkSeconds;
    this.breakSeconds = nextBreakSeconds;
    this.reset();
  }

  destroy() {
    this.#stopTick();
  }
}

export function createPomodoroTimer(options = {}) {
  const timer = new PomodoroTimer(options);
  return {
    getState: () => timer.getState(),
    start: () => timer.start(),
    pause: () => timer.pause(),
    reset: () => timer.reset(),
    setDurations: (next) => timer.setDurations(next),
    destroy: () => timer.destroy(),
  };
}
