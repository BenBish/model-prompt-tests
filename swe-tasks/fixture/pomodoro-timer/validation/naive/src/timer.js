export function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function createPomodoroTimer(options = {}) {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const onChange = options.onChange ?? (() => {});
  const onComplete = options.onComplete ?? (() => {});
  let workSeconds = options.workSeconds ?? 1500;
  let breakSeconds = options.breakSeconds ?? 300;
  let mode = "work";
  let status = "idle";
  let remainingSeconds = workSeconds;
  let intervalId = null;
  const state = () => ({ mode, status, remainingSeconds, workSeconds, breakSeconds });
  const emit = () => onChange(state());
  const tick = () => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearIntervalFn(intervalId);
      const completedMode = mode;
      mode = mode === "work" ? "break" : "work";
      status = "idle";
      remainingSeconds = mode === "work" ? workSeconds : breakSeconds;
      onComplete({ completedMode, mode, state: state() });
    }
    emit();
  };
  emit();
  return {
    getState: state,
    start() {
      status = "running";
      intervalId = setIntervalFn(tick, 1000);
      emit();
    },
    pause() {
      clearIntervalFn(intervalId);
      status = "paused";
      emit();
    },
    reset() {
      clearIntervalFn(intervalId);
      mode = "work";
      status = "idle";
      remainingSeconds = workSeconds;
      emit();
    },
    setDurations(next) {
      workSeconds = next.workSeconds;
      breakSeconds = next.breakSeconds;
      this.reset();
    },
    destroy() {
      clearIntervalFn(intervalId);
    },
  };
}
