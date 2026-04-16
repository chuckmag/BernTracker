import type { Request } from 'express'

export const Log = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
} as const

export type LogLevel = (typeof Log)[keyof typeof Log]

/**
 * Returns a log function tagged with the given label.
 *
 * With a request:    log(level, req, message)  → LEVEL [tag](requestId) message
 * Without a request: log(level, message)        → LEVEL [tag] message
 *
 * Any additional arguments are forwarded to console.log (e.g. error objects).
 */
export function createLogger(tag: string) {
  function log(level: LogLevel, req: Request, message: string, ...extra: unknown[]): void
  function log(level: LogLevel, message: string, ...extra: unknown[]): void
  function log(level: LogLevel, reqOrMessage: Request | string, ...args: unknown[]): void {
    if (typeof reqOrMessage === 'string') {
      console.log(`${level} [${tag}] ${reqOrMessage}`, ...args)
    } else {
      const id = reqOrMessage.requestId
      const prefix = id ? `${level} [${tag}](${id})` : `${level} [${tag}]`
      const [message, ...extra] = args as [string, ...unknown[]]
      console.log(`${prefix} ${message}`, ...extra)
    }
  }
  return log
}
