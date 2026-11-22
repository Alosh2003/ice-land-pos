// ICE LAND local backend — structured logging
// JSON-formatted logs with request IDs for observability.
// Usage: import { getServerLogger } from "@/lib/server-logger"

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId: string;
  message: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env["LOG_LEVEL"] as LogLevel) || "info";

export function newRequestId(): string {
  return crypto.randomUUID();
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const levelNum = LOG_LEVELS[level];
  if (levelNum < LOG_LEVELS[MIN_LEVEL]) return;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    requestId: currentRequestId(),
    message,
    ...(data ?? {}),
  };
  console.log(JSON.stringify(entry));
}

// Simplified per-request ID storage (single-threaded dev server)
let currentId: string | undefined;

export function withRequestId<T>(requestId: string | undefined, fn: () => T): T {
  const prev = currentId;
  currentId = requestId;
  try { return fn(); } finally { currentId = prev; }
}

function currentRequestId(): string {
  return currentId ?? newRequestId();
}

export const serverLog = {
  debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
};

export { LogLevel };
