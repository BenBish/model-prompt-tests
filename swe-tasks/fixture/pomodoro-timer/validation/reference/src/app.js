import { createPomodoroTimer, formatTime } from "./timer.js";

export function mountPomodoro(document, timerOptions = {}) {
  const card = document.querySelector(".timer-card");
  const modeLabel = document.querySelector("#mode-label");
  const timeDisplay = document.querySelector("#time-display");
  const startPause = document.querySelector("#start-pause");
  const reset = document.querySelector("#reset");
  const settings = document.querySelector("#settings");
  const workInput = document.querySelector("#work-minutes");
  const breakInput = document.querySelector("#break-minutes");
  const status = document.querySelector("#status");
  if (![card, modeLabel, timeDisplay, startPause, reset, settings, workInput, breakInput, status].every(Boolean)) {
    throw new Error("Pomodoro markup is incomplete");
  }

  const externalOnComplete = timerOptions.onComplete;
  const render = (state) => {
    modeLabel.textContent = state.mode === "work" ? "Work" : "Break";
    timeDisplay.textContent = formatTime(state.remainingSeconds);
    startPause.textContent = state.status === "running" ? "Pause" : state.status === "paused" ? "Resume" : "Start";
    card.dataset.mode = state.mode;
    document.title = `${formatTime(state.remainingSeconds)} · ${modeLabel.textContent}`;
  };

  const timer = createPomodoroTimer({
    ...timerOptions,
    onChange: render,
    onComplete(event) {
      card.classList.add("is-complete");
      status.textContent =
        event.completedMode === "work" ? "Work session complete. Time for a break." : "Break complete. Ready to work.";
      externalOnComplete?.(event);
    },
  });

  const clearAlert = () => {
    card.classList.remove("is-complete");
    status.textContent = "";
  };
  const onStartPause = () => {
    clearAlert();
    if (timer.getState().status === "running") timer.pause();
    else timer.start();
  };
  const onReset = () => {
    clearAlert();
    timer.reset();
  };
  const onSettings = (event) => {
    event.preventDefault();
    const workMinutes = Number(workInput.value);
    const breakMinutes = Number(breakInput.value);
    if (!Number.isFinite(workMinutes) || workMinutes <= 0 || !Number.isFinite(breakMinutes) || breakMinutes <= 0) {
      status.textContent = "Enter positive work and break durations.";
      return;
    }
    clearAlert();
    timer.setDurations({ workSeconds: Math.round(workMinutes * 60), breakSeconds: Math.round(breakMinutes * 60) });
    status.textContent = "Settings applied. Ready for a work session.";
  };

  startPause.addEventListener("click", onStartPause);
  reset.addEventListener("click", onReset);
  settings.addEventListener("submit", onSettings);
  render(timer.getState());

  return {
    timer,
    destroy() {
      startPause.removeEventListener("click", onStartPause);
      reset.removeEventListener("click", onReset);
      settings.removeEventListener("submit", onSettings);
      timer.destroy();
    },
  };
}

if (typeof document !== "undefined") {
  const start = () => {
    globalThis.__pomodoro = mountPomodoro(document);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export { formatTime };
