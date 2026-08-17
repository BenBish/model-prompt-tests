export function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function createPomodoroTimer(_options = {}) {
  throw new Error("TODO: implement the Pomodoro timer state machine");
}
