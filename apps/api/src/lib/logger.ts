import type { Request } from 'express'

type LogLevel = 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG'

function emit(level: LogLevel, tag: string, reqOrMessage: Request | string, args: unknown[]): void {
  if (typeof reqOrMessage === 'string') {
    console.log(`${level} [${tag}] ${reqOrMessage}`, ...args)
  } else {
    const id = reqOrMessage.requestId
    const prefix = id ? `${level} [${tag}](${id})` : `${level} [${tag}]`
    const [message, ...extra] = args as [string, ...unknown[]]
    console.log(`${prefix} ${message}`, ...extra)
  }
}

export interface Logger {
  error(req: Request, message: string, ...extra: unknown[]): void
  error(message: string, ...extra: unknown[]): void
  warning(req: Request, message: string, ...extra: unknown[]): void
  warning(message: string, ...extra: unknown[]): void
  info(req: Request, message: string, ...extra: unknown[]): void
  info(message: string, ...extra: unknown[]): void
  debug(req: Request, message: string, ...extra: unknown[]): void
  debug(message: string, ...extra: unknown[]): void
}

/**
 * Returns a logger tagged with the given label. Each method maps to a log level:
 *
 *   log.info(req, message)   → INFO [tag](requestId) message
 *   log.warning(message)     → WARNING [tag] message
 *   log.error(req, msg, err) → ERROR [tag](requestId) msg  { err }
 */
export function createLogger(tag: string): Logger {
  return {
    error(reqOrMessage: Request | string, ...args: unknown[]) {
      emit('ERROR', tag, reqOrMessage as Request, args)
    },
    warning(reqOrMessage: Request | string, ...args: unknown[]) {
      emit('WARNING', tag, reqOrMessage as Request, args)
    },
    info(reqOrMessage: Request | string, ...args: unknown[]) {
      emit('INFO', tag, reqOrMessage as Request, args)
    },
    debug(reqOrMessage: Request | string, ...args: unknown[]) {
      emit('DEBUG', tag, reqOrMessage as Request, args)
    },
  }
}
