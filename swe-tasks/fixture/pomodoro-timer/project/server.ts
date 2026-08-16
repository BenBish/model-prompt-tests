import { extname, join, normalize } from "node:path";

const root = import.meta.dir;
const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const url = new URL(request.url);
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const relativePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
    const file = Bun.file(join(root, relativePath));
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, {
      headers: { "content-type": mimeTypes[extname(relativePath)] ?? "application/octet-stream" },
    });
  },
});

console.log(`Pomodoro fixture listening on http://localhost:${server.port}`);
