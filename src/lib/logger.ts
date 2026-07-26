/**
 * Production-safe logging. Debug/info only in development.
 */
import { env } from "@/lib/env";

type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => {
    if (env.isDev) console.debug(...args);
  },
  info: (...args: LogArgs) => {
    if (env.isDev) console.info(...args);
  },
  warn: (...args: LogArgs) => {
    console.warn(...args);
  },
  error: (...args: LogArgs) => {
    console.error(...args);
  },
};
