import { expect, test } from "bun:test";
import { createPomodoroTimer, formatTime } from "../src/timer.js";
import { FakeClock } from "./support/fakeClock";

test("formats whole minutes and seconds", () => {
  expect(formatTime(1500)).toBe("25:00");
  expect(formatTime(65)).toBe("01:05");
});

test("starts, pauses, and resets a work session", () => {
  const clock = new FakeClock();
  const timer = createPomodoroTimer({
    workSeconds: 25,
    breakSeconds: 5,
    now: clock.now,
    setIntervalFn: clock.setInterval,
    clearIntervalFn: clock.clearInterval,
  });

  expect(timer.getState()).toMatchObject({ mode: "work", status: "idle", remainingSeconds: 25 });
  timer.start();
  expect(timer.getState().status).toBe("running");
  timer.pause();
  expect(timer.getState().status).toBe("paused");
  timer.reset();
  expect(timer.getState()).toMatchObject({ mode: "work", status: "idle", remainingSeconds: 25 });
});
