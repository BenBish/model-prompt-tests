import { createPomodoroTimer, formatTime } from "./timer.js";

const COMPLETE_MESSAGE = {
  work: "Work session complete. Time for a break.",
  break: "Break complete. Ready to work.",
};

const BUTTON_LABEL = {
  idle: "Start",
  running: "Pause",
  paused: "Resume",
};

export function mountPomodoro(document, timerOptions = {}) {
  const els = {
    card: document.querySelector(".timer-card"),
    modeLabel: document.querySelector("#mode-label"),
    timeDisplay: document.querySelector("#time-display"),
    startPause: document.querySelector("#start-pause"),
    reset: document.querySelector("#reset"),
    settings: document.querySelector("#settings"),
    workInput: document.querySelector("#work-minutes"),
    breakInput: document.querySelector("#break-minutes"),
    status: document.querySelector("#status"),
  };
  for (const el of Object.values(els)) {
    if (!el) throw new Error("Pomodoro markup is incomplete");
  }

  const externalOnComplete = timerOptions.onComplete;

  function paint(state) {
    els.modeLabel.textContent = state.mode === "work" ? "Work" : "Break";
    els.timeDisplay.textContent = formatTime(state.remainingSeconds);
    els.startPause.textContent = BUTTON_LABEL[state.status];
    els.card.dataset.mode = state.mode;
  }

  function clearAlert() {
    els.card.classList.remove("is-complete");
    els.status.textContent = "";
  }

  const timer = createPomodoroTimer({
    ...timerOptions,
    onChange: paint,
    onComplete(event) {
      els.card.classList.add("is-complete");
      els.status.textContent = COMPLETE_MESSAGE[event.completedMode];
      externalOnComplete?.(event);
    },
  });

  function handleStartPause() {
    clearAlert();
    if (timer.getState().status === "running") timer.pause();
    else timer.start();
  }

  function handleReset() {
    clearAlert();
    timer.reset();
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    const workMinutes = Number(els.workInput.value);
    const breakMinutes = Number(els.breakInput.value);
    const valid =
      Number.isFinite(workMinutes) && workMinutes > 0 && Number.isFinite(breakMinutes) && breakMinutes > 0;
    if (!valid) {
      els.status.textContent = "Enter positive work and break durations.";
      return;
    }
    clearAlert();
    timer.setDurations({
      workSeconds: Math.round(workMinutes * 60),
      breakSeconds: Math.round(breakMinutes * 60),
    });
    els.status.textContent = "Settings applied. Ready for a work session.";
  }

  els.startPause.addEventListener("click", handleStartPause);
  els.reset.addEventListener("click", handleReset);
  els.settings.addEventListener("submit", handleSettingsSubmit);
  paint(timer.getState());

  return {
    timer,
    destroy() {
      els.startPause.removeEventListener("click", handleStartPause);
      els.reset.removeEventListener("click", handleReset);
      els.settings.removeEventListener("submit", handleSettingsSubmit);
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
