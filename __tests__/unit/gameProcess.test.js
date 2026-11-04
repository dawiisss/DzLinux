const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { isGameRunning, waitForGameEnd } = require("../../src/main/game/gameProcess");

describe("gameProcess", () => {
  let procDir;

  const addProcess = (pid, cmdline) => {
    fs.mkdirSync(path.join(procDir, String(pid)));
    fs.writeFileSync(path.join(procDir, String(pid), "cmdline"), cmdline);
  };
  const removeProcess = (pid) => {
    fs.rmSync(path.join(procDir, String(pid)), { recursive: true });
  };
  const waitUntil = async (condition) => {
    for (let i = 0; i < 200 && !condition(); i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
  };

  beforeEach(() => {
    procDir = fs.mkdtempSync(path.join(os.tmpdir(), "dzlinux-proc-"));
  });

  afterEach(() => {
    fs.rmSync(procDir, { recursive: true, force: true });
  });

  describe("isGameRunning", () => {
    test("finds the game by executable and ignores other processes", async () => {
      addProcess(1, ["steam", "-applaunch", "221100", ""].join("\x00"));
      addProcess(5, ["zsh", "-c", "grep DayZ_x64.exe /tmp/notes; echo done", ""].join("\x00"));
      fs.mkdirSync(path.join(procDir, "sys"));
      expect(await isGameRunning(procDir)).toBe(false);

      addProcess(2, ["Z:\\steamapps\\common\\DayZ\\DayZ_x64.exe", "-connect=1.2.3.4", ""].join("\x00"));
      expect(await isGameRunning(procDir)).toBe(true);
    });

    test("finds the game as a Unix path argument of a launch wrapper", async () => {
      addProcess(6, ["python3", "/proton/proton", "waitforexitandrun", "/games/DayZ/DayZ_BE.exe", ""].join("\x00"));
      expect(await isGameRunning(procDir)).toBe(true);
    });

    test("skips processes whose cmdline cannot be read", async () => {
      fs.mkdirSync(path.join(procDir, "3"));
      expect(await isGameRunning(procDir)).toBe(false);
    });
  });

  describe("waitForGameEnd", () => {
    const fast = () => ({ procDir, pollIntervalMs: 5, startTimeoutMs: 60000 });

    test("waits for the game to start and then exit", async () => {
      const onEnded = jest.fn();
      waitForGameEnd(onEnded, fast());

      await new Promise((r) => setTimeout(r, 30));
      expect(onEnded).not.toHaveBeenCalled(); // Not started yet: still within the timeout.

      addProcess(4, "DayZ_x64.exe\x00");
      await new Promise((r) => setTimeout(r, 30));
      expect(onEnded).not.toHaveBeenCalled();

      removeProcess(4);
      await waitUntil(() => onEnded.mock.calls.length > 0);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    test("gives up when the game never starts", async () => {
      const onEnded = jest.fn();
      waitForGameEnd(onEnded, { procDir, pollIntervalMs: 5, startTimeoutMs: 0 });
      await waitUntil(() => onEnded.mock.calls.length > 0);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    test("stops waiting when the process list is unavailable", async () => {
      const onEnded = jest.fn();
      waitForGameEnd(onEnded, { procDir: path.join(procDir, "missing"), pollIntervalMs: 5 });
      await waitUntil(() => onEnded.mock.calls.length > 0);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });
  });
});
