import "server-only"

export const SESSION_COOKIE = "ml_visitor"
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export interface SessionCookieOptions {
  httpOnly: true
  secure: boolean
  sameSite: "lax"
  path: "/"
  maxAge: number
}

export function sessionCookieOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
