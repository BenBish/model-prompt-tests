import { expect, test } from "bun:test";
import { createPomodoroTimer } from "../src/timer.js";
import { FakeClock } from "./support/fakeClock";

function buildTimer(overrides = {}) {
  const clock = new FakeClock();
  const changes: unknown[] = [];
  const completions: unknown[] = [];
  const timer = createPomodoroTimer({
    workSeconds: 10,
    breakSeconds: 4,
    now: clock.now,
    setIntervalFn: clock.setInterval,
    clearIntervalFn: clock.clearInterval,
    onChange: (state) => changes.push(state),
    onComplete: (event) => completions.push(event),
    ...overrides,
  });
  return { clock, timer, changes, completions };
}

test("uses elapsed time when interval delivery is delayed", () => {
  const { clock, timer } = buildTimer();
  timer.start();
  clock.elapse(6500);
  clock.runIntervals();
  expect(timer.getState().remainingSeconds).toBe(4);
});

test("never starts duplicate intervals", () => {
  const { clock, timer } = buildTimer();
  timer.start();
  timer.start();
  expect(clock.intervalCount).toBe(1);
});

test("pause freezes elapsed time and resume uses the remainder", () => {
  const { clock, timer } = buildTimer();
  timer.start();
  clock.elapse(3200);
  timer.pause();
  expect(timer.getState()).toMatchObject({ status: "paused", remainingSeconds: 7 });
  expect(clock.intervalCount).toBe(0);
  clock.elapse(5000);
  expect(timer.getState().remainingSeconds).toBe(7);
  timer.start();
  clock.elapse(7000);
  clock.runIntervals();
  expect(timer.getState()).toMatchObject({ mode: "break", status: "idle", remainingSeconds: 4 });
});

test("completion changes mode, announces once, and clears the scheduler", () => {
  const { clock, timer, completions } = buildTimer();
  timer.start();
  clock.elapse(10000);
  clock.runIntervals();
  expect(completions).toHaveLength(1);
  expect(completions[0]).toMatchObject({ completedMode: "work", mode: "break" });
  expect(clock.intervalCount).toBe(0);
});

test("reset and settings always return to a fresh idle work session", () => {
  const { clock, timer } = buildTimer();
  timer.start();
  clock.elapse(3000);
  clock.runIntervals();
  timer.setDurations({ workSeconds: 20, breakSeconds: 8 });
  expect(timer.getState()).toEqual({
    mode: "work",
    status: "idle",
    remainingSeconds: 20,
    workSeconds: 20,
    breakSeconds: 8,
  });
  expect(clock.intervalCount).toBe(0);
  timer.start();
  timer.reset();
  expect(timer.getState()).toMatchObject({ mode: "work", status: "idle", remainingSeconds: 20 });
});

test("rejects invalid durations and destroy clears active work", () => {
  expect(() => createPomodoroTimer({ workSeconds: 0 })).toThrow();
  expect(() => createPomodoroTimer({ breakSeconds: Number.NaN })).toThrow();
  const { clock, timer } = buildTimer();
  const initialState = timer.getState();
  expect(() => timer.setDurations({ workSeconds: -1, breakSeconds: 3 })).toThrow();
  expect(() => timer.setDurations({ workSeconds: 20, breakSeconds: Number.NaN })).toThrow();
  expect(timer.getState()).toEqual(initialState);
  timer.start();
  timer.destroy();
  expect(clock.intervalCount).toBe(0);
});
