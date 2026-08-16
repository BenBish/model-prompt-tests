import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const sleep = (ms: number) => Bun.sleep(ms);

async function unusedPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a Chromium debugging port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();

  private constructor(private socket: WebSocket) {
    socket.addEventListener("message", async (event) => {
      const raw = typeof event.data === "string" ? event.data : await new Response(event.data).text();
      const message = JSON.parse(raw);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("could not connect to Chromium")), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async evaluate(expression: string): Promise<any> {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

function startStaticServer(root: string) {
  const mime: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
  };
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const relativePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
      const file = Bun.file(join(root, relativePath));
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file, { headers: { "content-type": mime[extname(relativePath)] ?? "application/octet-stream" } });
    },
  });
}

export async function launchPomodoroPage() {
  const chromium = Bun.which("chromium") ?? Bun.which("chromium-browser") ?? Bun.which("google-chrome");
  if (!chromium) throw new Error("Chromium is required for Pomodoro browser verification");

  const staticServer = startStaticServer(process.cwd());
  const debugPort = await unusedPort();
  const userDataDir = mkdtempSync(join(tmpdir(), "pomodoro-chromium-"));
  const processHandle = Bun.spawn(
    [
      chromium,
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );

  let target: { webSocketDebuggerUrl: string } | undefined;
  try {
    const appUrl = "http://127.0.0.1:" + staticServer.port + "/";
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const targetUrl =
          "http://127.0.0.1:" + debugPort + "/json/new?" + encodeURIComponent(appUrl);
        const response = await fetch(targetUrl, { method: "PUT" });
        if (response.ok) {
          target = await response.json();
          break;
        }
      } catch {
        // Chromium is still starting.
      }
      await sleep(100);
    }
    if (!target) throw new Error("Chromium debugging endpoint did not become ready");

    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await client.evaluate("document.readyState === 'complete' && Boolean(globalThis.__pomodoro)")) break;
      await sleep(100);
      if (attempt === 49) throw new Error("Pomodoro application did not mount");
    }

    return {
      evaluate: (expression: string) => client.evaluate(expression),
      send: (method: string, params?: Record<string, unknown>) => client.send(method, params),
      async waitFor(expression: string, timeoutMs = 5000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (await client.evaluate(expression)) return;
          await sleep(50);
        }
        throw new Error(`browser condition did not become true: ${expression}`);
      },
      async close() {
        client.close();
        processHandle.kill();
        await processHandle.exited;
        staticServer.stop(true);
        rmSync(userDataDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    processHandle.kill();
    await processHandle.exited;
    staticServer.stop(true);
    rmSync(userDataDir, { recursive: true, force: true });
    throw error;
  }
}
