// Errors whose message is safe to show to the user. Anything else is logged
// and replaced with a generic message (see toActionError).

export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'PAYMENT'

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }

export function toActionError(err: unknown): { ok: false; error: string } {
  if (err instanceof AppError) return { ok: false, error: err.message }
  console.error('[action] unexpected error', err)
  return { ok: false, error: 'Something went wrong. Please try again.' }
}
