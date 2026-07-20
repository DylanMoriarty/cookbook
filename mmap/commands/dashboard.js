import fs from "fs";
import http from "http";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

export const meta = {
  usage: "dash [--port 8787] [--host 127.0.0.1] [--no-open]",
  description: "Launch the local DASHBOARD website",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_DIR = path.resolve(__dirname, "..", "dashboard");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function parseArgs(argv) {
  const parsed = {
    port: 8787,
    host: "127.0.0.1",
    open: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--port") {
      parsed.port = Number(argv[++i]);
      continue;
    }

    if (arg === "--host") {
      parsed.host = argv[++i];
      continue;
    }

    if (arg === "--no-open") {
      parsed.open = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: mmap ${meta.usage}`);
      process.exit(0);
    }

    console.error(`Unknown argument: ${arg}`);
    console.error(`Usage: mmap ${meta.usage}`);
    process.exit(1);
  }

  if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) {
    console.error("--port must be an integer between 1 and 65535.");
    process.exit(1);
  }

  return parsed;
}

function openBrowser(url) {
  const platform = process.platform;

  if (platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    return;
  }

  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    return;
  }

  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

function resolveFilePath(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const rawPath = decodeURIComponent(url.pathname);
  const relativePath = rawPath === "/" ? "/index.html" : rawPath;
  const normalized = path.normalize(relativePath).replace(/^([.][.][\\/])+/, "");

  return path.join(DASHBOARD_DIR, normalized);
}

function serveFile(filePath, res) {
  if (!filePath.startsWith(DASHBOARD_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      const code = err.code === "ENOENT" ? 404 : 500;
      const message = code === 404 ? "Not Found" : "Internal Server Error";
      res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(message);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

export function execute(args, opts = {}) {
  const { dryRun = false } = opts;

  if (!fs.existsSync(DASHBOARD_DIR)) {
    console.error(`DASHBOARD folder not found at: ${DASHBOARD_DIR}`);
    process.exit(1);
  }

  const parsed = parseArgs(args);
  const url = `http://${parsed.host}:${parsed.port}`;

  if (dryRun) {
    console.log(`\n→ start dashboard server at ${url} (root: ${DASHBOARD_DIR})\n`);
    return;
  }

  const server = http.createServer((req, res) => {
    const filePath = resolveFilePath(req.url || "/");
    serveFile(filePath, res);
  });

  server.listen(parsed.port, parsed.host, () => {
    console.log(`Dashboard running at ${url}`);
    console.log("Press Ctrl+C to stop.");

    if (parsed.open) {
      openBrowser(url);
    }
  });

  server.on("error", (err) => {
    console.error(`Failed to start dashboard server: ${err.message}`);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}
