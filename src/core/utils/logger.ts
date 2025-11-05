import { isDevelopmentMode } from "./env";

type LogLevel = "debug" | "info" | "warn" | "error" | "log";

export type LoggerOptions = {
  component: string; // e.g. useChatController, Chat.tsx, SettingsPage
  fn?: string; // optional function scope
};

export interface Logger {
  debug: (message?: any, ...optionalParams: any[]) => void;
  info: (message?: any, ...optionalParams: any[]) => void;
  warn: (message?: any, ...optionalParams: any[]) => void;
  error: (message?: any, ...optionalParams: any[]) => void;
  log: (message?: any, ...optionalParams: any[]) => void;
  with: (ctx: Partial<LoggerOptions>) => Logger;
}

let _enabled = isDevelopmentMode();

export function setLoggingEnabled(enabled: boolean) {
  _enabled = enabled;
}

export function isLoggingEnabled() {
  return _enabled;
}

function fmtPrefix(level: LogLevel, opts: LoggerOptions): string {
  const ts = new Date();
  const hh = `${ts.getHours()}`.padStart(2, "0");
  const mm = `${ts.getMinutes()}`.padStart(2, "0");
  const ss = `${ts.getSeconds()}`.padStart(2, "0");
  const scope = opts.fn ? `${opts.component}/${opts.fn}` : opts.component;
  return `[${hh}:${mm}:${ss}] ${scope} ${level.toUpperCase()}`;
}

function write(level: LogLevel, opts: LoggerOptions, args: any[]) {
  if (!_enabled) return;
  const method: (...data: any[]) => void = (console as any)[level] || console.log;
  method(fmtPrefix(level, opts), ...args);
}

const disabledLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {},
  with: () => disabledLogger,
};

export function logManager(options: LoggerOptions): Logger {
  if (!_enabled) return disabledLogger;

  const base: LoggerOptions = { component: options.component, fn: options.fn };

  const logger: Logger = {
    debug: (message?: any, ...rest: any[]) => write("debug", base, [message, ...rest]),
    info: (message?: any, ...rest: any[]) => write("info", base, [message, ...rest]),
    warn: (message?: any, ...rest: any[]) => write("warn", base, [message, ...rest]),
    error: (message?: any, ...rest: any[]) => write("error", base, [message, ...rest]),
    log: (message?: any, ...rest: any[]) => write("log", base, [message, ...rest]),
    with: (ctx: Partial<LoggerOptions>) =>
      logManager({ component: ctx.component ?? base.component, fn: ctx.fn ?? base.fn }),
  };

  return logger;
}

// Optional: allow runtime toggling via devtools
// @ts-ignore
if (typeof window !== "undefined") (window as any).__setDevLogs = setLoggingEnabled;
