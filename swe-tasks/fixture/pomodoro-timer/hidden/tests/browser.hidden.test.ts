import { expect, test } from "bun:test";
import { launchPomodoroPage } from "./support/chromium";

test(
  "runs the accessible timer workflow in a real browser",
  async () => {
    const page = await launchPomodoroPage();
    try {
      expect(
        await page.evaluate(`({
          mode: document.querySelector("#mode-label").textContent,
          time: document.querySelector("#time-display").textContent,
          action: document.querySelector("#start-pause").textContent,
          live: document.querySelector("#status").getAttribute("aria-live"),
          role: document.querySelector("#status").getAttribute("role")
        })`),
      ).toEqual({ mode: "Work", time: "25:00", action: "Start", live: "polite", role: "status" });

      await page.send("Page.bringToFront");
      await page.evaluate(`document.querySelector("#start-pause").focus()`);
      await page.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        text: String.fromCharCode(13),
        unmodifiedText: String.fromCharCode(13),
        windowsVirtualKeyCode: 13,
      });
      await page.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await page.waitFor(`globalThis.__pomodoro.timer.getState().status === "running"`);
      expect(await page.evaluate(`document.querySelector("#start-pause").textContent`)).toBe("Pause");

      await page.evaluate(`globalThis.__pomodoro.timer.pause()`);
      await page.evaluate(`globalThis.__pomodoro.timer.setDurations({ workSeconds: 1, breakSeconds: 2 })`);
      await page.evaluate(`document.querySelector("#start-pause").click()`);
      await page.waitFor(`globalThis.__pomodoro.timer.getState().mode === "break"`, 10_000);
      expect(
        await page.evaluate(`({
          mode: document.querySelector("#mode-label").textContent,
          time: document.querySelector("#time-display").textContent,
          status: document.querySelector("#status").textContent,
          alert: document.querySelector(".timer-card").classList.contains("is-complete")
        })`),
      ).toEqual({
        mode: "Break",
        time: "00:02",
        status: "Work session complete. Time for a break.",
        alert: true,
      });

      await page.evaluate(`document.querySelector("#reset").click()`);
      expect(await page.evaluate(`globalThis.__pomodoro.timer.getState()`)).toMatchObject({
        mode: "work",
        status: "idle",
        remainingSeconds: 1,
      });

      await page.evaluate(`document.querySelector("#start-pause").click()`);
      await page.evaluate(`{
        document.querySelector("#work-minutes").value = "2";
        document.querySelector("#break-minutes").value = "1";
        document.querySelector("#settings").requestSubmit();
      }`);
      expect(await page.evaluate(`globalThis.__pomodoro.timer.getState()`)).toEqual({
        mode: "work",
        status: "idle",
        remainingSeconds: 120,
        workSeconds: 120,
        breakSeconds: 60,
      });

      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 320,
        height: 640,
        deviceScaleFactor: 1,
        mobile: true,
      });
      expect(await page.evaluate(`document.documentElement.scrollWidth <= window.innerWidth`)).toBe(true);
    } finally {
      await page.close();
    }
  },
  60_000,
);
