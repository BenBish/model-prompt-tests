export function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function positiveSeconds(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive number`);
  return Math.ceil(value);
}

export function createPomodoroTimer(options = {}) {
  const now = options.now ?? (() => Date.now());
  const setIntervalFn = options.setIntervalFn ?? ((callback, delay) => setInterval(callback, delay));
  const clearIntervalFn = options.clearIntervalFn ?? ((id) => clearInterval(id));
  const onChange = options.onChange ?? (() => {});
  const onComplete = options.onComplete ?? (() => {});

  let workSeconds = positiveSeconds(options.workSeconds ?? 25 * 60, "workSeconds");
  let breakSeconds = positiveSeconds(options.breakSeconds ?? 5 * 60, "breakSeconds");
  let mode = "work";
  let status = "idle";
  let remainingSeconds = workSeconds;
  let deadline = null;
  let intervalId = null;

  const state = () => ({ mode, status, remainingSeconds, workSeconds, breakSeconds });
  const emit = () => onChange(state());
  const stopInterval = () => {
    if (intervalId !== null) clearIntervalFn(intervalId);
    intervalId = null;
  };

  const complete = () => {
    const completedMode = mode;
    stopInterval();
    mode = mode === "work" ? "break" : "work";
    status = "idle";
    deadline = null;
    remainingSeconds = mode === "work" ? workSeconds : breakSeconds;
    emit();
    onComplete({ completedMode, mode, state: state() });
  };

  const sync = () => {
    if (status !== "running" || deadline === null) return;
    remainingSeconds = Math.max(0, Math.ceil((deadline - now()) / 1000));
    if (remainingSeconds === 0) complete();
    else emit();
  };

  const reset = () => {
    stopInterval();
    mode = "work";
    status = "idle";
    deadline = null;
    remainingSeconds = workSeconds;
    emit();
  };

  emit();
  return {
    getState: state,
    start() {
      if (status === "running") return;
      status = "running";
      deadline = now() + remainingSeconds * 1000;
      intervalId = setIntervalFn(sync, 250);
      emit();
    },
    pause() {
      if (status !== "running") return;
      sync();
      if (status !== "running") return;
      stopInterval();
      status = "paused";
      deadline = null;
      emit();
    },
    reset,
    setDurations(next) {
      const nextWorkSeconds = positiveSeconds(next.workSeconds, "workSeconds");
      const nextBreakSeconds = positiveSeconds(next.breakSeconds, "breakSeconds");
      workSeconds = nextWorkSeconds;
      breakSeconds = nextBreakSeconds;
      reset();
    },
    destroy() {
      stopInterval();
    },
  };
}
