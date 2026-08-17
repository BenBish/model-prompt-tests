import { createPomodoroTimer, formatTime } from "./timer.js";

export function mountPomodoro(_document, _timerOptions = {}) {
  throw new Error("TODO: wire the timer state machine to the existing UI");
}

if (typeof document !== "undefined") {
  const start = () => {
    globalThis.__pomodoro = mountPomodoro(document);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export { formatTime };
